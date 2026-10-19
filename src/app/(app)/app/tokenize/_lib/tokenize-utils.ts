import { type Chain, type PublicClient, parseAbi } from 'viem';
import {
  CCT_POOL_LIST,
  type CctPool,
  isPoolConfigured,
} from '@/config/cct-pools';
import { ABI_CARBON_CREDIT_NFT, CONTRACTS } from '@/config/contracts';
import { targetChain } from '@/config/wagmi';
import { creditFromTuple } from '@/lib/credit-decode';
import { getCreditWrapBlocker, type WrapBlocker } from '@/lib/wrap-eligibility';
import type { CarbonCredit } from '@/types/carb';

const MAX_CAUSE_DEPTH = 6;
const USER_REJECTED_CODE = 4001;
const REJECTION_PATTERN =
  /user rejected|user denied|rejected the request|request rejected|denied transaction/i;
const REVERT_REASON_PATTERN =
  /reverted with (?:the following )?reason:\s*(.+)/i;
const NEW_LINE_PATTERN = /\r?\n/;

const POOL_ABI = parseAbi([
  'function getUserWrappedNFTs(address user) view returns (uint256[])',
]);

interface ErrorLike {
  name?: string;
  code?: number;
  message?: string;
  shortMessage?: string;
  cause?: unknown;
}

/** True when the wallet user dismissed / rejected the request (any depth of viem error cause chain). */
export const isUserRejection = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    const err = current as ErrorLike;
    if (
      err.code === USER_REJECTED_CODE ||
      err.name === 'UserRejectedRequestError' ||
      REJECTION_PATTERN.test(err.shortMessage ?? err.message ?? '')
    ) {
      return true;
    }
    current = err.cause;
  }
  return false;
};

/** Best human-readable reason for a failed transaction (revert reason when available). */
export const getTxErrorMessage = (error: unknown, fallback: string): string => {
  const err = (error ?? {}) as ErrorLike;
  const raw = err.shortMessage ?? err.message ?? '';
  const reason = REVERT_REASON_PATTERN.exec(raw)?.[1];
  if (reason) {
    return reason.trim();
  }
  const firstLine = raw.split(NEW_LINE_PATTERN)[0]?.trim();
  return firstLine || fallback;
};

/** Block-explorer URL for a transaction hash, or null when the network has no explorer. */
export const getTxUrl = (hash: string): string | null => {
  const base = (targetChain as Chain).blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
};

export interface CreditEligibility {
  pool: CctPool | null;
  /** Why the credit cannot be tokenized (same rules as `CarbonCreditToken.wrapCredit`), if it cannot. */
  blocked: WrapBlocker | null;
}

export const getEligibility = (credit: CarbonCredit): CreditEligibility => {
  const { pool, blocker } = getCreditWrapBlocker(credit);
  return { pool: pool ?? null, blocked: blocker };
};

export interface PoolGroup {
  pool: CctPool;
  credits: CarbonCredit[];
  tonnes: number;
}

/** Groups credits by the pooled token they wrap into (1 NFT tonne = 1 CCT). */
export const groupByPool = (credits: CarbonCredit[]): PoolGroup[] => {
  const groups = new Map<string, PoolGroup>();
  for (const credit of credits) {
    const { pool } = getEligibility(credit);
    if (!pool) {
      continue;
    }
    const group = groups.get(pool.methodology) ?? {
      pool,
      credits: [],
      tonnes: 0,
    };
    group.credits.push(credit);
    group.tonnes += credit.co2Tonnes;
    groups.set(pool.methodology, group);
  }
  return [...groups.values()];
};

export interface WrappedCredit {
  pool: CctPool;
  credit: CarbonCredit;
}

const readWrappedIds = async (
  client: PublicClient,
  pool: CctPool,
  user: string
): Promise<number[]> => {
  try {
    const ids = await client.readContract({
      address: pool.address,
      abi: POOL_ABI,
      functionName: 'getUserWrappedNFTs',
      args: [user as `0x${string}`],
    });
    return ids.map(Number);
  } catch {
    return [];
  }
};

const readCredit = async (
  client: PublicClient,
  tokenId: number
): Promise<CarbonCredit | null> => {
  try {
    const details = await client.readContract({
      address: CONTRACTS.carbonCreditNFT,
      abi: ABI_CARBON_CREDIT_NFT,
      functionName: 'credits',
      args: [BigInt(tokenId)],
    });
    return creditFromTuple(tokenId, details);
  } catch {
    return null;
  }
};

/** NFTs the user has locked in the pooled CCT contracts (candidates for unwrap). */
export const fetchWrappedCredits = async (
  client: PublicClient,
  user: string
): Promise<WrappedCredit[]> => {
  const pools = CCT_POOL_LIST.filter(isPoolConfigured);
  const perPool = await Promise.all(
    pools.map(async (pool) => {
      const ids = await readWrappedIds(client, pool, user);
      const credits = await Promise.all(
        ids.map((id) => readCredit(client, id))
      );
      const wrapped: WrappedCredit[] = [];
      for (const credit of credits) {
        if (credit) {
          wrapped.push({ pool, credit });
        }
      }
      return wrapped;
    })
  );
  return perPool.flat();
};

const AMOUNT_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

export const formatAmount = (value: number): string =>
  AMOUNT_FORMAT.format(value);
