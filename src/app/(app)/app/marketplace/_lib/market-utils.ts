import type { TranslateFn } from '@/lib/i18n';
import { CCT_DECIMALS, toDisplayNumber } from '@/lib/token-units';
import type { Order } from '@/types/carb';

/** The contract stores `type(uint256).max` for "never expires"; anything beyond this is treated as such. */
const NEVER_EXPIRES_SECONDS = 1e12;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const EXPIRING_SOON_SECONDS = SECONDS_PER_DAY;
const DUST = 1e-9;

export interface OrderRow {
  id: number;
  trader: string;
  isBuyOrder: boolean;
  amount: number;
  filled: number;
  available: number;
  pricePerTonne: number;
  /** Exact onchain values; amounts that reach a transaction come from these, never from the floats above. */
  availableWei: bigint;
  priceWei: bigint;
  paymentDecimals: number;
  createdAt: number;
  /** Unix seconds, or null when the order never expires. */
  expiresAt: number | null;
  requiresKYC: boolean;
  isActive: boolean;
}

export const toOrderRow = (order: Order): OrderRow => {
  const availableWei =
    order.amountWei > order.filledWei ? order.amountWei - order.filledWei : 0n;
  return {
    id: Number(order.orderId),
    trader: order.trader,
    isBuyOrder: order.isBuyOrder,
    amount: order.amount,
    filled: order.filled,
    available: toDisplayNumber(availableWei, CCT_DECIMALS),
    pricePerTonne: order.pricePerTonne,
    availableWei,
    priceWei: order.priceWei,
    paymentDecimals: order.paymentDecimals,
    createdAt: Number(order.createdAt),
    expiresAt:
      Number(order.expiresAt) >= NEVER_EXPIRES_SECONDS
        ? null
        : Number(order.expiresAt),
    requiresKYC: Boolean(order.requiresKYC),
    isActive: Boolean(order.isActive),
  };
};

export type OrderStatus =
  | 'open'
  | 'partial'
  | 'filled'
  | 'cancelled'
  | 'expired';

export const isExpired = (row: OrderRow, nowSec: number): boolean =>
  row.expiresAt !== null && row.expiresAt <= nowSec;

export const getOrderStatus = (row: OrderRow, nowSec: number): OrderStatus => {
  if (!row.isActive) {
    return row.available <= DUST ? 'filled' : 'cancelled';
  }
  if (isExpired(row, nowSec)) {
    return 'expired';
  }
  return row.filled > DUST ? 'partial' : 'open';
};

/** Orders anyone can still fill. */
export const isFillable = (row: OrderRow, nowSec: number): boolean =>
  row.isActive && row.available > DUST && !isExpired(row, nowSec);

export type SortKey = 'id' | 'price' | 'available' | 'expiry';
export type SortDir = 'asc' | 'desc';

const EXPIRY_NEVER_SORT = Number.MAX_SAFE_INTEGER;

const SORT_VALUE: Record<SortKey, (row: OrderRow) => number> = {
  id: (row) => row.id,
  price: (row) => row.pricePerTonne,
  available: (row) => row.available,
  expiry: (row) => row.expiresAt ?? EXPIRY_NEVER_SORT,
};

export const sortOrders = (
  rows: OrderRow[],
  key: SortKey,
  dir: SortDir
): OrderRow[] => {
  const value = SORT_VALUE[key];
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => (value(a) - value(b)) * factor);
};

export type ChipKey = 'all' | 'partial' | 'expiring' | 'kyc';

export const CHIP_KEYS: readonly ChipKey[] = [
  'all',
  'partial',
  'expiring',
  'kyc',
] as const;

const CHIP_PREDICATE: Record<
  ChipKey,
  (row: OrderRow, nowSec: number) => boolean
> = {
  all: () => true,
  partial: (row) => row.filled > DUST,
  expiring: (row, nowSec) =>
    row.expiresAt !== null && row.expiresAt - nowSec <= EXPIRING_SOON_SECONDS,
  kyc: (row) => row.requiresKYC,
};

export const applyChip = (
  rows: OrderRow[],
  chip: ChipKey,
  nowSec: number
): OrderRow[] => rows.filter((row) => CHIP_PREDICATE[chip](row, nowSec));

export const matchesSearch = (row: OrderRow, term: string): boolean => {
  if (!term) {
    return true;
  }
  const needle = term.trim().toLowerCase().replace('#', '');
  return row.trader.toLowerCase().includes(needle) || String(row.id) === needle;
};

export interface MarketSummary {
  count: number;
  volume: number;
  /** Volume-weighted average price per tonne. */
  avgPrice: number;
  bestPrice: number | null;
}

export const summarize = (listings: OrderRow[]): MarketSummary => {
  let volume = 0;
  let notional = 0;
  let bestPrice: number | null = null;
  for (const row of listings) {
    volume += row.available;
    notional += row.available * row.pricePerTonne;
    if (bestPrice === null || row.pricePerTonne < bestPrice) {
      bestPrice = row.pricePerTonne;
    }
  }
  return {
    count: listings.length,
    volume,
    avgPrice: volume > 0 ? notional / volume : 0,
    bestPrice,
  };
};

/** Relative expiry such as "in 3d", "in 5h", "in 12m" or "Expired". */
export const formatExpiry = (
  expiresAt: number | null,
  nowSec: number,
  t: TranslateFn
): string => {
  if (expiresAt === null) {
    return t('expiry.never');
  }
  const remaining = expiresAt - nowSec;
  if (remaining <= 0) {
    return t('expiry.expired');
  }
  if (remaining >= SECONDS_PER_DAY) {
    return t('expiry.days', { n: Math.floor(remaining / SECONDS_PER_DAY) });
  }
  if (remaining >= SECONDS_PER_HOUR) {
    return t('expiry.hours', { n: Math.floor(remaining / SECONDS_PER_HOUR) });
  }
  return t('expiry.minutes', {
    n: Math.max(1, Math.floor(remaining / SECONDS_PER_MINUTE)),
  });
};

export const fillPercent = (row: OrderRow): number =>
  row.amount > 0 ? Math.min(100, (row.filled / row.amount) * 100) : 0;

const WALLET_REJECTION_PATTERN =
  /user rejected|user denied|rejected the request/i;

export const isWalletRejection = (error: unknown): boolean => {
  const err = error as { message?: string; shortMessage?: string } | null;
  return WALLET_REJECTION_PATTERN.test(
    `${err?.shortMessage ?? ''} ${err?.message ?? ''}`
  );
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const { message, shortMessage } = error as {
      message?: string;
      shortMessage?: string;
    };
    return shortMessage || message || fallback;
  }
  return fallback;
};
