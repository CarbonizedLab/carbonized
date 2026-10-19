import { format } from 'date-fns';
import type { ChainEvent } from '@/lib/onchain-events';
import type {
  DayBucket,
  PricePoint,
  PriceSource,
  Readiness,
  ReadinessItem,
  WalletProfile,
  WeekBucket,
} from './types';

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = SECONDS_PER_DAY * 7;
export const WEEKS_SHOWN = 8;
export const DAYS_SHOWN = 7;
const MAX_PRICE_POINTS = 30;
const MIN_SERIES_POINTS = 2;
/** Reference USD/tonne shown (and labelled as an estimate) when the oracle has no fresh price. */
export const FALLBACK_PRICE = 18.5;

/** Shape of the illustrative series shown only when no real price data exists. */
const DEMO_PRICE_SHAPE = [0.92, 0.95, 0.94, 0.98, 1.01, 0.99, 1] as const;

/** Rolling 7-day windows ending now, oldest first; bucketed by event timestamp. */
export const buildWeeklyBuckets = (
  events: ChainEvent[],
  nowSec: number
): WeekBucket[] => {
  const buckets: WeekBucket[] = Array.from({ length: WEEKS_SHOWN }, (_, i) => ({
    label: format(
      new Date((nowSec - (WEEKS_SHOWN - i) * SECONDS_PER_WEEK) * 1000),
      'MMM d'
    ),
    minted: 0,
    retired: 0,
  }));
  for (const event of events) {
    if (event.kind !== 'mint' && event.kind !== 'retire') {
      continue;
    }
    const age = nowSec - event.timestamp;
    const index = WEEKS_SHOWN - 1 - Math.floor(age / SECONDS_PER_WEEK);
    const bucket = buckets[index];
    if (age < 0 || !bucket || event.timestamp === 0) {
      continue;
    }
    if (event.kind === 'mint') {
      bucket.minted += event.tonnes ?? 0;
    } else {
      bucket.retired += event.tonnes ?? 0;
    }
  }
  return buckets;
};

/** USD volume and tonnes per day for the last 7 days, from `order_filled` events. */
export const buildDailyVolume = (
  events: ChainEvent[],
  nowSec: number
): DayBucket[] => {
  const buckets: DayBucket[] = Array.from({ length: DAYS_SHOWN }, (_, i) => ({
    label: format(
      new Date((nowSec - (DAYS_SHOWN - 1 - i) * SECONDS_PER_DAY) * 1000),
      'MMM d'
    ),
    volume: 0,
    tonnes: 0,
  }));
  for (const event of events) {
    if (event.kind !== 'order_filled' || event.timestamp === 0) {
      continue;
    }
    const age = nowSec - event.timestamp;
    const bucket = buckets[DAYS_SHOWN - 1 - Math.floor(age / SECONDS_PER_DAY)];
    if (age < 0 || !bucket) {
      continue;
    }
    bucket.volume += event.usd ?? 0;
    bucket.tonnes += event.tonnes ?? 0;
  }
  return buckets;
};

export interface PriceSeries {
  points: { label: string; price: number }[];
  source: PriceSource;
  /** Percent change first -> last point; undefined for demo data. */
  change?: number;
}

const toLabeled = (points: PricePoint[]) =>
  points.slice(-MAX_PRICE_POINTS).map((point) => ({
    label: format(new Date(point.timestamp * 1000), 'MMM d HH:mm'),
    price: point.price,
  }));

const percentChange = (points: { price: number }[]): number | undefined => {
  const first = points.at(0)?.price;
  const last = points.at(-1)?.price;
  if (!(first && last)) {
    return;
  }
  return ((last - first) / first) * 100;
};

/** Implied prices (USD per tonne) from fills, falling back to posted order prices. */
const marketPrices = (events: ChainEvent[]): PricePoint[] => {
  const fills: PricePoint[] = [];
  const posted: PricePoint[] = [];
  for (const event of events) {
    if (event.timestamp === 0 || !event.usd) {
      continue;
    }
    if (event.kind === 'order_filled' && event.tonnes) {
      fills.push({
        timestamp: event.timestamp,
        price: event.usd / event.tonnes,
      });
    } else if (event.kind === 'order_created') {
      posted.push({ timestamp: event.timestamp, price: event.usd });
    }
  }
  const chosen = fills.length >= MIN_SERIES_POINTS ? fills : posted;
  // Events are newest first; charts read left to right.
  return chosen.reverse();
};

export const buildPriceSeries = (
  oracleHistory: PricePoint[],
  events: ChainEvent[],
  referencePrice: number,
  nowSec: number
): PriceSeries => {
  if (oracleHistory.length >= MIN_SERIES_POINTS) {
    const points = toLabeled(oracleHistory);
    return { points, source: 'oracle', change: percentChange(points) };
  }
  const market = marketPrices(events);
  if (market.length >= MIN_SERIES_POINTS) {
    const points = toLabeled(market);
    return { points, source: 'market', change: percentChange(points) };
  }
  return {
    source: 'demo',
    points: DEMO_PRICE_SHAPE.map((factor, i) => ({
      label: format(
        new Date(
          (nowSec - (DEMO_PRICE_SHAPE.length - 1 - i) * SECONDS_PER_DAY) * 1000
        ),
        'MMM d'
      ),
      price: Number((referencePrice * factor).toFixed(2)),
    })),
  };
};

interface ReadinessInput {
  isConnected: boolean;
  profile: WalletProfile | null;
  hasCredits: boolean;
  retiredTonnes: number;
}

const WEIGHTS = {
  wallet: 10,
  registered: 20,
  kyb: 20,
  credits: 15,
  emissions: 15,
  offset: 20,
} as const;

const item = (
  id: ReadinessItem['id'],
  earnedShare: number,
  href: string
): ReadinessItem => ({
  id,
  weight: WEIGHTS[id],
  earned: WEIGHTS[id] * earnedShare,
  done: earnedShare >= 1,
  href,
});

/** Share (0-1) of onchain emissions already offset by retired credits. */
export const offsetCoverage = (
  retiredTonnes: number,
  emissionsTotal: number
): number =>
  emissionsTotal > 0 ? Math.min(retiredTonnes / emissionsTotal, 1) : 0;

/**
 * Readiness score from real signals. Traders are not scored on emissions or
 * offsetting, so the score is normalised over the signals that apply.
 */
export const computeReadiness = ({
  isConnected,
  profile,
  hasCredits,
  retiredTonnes,
}: ReadinessInput): Readiness => {
  const registered = profile !== null && profile.kind !== 'none';
  const emissionsTotal = profile?.emissions?.total ?? 0;
  const items: ReadinessItem[] = [
    item('wallet', isConnected ? 1 : 0, '/app'),
    item('registered', registered ? 1 : 0, '/app/company/register'),
    item('kyb', profile?.verified ? 1 : 0, '/app/settings'),
    item('credits', hasCredits ? 1 : 0, '/app/credit-requests'),
  ];
  if (profile?.kind !== 'trader') {
    items.push(
      item('emissions', emissionsTotal > 0 ? 1 : 0, '/app/emissions'),
      item(
        'offset',
        offsetCoverage(retiredTonnes, emissionsTotal),
        '/app/carbon-wallet'
      )
    );
  }
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  const earned = items.reduce((sum, entry) => sum + entry.earned, 0);
  return { score: Math.round((earned / total) * 100), items };
};
