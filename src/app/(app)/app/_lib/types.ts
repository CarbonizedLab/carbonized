import type { ChainEvent } from '@/lib/onchain-events';
import type { CarbonCredit } from '@/types/carb';

export type Methodology = CarbonCredit['methodology'];

export type ProfileKind = 'company' | 'trader' | 'none';

export interface GlobalStats {
  mintedTonnes: number;
  retiredTonnes: number;
  activeCredits: number;
}

export interface PoolSnapshot {
  methodology: Methodology;
  /** Total CCT supply of the pool, in tonnes. */
  supply: number;
  /** Connected wallet's CCT balance, in tonnes (0 when not connected). */
  balance: number;
}

export interface EmissionTotals {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  target: number;
}

export interface WalletProfile {
  kind: ProfileKind;
  name?: string;
  verified: boolean;
  emissions: EmissionTotals | null;
}

export interface PricePoint {
  /** Unix seconds. */
  timestamp: number;
  price: number;
}

export type PriceSource = 'oracle' | 'market' | 'demo';

export interface DashboardData {
  /** Wallet this snapshot was loaded for (undefined when not connected). */
  account: string | undefined;
  /** Unix seconds when this snapshot finished loading. */
  syncedAt: number;
  stats: GlobalStats | null;
  /** Sum of CCT totalSupply across configured pools; null when none are configured. */
  wrappedSupply: number | null;
  pools: PoolSnapshot[];
  usdcBalance: number | null;
  activeOrders: number | null;
  activeAuctions: number | null;
  /** Oracle price, or null when the oracle has no fresh price. */
  oraclePrice: number | null;
  /** The oracle price was reported manually (fallback reporter) instead of by Chainlink Functions; null when unknown. */
  oracleManual: boolean | null;
  priceHistory: PricePoint[];
  events: ChainEvent[];
  credits: CarbonCredit[];
  walletRetiredTonnes: number;
  profile: WalletProfile | null;
  errors: string[];
}

export interface ReadinessItem {
  id: 'wallet' | 'registered' | 'kyb' | 'credits' | 'emissions' | 'offset';
  weight: number;
  earned: number;
  done: boolean;
  href: string;
}

export interface Readiness {
  /** 0-100, computed over the signals that apply to the wallet's profile. */
  score: number;
  items: ReadinessItem[];
}

export interface WeekBucket {
  label: string;
  minted: number;
  retired: number;
}

export interface DayBucket {
  label: string;
  volume: number;
  tonnes: number;
}
