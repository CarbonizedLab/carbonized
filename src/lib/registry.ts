import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  formatUnits,
  type Hash,
  type Hex,
  keccak256,
  type PublicClient,
  parseUnits,
  toHex,
  UserRejectedRequestError,
  type WalletClient,
} from 'viem';
import { ABI_CARBON_REGISTRY, CONTRACTS } from '@/config/contracts';
import { getLogsClient } from '@/lib/logs-client';
import { resolveFromBlock } from '@/lib/onchain-events';
import { writeContractOnTargetChain } from '@/lib/wallet-write';

const TONNE_DECIMALS = 18;
const TONNE_PRECISION = 6;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;

/** Company profile as stored in the CarbonRegistry (emissions in tonnes CO2e). */
export interface OnchainCompany {
  name: string;
  legalId: string;
  /** keccak256(abi.encode(email, phone, salt)); the contact details themselves are never onchain. */
  contactHash: Hex;
  scope1: number;
  scope2: number;
  scope3: number;
  target: number;
  verified: boolean;
  /** Unix seconds */
  registeredAt: number;
  /** Unix seconds */
  updatedAt: number;
}

export interface OnchainTrader {
  name: string;
  /** keccak256(abi.encode(email, phone, salt)); the contact details themselves are never onchain. */
  contactHash: Hex;
  country: string;
  walletAddress: string;
  /** Unix seconds */
  registrationDate: number;
  isActive: boolean;
}

/** Contact details kept in THIS browser only; the chain stores just their salted hash. */
export interface ContactRecord {
  email: string;
  phone: string;
  salt: Hex;
}

const CONTACT_STORAGE_PREFIX = 'carb-contact:';
const SALT_BYTES = 32;

export const generateContactSalt = (): Hex =>
  toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));

/** Same encoding the registry documents: keccak256(abi.encode(string email, string phone, bytes32 salt)). */
export const computeContactHash = (
  email: string,
  phone: string,
  salt: Hex
): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'bytes32' }],
      [email, phone, salt]
    )
  );

/** Remembers the plaintext behind a published contact hash (browser local storage only). */
export const saveContactRecord = (
  account: string,
  record: ContactRecord
): void => {
  try {
    window.localStorage.setItem(
      `${CONTACT_STORAGE_PREFIX}${account.toLowerCase()}`,
      JSON.stringify(record)
    );
  } catch {
    // storage unavailable (private mode): the hash onchain stays valid
  }
};

export type RegistrationType = 'company' | 'trader' | 'none';

const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'none',
  'company',
  'trader',
];

export const isRegistryConfigured = (): boolean =>
  ADDRESS_PATTERN.test(CONTRACTS.carbonRegistry) &&
  !ZERO_ADDRESS_PATTERN.test(CONTRACTS.carbonRegistry);

/** Whole/decimal tonnes -> 18-decimal wei amount (negative and NaN clamp to 0). */
export const tonnesToWei = (tonnes: number): bigint =>
  parseUnits(
    (Number.isFinite(tonnes) ? Math.max(tonnes, 0) : 0).toFixed(
      TONNE_PRECISION
    ),
    TONNE_DECIMALS
  );

const weiToTonnes = (wei: bigint): number =>
  Number(formatUnits(wei, TONNE_DECIMALS));

/** Extracts a human readable message from a viem/wallet error. */
export const registryErrorMessage = (error: unknown): string => {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return 'Transaction was rejected in your wallet.';
    }
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError
    );
    if (revert instanceof ContractFunctionRevertedError && revert.reason) {
      return revert.reason;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Unknown error';
};

export const readRegistrationType = async (
  publicClient: PublicClient,
  account: string
): Promise<RegistrationType> => {
  const index = await publicClient.readContract({
    address: CONTRACTS.carbonRegistry,
    abi: ABI_CARBON_REGISTRY,
    functionName: 'registrationTypeOf',
    args: [account as `0x${string}`],
  });
  return REGISTRATION_TYPES[Number(index)] ?? 'none';
};

/** Returns null when the address is not a registered company. */
export const readCompany = async (
  publicClient: PublicClient,
  account: string
): Promise<OnchainCompany | null> => {
  const [
    name,
    legalId,
    contactHash,
    scope1,
    scope2,
    scope3,
    target,
    verified,
    registeredAt,
    updatedAt,
  ] = await publicClient.readContract({
    address: CONTRACTS.carbonRegistry,
    abi: ABI_CARBON_REGISTRY,
    functionName: 'getCompanyData',
    args: [account as `0x${string}`],
  });
  if (registeredAt === 0n) {
    return null;
  }
  return {
    name,
    legalId,
    contactHash,
    scope1: weiToTonnes(scope1),
    scope2: weiToTonnes(scope2),
    scope3: weiToTonnes(scope3),
    target: weiToTonnes(target),
    verified,
    registeredAt: Number(registeredAt),
    updatedAt: Number(updatedAt),
  };
};

/** Returns null when the address is not a registered trader. */
export const readTrader = async (
  publicClient: PublicClient,
  account: string
): Promise<OnchainTrader | null> => {
  const [name, contactHash, country, registrationDate, isActive] =
    await publicClient.readContract({
      address: CONTRACTS.carbonRegistry,
      abi: ABI_CARBON_REGISTRY,
      functionName: 'getTraderData',
      args: [account as `0x${string}`],
    });
  if (registrationDate === 0n) {
    return null;
  }
  return {
    name,
    contactHash,
    country,
    walletAddress: account,
    registrationDate: Number(registrationDate),
    isActive,
  };
};

export const readEmissions = async (
  publicClient: PublicClient,
  account: string
): Promise<{
  scope1: number;
  scope2: number;
  scope3: number;
  totalTarget: number;
}> => {
  const [scope1, scope2, scope3, target] = await publicClient.readContract({
    address: CONTRACTS.carbonRegistry,
    abi: ABI_CARBON_REGISTRY,
    functionName: 'getCompanyEmissions',
    args: [account as `0x${string}`],
  });
  return {
    scope1: weiToTonnes(scope1),
    scope2: weiToTonnes(scope2),
    scope3: weiToTonnes(scope3),
    totalTarget: weiToTonnes(target),
  };
};

export type RegistryWrite =
  | {
      functionName: 'registerCompany';
      args: readonly [string, string, bigint, bigint, bigint, Hex];
    }
  | {
      functionName: 'updateCompanyProfile';
      args: readonly [string, string, Hex];
    }
  | { functionName: 'updateEmissions'; args: readonly [bigint, bigint, bigint] }
  | { functionName: 'setEmissionTarget'; args: readonly [bigint] }
  | {
      functionName: 'setCompanyVerified';
      args: readonly [`0x${string}`, boolean, Hex];
    }
  | {
      functionName: 'registerTrader';
      args: readonly [string, Hex, string];
    };

interface SendRegistryTxParams {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: `0x${string}`;
  call: RegistryWrite;
}

/**
 * Simulates, sends and waits for a registry transaction. Throws an Error with a
 * readable message on revert/rejection; resolves with the tx hash once mined.
 */
export const sendRegistryTx = async ({
  publicClient,
  walletClient,
  account,
  call,
}: SendRegistryTxParams): Promise<Hash> => {
  if (!isRegistryConfigured()) {
    throw new Error(
      'Carbon Registry is not configured (NEXT_PUBLIC_CARBON_REGISTRY).'
    );
  }
  try {
    const { request } = await publicClient.simulateContract({
      address: CONTRACTS.carbonRegistry,
      abi: ABI_CARBON_REGISTRY,
      account,
      ...call,
    } as never);
    const hash = await writeContractOnTargetChain(walletClient, request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      throw new Error('Transaction reverted onchain.');
    }
    return hash;
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};

/** One reported emissions snapshot (tonnes CO2e). */
export interface EmissionPoint {
  /** Unix seconds */
  timestamp: number;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
}

const LOG_INITIAL_CHUNK = 50_000n;
const LOG_MIN_CHUNK = 500n;

/** Runs `fetchRange` over [from, to] in chunks, halving the chunk when the RPC rejects a range. */
export const collectChunked = async <T>(
  from: bigint,
  to: bigint,
  fetchRange: (start: bigint, end: bigint) => Promise<T[]>
): Promise<T[]> => {
  const results: T[] = [];
  let chunk = LOG_INITIAL_CHUNK;
  let start = from;
  while (start <= to) {
    const end = start + chunk - 1n > to ? to : start + chunk - 1n;
    try {
      results.push(...(await fetchRange(start, end)));
      start = end + 1n;
    } catch (error) {
      if (chunk <= LOG_MIN_CHUNK) {
        throw error;
      }
      chunk /= 2n;
    }
  }
  return results;
};

/**
 * Rebuilds a company's reported emissions history from registry logs
 * (CompanyRegistered + EmissionsUpdated), oldest first.
 */
export const readEmissionHistory = async (
  publicClient: PublicClient,
  account: string,
  registeredAt: number
): Promise<EmissionPoint[]> => {
  const latest = await publicClient.getBlockNumber();
  const from = resolveFromBlock(latest);
  const company = account as `0x${string}`;
  const [registered, updates] = await Promise.all([
    collectChunked(from, latest, (start, end) =>
      getLogsClient(publicClient).getContractEvents({
        address: CONTRACTS.carbonRegistry,
        abi: ABI_CARBON_REGISTRY,
        eventName: 'CompanyRegistered',
        args: { company },
        fromBlock: start,
        toBlock: end,
      })
    ),
    collectChunked(from, latest, (start, end) =>
      getLogsClient(publicClient).getContractEvents({
        address: CONTRACTS.carbonRegistry,
        abi: ABI_CARBON_REGISTRY,
        eventName: 'EmissionsUpdated',
        args: { company },
        fromBlock: start,
        toBlock: end,
      })
    ),
  ]);

  const points: EmissionPoint[] = [];
  for (const log of registered) {
    const { scope1, scope2, scope3 } = log.args;
    if (scope1 === undefined || scope2 === undefined || scope3 === undefined) {
      continue;
    }
    points.push({
      timestamp: registeredAt,
      scope1: weiToTonnes(scope1),
      scope2: weiToTonnes(scope2),
      scope3: weiToTonnes(scope3),
      total: weiToTonnes(scope1 + scope2 + scope3),
    });
  }
  for (const log of updates) {
    const { scope1, scope2, scope3, total, timestamp } = log.args;
    if (
      scope1 === undefined ||
      scope2 === undefined ||
      scope3 === undefined ||
      total === undefined ||
      timestamp === undefined
    ) {
      continue;
    }
    points.push({
      timestamp: Number(timestamp),
      scope1: weiToTonnes(scope1),
      scope2: weiToTonnes(scope2),
      scope3: weiToTonnes(scope3),
      total: weiToTonnes(total),
    });
  }
  return points;
};
