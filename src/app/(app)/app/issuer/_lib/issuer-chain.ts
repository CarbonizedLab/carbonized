import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  parseEventLogs,
  type TransactionReceipt,
  type WalletClient,
  zeroAddress,
  zeroHash,
} from 'viem';
import { ABI_CARBON_CREDIT_NFT, CONTRACTS } from '@/config/contracts';
import { getLogsClient } from '@/lib/logs-client';
import { resolveFromBlock, scanCoversDeployment } from '@/lib/onchain-events';
import { collectChunked, registryErrorMessage } from '@/lib/registry';
import { writeContractOnTargetChain } from '@/lib/wallet-write';
import {
  type CreditData,
  DEFAULT_ADMIN_ROLE,
  isConfiguredAddress,
  NATIVE_ISSUER_ROLE,
} from './issuer-utils';

const NFT = CONTRACTS.carbonCreditNFT;
const MAX_PARALLEL_READS = 8;
export const RECENT_ISSUANCE_LIMIT = 50;

export const isNftConfigured = (): boolean => isConfiguredAddress(NFT);

export interface TxContext {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface NftRoles {
  isIssuer: boolean;
  isAdmin: boolean;
  paused: boolean;
}

export const readNftRoles = async (
  publicClient: PublicClient,
  account: Address
): Promise<NftRoles> => {
  const [isIssuer, isAdmin, paused] = await Promise.all([
    publicClient.readContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'hasRole',
      args: [NATIVE_ISSUER_ROLE, account],
    }),
    publicClient.readContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'hasRole',
      args: [DEFAULT_ADMIN_ROLE, account],
    }),
    publicClient.readContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'paused',
    }),
  ]);
  return { isIssuer, isAdmin, paused };
};

export const readHasIssuerRole = (
  publicClient: PublicClient,
  account: Address
): Promise<boolean> =>
  publicClient.readContract({
    address: NFT,
    abi: ABI_CARBON_CREDIT_NFT,
    functionName: 'hasRole',
    args: [NATIVE_ISSUER_ROLE, account],
  });

/**
 * Authoritative double-counting check: the contract canonicalises the serial itself
 * (trim + upper-case), the methodology argument is ignored onchain.
 */
export const readSerialTokenized = (
  publicClient: PublicClient,
  serialNumber: string
): Promise<boolean> =>
  publicClient.readContract({
    address: NFT,
    abi: ABI_CARBON_CREDIT_NFT,
    functionName: 'isSerialTokenized',
    args: ['', serialNumber],
  });

/** Runs `task` over `items` with at most `MAX_PARALLEL_READS` in flight, keeping result order. */
export const mapLimited = async <T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_READS, items.length) }, worker)
  );
  return results;
};

export interface IssuerEntry {
  address: Address;
  grantedBlock: bigint;
  grantedBy: Address;
}

export interface IssuerList {
  issuers: IssuerEntry[];
  /** False when only a recent block window was scanned (set NEXT_PUBLIC_DEPLOY_BLOCK for full history). */
  fullHistory: boolean;
}

/**
 * Rebuilds the public issuer list from `RoleGranted` / `RoleRevoked` logs for NATIVE_ISSUER_ROLE,
 * then confirms each remaining address with `hasRole` (the logs only suggest candidates).
 */
export const fetchIssuerList = async (
  publicClient: PublicClient
): Promise<IssuerList> => {
  const latest = await publicClient.getBlockNumber();
  const from = resolveFromBlock(latest);
  const logsClient = getLogsClient(publicClient);
  const [granted, revoked] = await Promise.all([
    collectChunked(from, latest, (start, end) =>
      logsClient.getContractEvents({
        address: NFT,
        abi: ABI_CARBON_CREDIT_NFT,
        eventName: 'RoleGranted',
        args: { role: NATIVE_ISSUER_ROLE },
        fromBlock: start,
        toBlock: end,
      })
    ),
    collectChunked(from, latest, (start, end) =>
      logsClient.getContractEvents({
        address: NFT,
        abi: ABI_CARBON_CREDIT_NFT,
        eventName: 'RoleRevoked',
        args: { role: NATIVE_ISSUER_ROLE },
        fromBlock: start,
        toBlock: end,
      })
    ),
  ]);

  const candidates = new Map<string, IssuerEntry>();
  for (const log of granted) {
    const { account, sender } = log.args;
    if (account && sender) {
      candidates.set(account.toLowerCase(), {
        address: account,
        grantedBlock: log.blockNumber,
        grantedBy: sender,
      });
    }
  }
  for (const log of revoked) {
    const { account } = log.args;
    const key = account?.toLowerCase();
    const entry = key ? candidates.get(key) : undefined;
    if (key && entry && log.blockNumber >= entry.grantedBlock) {
      candidates.delete(key);
    }
  }

  const entries = [...candidates.values()];
  const active = await mapLimited(entries, (entry) =>
    readHasIssuerRole(publicClient, entry.address)
  );
  const issuers = entries
    .filter((_, index) => active[index])
    .sort((a, b) => Number(a.grantedBlock - b.grantedBlock));
  return { issuers, fullHistory: scanCoversDeployment(from) };
};

export interface IssuedCredit {
  tokenId: bigint;
  recipient: Address;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  /** Credits minted by the same `batchMint` call, when the transaction was a batch. */
  batchSize?: number;
  projectName: string;
  projectId: string;
  serialNumber: string;
  methodology: string;
  vintageYear: number;
  tonnes: bigint;
  issuer: Address;
  issuedAt: number;
  hasProof: boolean;
  isRetired: boolean;
}

export interface IssuedCreditsResult {
  credits: IssuedCredit[];
  /** Total matching credits found (before the display limit). */
  total: number;
  fullHistory: boolean;
}

/**
 * Latest credits created by `CreditMinted` events (optionally for one recipient: `recipient` is an
 * indexed topic, so the RPC filters server-side), enriched from `credits(tokenId)`.
 */
export const fetchIssuedCredits = async (
  publicClient: PublicClient,
  recipient?: Address
): Promise<IssuedCreditsResult> => {
  const latest = await publicClient.getBlockNumber();
  const from = resolveFromBlock(latest);
  const logsClient = getLogsClient(publicClient);
  const [minted, batches] = await Promise.all([
    collectChunked(from, latest, (start, end) =>
      logsClient.getContractEvents({
        address: NFT,
        abi: ABI_CARBON_CREDIT_NFT,
        eventName: 'CreditMinted',
        args: recipient ? { recipient } : undefined,
        fromBlock: start,
        toBlock: end,
      })
    ),
    collectChunked(from, latest, (start, end) =>
      logsClient.getContractEvents({
        address: NFT,
        abi: ABI_CARBON_CREDIT_NFT,
        eventName: 'CreditBatchMinted',
        fromBlock: start,
        toBlock: end,
      })
    ),
  ]);

  const batchSizeByTx = new Map<string, number>();
  for (const log of batches) {
    batchSizeByTx.set(log.transactionHash, log.args.tokenIds?.length ?? 0);
  }

  const newest = [...minted]
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? b.logIndex - a.logIndex
        : Number(b.blockNumber - a.blockNumber)
    )
    .slice(0, RECENT_ISSUANCE_LIMIT);

  const credits = await mapLimited(newest, async (log) => {
    const tokenId = log.args.tokenId ?? 0n;
    const details = await publicClient.readContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'credits',
      args: [tokenId],
    });
    const item: IssuedCredit = {
      tokenId,
      recipient: log.args.recipient ?? zeroAddress,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      batchSize: batchSizeByTx.get(log.transactionHash),
      projectId: details[0],
      projectName: details[1],
      methodology: details[2],
      tonnes: details[3],
      vintageYear: Number(details[4]),
      issuer: details[8],
      issuedAt: Number(details[11]),
      isRetired: details[10],
      serialNumber: details[12],
      hasProof: details[6] !== zeroHash,
    };
    return item;
  });
  return {
    credits,
    total: minted.length,
    fullHistory: scanCoversDeployment(from),
  };
};

// ---------------------------------------------------------------------------
// Writes (always simulated first so revert reasons surface before the wallet prompt)
// ---------------------------------------------------------------------------

const broadcast = async (
  ctx: TxContext,
  request: unknown,
  onSubmitted?: (hash: Hash) => void
): Promise<TransactionReceipt> => {
  const hash = await writeContractOnTargetChain(ctx.walletClient, request);
  onSubmitted?.(hash);
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted onchain.');
  }
  return receipt;
};

/** Token ids minted by `batchMint` in a receipt (only logs emitted by the NFT contract count). */
export const batchTokenIdsFromReceipt = (
  receipt: TransactionReceipt
): bigint[] =>
  parseEventLogs({
    abi: ABI_CARBON_CREDIT_NFT,
    eventName: 'CreditBatchMinted',
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === NFT.toLowerCase()
    ),
  }).flatMap((log) => [...log.args.tokenIds]);

export interface MintCreditArgs {
  to: Address;
  projectId: string;
  data: CreditData;
}

export interface MintResult {
  receipt: TransactionReceipt;
  tokenIds: bigint[];
}

/** `mintCredit` (NATIVE_ISSUER_ROLE). Resolves with the minted token id once the receipt is in. */
export const sendMintCredit = async (
  ctx: TxContext,
  { to, projectId, data }: MintCreditArgs,
  onSubmitted?: (hash: Hash) => void
): Promise<MintResult> => {
  try {
    const { request } = await ctx.publicClient.simulateContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'mintCredit',
      account: ctx.account,
      args: [
        to,
        projectId,
        data.projectName,
        data.serialNumber,
        data.methodology,
        data.co2Tonnes,
        data.vintageYear,
        data.geography,
        data.oracleProofHash,
        data.satelliteDataCID,
        data.tokenURI,
      ],
    });
    const receipt = await broadcast(ctx, request, onSubmitted);
    const minted = parseEventLogs({
      abi: ABI_CARBON_CREDIT_NFT,
      eventName: 'CreditMinted',
      logs: receipt.logs,
    });
    return {
      receipt,
      tokenIds: minted.map((log) => log.args.tokenId),
    };
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};

/** `batchMint` (NATIVE_ISSUER_ROLE): one project, one recipient, at most MAX_CREDITS_PER_TX credits. */
export const sendBatchMint = async (
  ctx: TxContext,
  to: Address,
  projectId: string,
  credits: readonly CreditData[],
  onSubmitted?: (hash: Hash) => void
): Promise<MintResult> => {
  try {
    const { request } = await ctx.publicClient.simulateContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'batchMint',
      account: ctx.account,
      args: [to, projectId, [...credits]],
    });
    const receipt = await broadcast(ctx, request, onSubmitted);
    return { receipt, tokenIds: batchTokenIdsFromReceipt(receipt) };
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};

/** `grantRole` / `revokeRole` for NATIVE_ISSUER_ROLE (DEFAULT_ADMIN_ROLE only). */
export const sendIssuerRoleChange = async (
  ctx: TxContext,
  functionName: 'grantRole' | 'revokeRole',
  target: Address,
  onSubmitted?: (hash: Hash) => void
): Promise<TransactionReceipt> => {
  try {
    const { request } = await ctx.publicClient.simulateContract({
      address: NFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName,
      account: ctx.account,
      args: [NATIVE_ISSUER_ROLE, target],
    });
    return await broadcast(ctx, request, onSubmitted);
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};

/** True when `address` has contract code (a multisig / smart account) rather than being a plain key. */
export const isContractAccount = async (
  publicClient: PublicClient,
  address: Address
): Promise<boolean> => {
  const code: Hex | undefined = await publicClient.getCode({ address });
  return code !== undefined && code !== '0x';
};

export interface TargetLookup {
  /** The address currently holds NATIVE_ISSUER_ROLE. */
  holds: boolean;
  /** The address has contract code (multisig / smart account) rather than being a plain key. */
  isContract: boolean;
}

export const readTargetLookup = async (
  publicClient: PublicClient,
  address: Address
): Promise<TargetLookup> => {
  const [holds, isContract] = await Promise.all([
    readHasIssuerRole(publicClient, address),
    isContractAccount(publicClient, address),
  ]);
  return { holds, isContract };
};
