import type { TranslateFn } from '@/lib/i18n';

export interface AuctionItem {
  id: string;
  seller: string;
  quantity: number;
  startingPrice: number;
  currentBid: number;
  /** Exact payment-token base units (display floats above are for rendering only). */
  startingPriceWei: bigint;
  currentBidWei: bigint;
  paymentDecimals: number;
  highestBidder: string;
  startTime: number;
  endTime: number;
  status: 'active' | 'ended' | 'cancelled';
}

export interface BidHistoryEntry {
  id: string;
  bidder: string;
  amount: number;
  blockNumber: bigint;
}

export type AuctionUserRole = 'seller' | 'highest-bidder' | 'outbid' | 'none';

export type AuctionFilter =
  | 'all'
  | 'active'
  | 'ending-soon'
  | 'my-bids'
  | 'my-auctions';

export const AUCTION_FILTERS: ReadonlyArray<{
  key: AuctionFilter;
  labelKey: string;
}> = [
  { key: 'all', labelKey: 'filter.all' },
  { key: 'active', labelKey: 'filter.active' },
  { key: 'ending-soon', labelKey: 'filter.ending-soon' },
  { key: 'my-bids', labelKey: 'filter.my-bids' },
  { key: 'my-auctions', labelKey: 'filter.my-auctions' },
];

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

export const isSameAddress = (a: string, b?: string): boolean =>
  Boolean(b) && a.toLowerCase() === b?.toLowerCase();

export const getUserRole = (
  auction: AuctionItem,
  address: string | undefined,
  history: BidHistoryEntry[] | undefined
): AuctionUserRole => {
  if (!address) {
    return 'none';
  }
  if (isSameAddress(auction.seller, address)) {
    return 'seller';
  }
  if (isSameAddress(auction.highestBidder, address)) {
    return 'highest-bidder';
  }
  if (history?.some((entry) => isSameAddress(entry.bidder, address))) {
    return 'outbid';
  }
  return 'none';
};

/** Live countdown string, e.g. `2d 4h left`, `3h 12m 05s left`, `4m 09s left`. */
export const formatTimeLeft = (secondsLeft: number, t: TranslateFn): string => {
  if (secondsLeft <= 0) {
    return t('time.ended');
  }
  const days = Math.floor(secondsLeft / SECONDS_PER_DAY);
  const hours = Math.floor((secondsLeft % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (secondsLeft % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const seconds = Math.floor(secondsLeft % SECONDS_PER_MINUTE);
  const pad = (value: number) => String(value).padStart(2, '0');

  if (days > 0) {
    return t('time.daysLeft', { days, hours });
  }
  if (hours > 0) {
    return t('time.hoursLeft', {
      hours,
      minutes: pad(minutes),
      seconds: pad(seconds),
    });
  }
  return t('time.minutesLeft', { minutes, seconds: pad(seconds) });
};

export const USER_REJECTION_PATTERN = /user rejected|denied|cancelled/;

interface WalletError {
  shortMessage?: string;
  message?: string;
}

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const { shortMessage, message } = error as WalletError;
    return shortMessage || message || fallback;
  }
  return fallback;
};
