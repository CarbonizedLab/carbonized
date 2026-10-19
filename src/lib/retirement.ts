import {
  type Address,
  type Hash,
  type PublicClient,
  parseAbi,
  parseEventLogs,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { CONTRACTS } from '@/config/contracts';
import { registryErrorMessage } from '@/lib/registry';
import { writeContractOnTargetChain } from '@/lib/wallet-write';

const WAD = 1e18;
/** `CarbonCreditNFT.batchRetire` rejects batches above this size. */
export const MAX_RETIRE_BATCH = 50;
const CERT_TX_PREFIX_LENGTH = 8;

const NFT_RETIRE_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function credits(uint256 tokenId) view returns (string projectId, string projectName, string methodology, uint256 co2Tonnes, uint256 vintageYear, string geography, bytes32 oracleProofHash, string satelliteDataCID, address verificationSource, uint256 verificationDate, bool isRetired, uint256 issuanceDate, string serialNumber)',
  'function retirementCertificates(uint256 tokenId) view returns (uint256 originalTokenId, address retiredBy, uint256 retirementDate, string retirementReason, uint256 co2Tonnes)',
  'function retireCredit(uint256 tokenId, string reason)',
  'function batchRetire(uint256[] tokenIds, string reason)',
  'event CreditRetired(uint256 indexed tokenId, address indexed retiredBy, uint256 timestamp, uint256 co2Tonnes, string reason)',
]);

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export const isTxHash = (value: string): value is Hash =>
  TX_HASH_PATTERN.test(value);

const nftAddress = (): Address => {
  if (!ADDRESS_PATTERN.test(CONTRACTS.carbonCreditNFT)) {
    throw new Error(
      'Carbon Credit NFT contract is not configured (NEXT_PUBLIC_CARBON_CREDIT_NFT).'
    );
  }
  return CONTRACTS.carbonCreditNFT;
};

/** Deterministic, publicly derivable certificate number: `KRB-<tokenId>-<first 8 hex of tx>`. */
export const buildCertificateId = (tokenId: bigint, txHash: string): string =>
  `KRB-${tokenId.toString().padStart(6, '0')}-${txHash
    .slice(2, 2 + CERT_TX_PREFIX_LENGTH)
    .toUpperCase()}`;

/** Public verification link for a retirement transaction. */
export const certificatePath = (txHash: string, tokenId?: bigint): string =>
  tokenId === undefined
    ? `/app/certificates/${txHash}`
    : `/app/certificates/${txHash}?token=${tokenId}`;

export interface CreditSnapshot {
  projectId: string;
  projectName: string;
  methodology: string;
  vintageYear: number;
  geography: string;
  serialNumber: string;
}

/**
 * `issuer-backed`: the credit carries issuer metadata (real project id + serial).
 * `unbacked`: registration/demo credits (project id `REG`, no serial) or an
 * unreadable credit record. A retirement certificate for these proves only that
 * a token was burned, not that any real-world tonne was offset.
 */
export type CreditProvenance = 'issuer-backed' | 'unbacked';

const UNBACKED_PROJECT_ID = 'REG';

export const classifyProvenance = (
  credit: CreditSnapshot | null
): CreditProvenance =>
  !credit ||
  credit.projectId === UNBACKED_PROJECT_ID ||
  credit.serialNumber === ''
    ? 'unbacked'
    : 'issuer-backed';

export interface RetirementCertificateData {
  certificateId: string;
  tokenId: bigint;
  txHash: Hash;
  blockNumber?: bigint;
  /** Unix seconds. */
  timestamp: number;
  beneficiary: Address;
  tonnes: number;
  /** Free text chosen by the retirer; unverified. */
  reason: string;
  credit: CreditSnapshot | null;
  provenance: CreditProvenance;
  /**
   * `true` only when the NFT contract's stored certificate was read AND matches the
   * event; `false` on mismatch; `null` when the record could not be read (never
   * presented as verified).
   */
  stateVerified: boolean | null;
}

export const readCreditSnapshot = async (
  client: PublicClient,
  tokenId: bigint
): Promise<CreditSnapshot | null> => {
  try {
    const result = await client.readContract({
      address: nftAddress(),
      abi: NFT_RETIRE_ABI,
      functionName: 'credits',
      args: [tokenId],
    });
    return {
      projectId: result[0],
      projectName: result[1],
      methodology: result[2],
      vintageYear: Number(result[4]),
      geography: result[5],
      serialNumber: result[12],
    };
  } catch {
    return null;
  }
};

/**
 * Reads the NFT contract's stored retirement certificate and compares it to the
 * event data. Fails closed: a read error (retried once) yields `null`, never `true`.
 */
const checkStoredCertificate = async (
  client: PublicClient,
  tokenId: bigint,
  beneficiary: Address,
  tonnesWei: bigint
): Promise<boolean | null> => {
  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const stored = await client.readContract({
        address: nftAddress(),
        abi: NFT_RETIRE_ABI,
        functionName: 'retirementCertificates',
        args: [tokenId],
      });
      return (
        stored[0] === tokenId &&
        stored[1].toLowerCase() === beneficiary.toLowerCase() &&
        stored[4] === tonnesWei
      );
    } catch {
      // retry once, then report "could not verify"
    }
  }
  return null;
};

export type RetirementVerification =
  | { status: 'verified'; certificates: RetirementCertificateData[] }
  | { status: 'not-found' }
  | { status: 'reverted' }
  | { status: 'not-retirement' };

/**
 * Re-reads the transaction receipt from the chain and rebuilds every
 * retirement certificate it contains. Only `CreditRetired` logs emitted by the
 * configured NFT contract count, and each is cross-checked against the
 * contract's stored `retirementCertificates` record.
 */
export const verifyRetirementTx = async (
  client: PublicClient,
  txHash: Hash
): Promise<RetirementVerification> => {
  const nft = nftAddress();
  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    return { status: 'not-found' };
  }
  if (receipt.status !== 'success') {
    return { status: 'reverted' };
  }
  const logs = parseEventLogs({
    abi: NFT_RETIRE_ABI,
    eventName: 'CreditRetired',
    logs: receipt.logs,
  }).filter((log) => log.address.toLowerCase() === nft.toLowerCase());
  if (logs.length === 0) {
    return { status: 'not-retirement' };
  }
  const certificates = await Promise.all(
    logs.map(async (log) => {
      const { tokenId, retiredBy, timestamp, co2Tonnes, reason } = log.args;
      const [credit, stateVerified] = await Promise.all([
        readCreditSnapshot(client, tokenId),
        checkStoredCertificate(client, tokenId, retiredBy, co2Tonnes),
      ]);
      return {
        certificateId: buildCertificateId(tokenId, txHash),
        tokenId,
        txHash,
        blockNumber: receipt.blockNumber,
        timestamp: Number(timestamp),
        beneficiary: retiredBy,
        tonnes: Number(co2Tonnes) / WAD,
        reason,
        credit,
        provenance: classifyProvenance(credit),
        stateVerified,
      } satisfies RetirementCertificateData;
    })
  );
  return { status: 'verified', certificates };
};

interface RetireParams {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: Address;
  tokenIds: bigint[];
  reason: string;
}

/** Throws a descriptive error for the first token the wallet cannot retire. */
const assertRetirable = async (
  client: PublicClient,
  account: Address,
  tokenIds: bigint[]
): Promise<void> => {
  const nft = nftAddress();
  await Promise.all(
    tokenIds.map(async (tokenId) => {
      let owner: Address;
      try {
        owner = await client.readContract({
          address: nft,
          abi: NFT_RETIRE_ABI,
          functionName: 'ownerOf',
          args: [tokenId],
        });
      } catch {
        throw new Error(
          `Credit #${tokenId} does not exist or was already retired.`
        );
      }
      if (owner.toLowerCase() !== account.toLowerCase()) {
        throw new Error(
          `Credit #${tokenId} is not held by your wallet. If it is wrapped into CCT, unwrap it first.`
        );
      }
    })
  );
};

/**
 * Retires NFT credits onchain (burns them and emits `CreditRetired`).
 * Uses `retireCredit` for one token and `batchRetire` for several. Resolves
 * with the transaction hash once mined; throws on any failure.
 */
export const retireNftCredits = async ({
  walletClient,
  publicClient,
  account,
  tokenIds,
  reason,
}: RetireParams): Promise<Hash> => {
  const cleanReason = reason.trim();
  const ids = [...new Set(tokenIds)];
  if (ids.length === 0) {
    throw new Error('Select at least one credit to retire.');
  }
  if (ids.length > MAX_RETIRE_BATCH) {
    throw new Error(
      `You can retire at most ${MAX_RETIRE_BATCH} credits at once.`
    );
  }
  if (!cleanReason) {
    throw new Error('A retirement reason is required.');
  }
  await assertRetirable(publicClient, account, ids);

  const address = nftAddress();
  const [firstId] = ids;
  try {
    const hash =
      ids.length === 1 && firstId !== undefined
        ? await writeContractOnTargetChain(walletClient, {
            address,
            abi: NFT_RETIRE_ABI,
            functionName: 'retireCredit',
            args: [firstId, cleanReason],
            account,
            chain: walletClient.chain,
          })
        : await writeContractOnTargetChain(walletClient, {
            address,
            abi: NFT_RETIRE_ABI,
            functionName: 'batchRetire',
            args: [ids, cleanReason],
            account,
            chain: walletClient.chain,
          });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('The retirement transaction was reverted onchain.');
    }
    return hash;
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};
