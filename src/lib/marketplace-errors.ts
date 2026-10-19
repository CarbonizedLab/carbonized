/** Revert reasons emitted by CarbonMarketplace that the UI shows friendly messages for. */
export type MarketplaceRevert =
  | 'priceBelowMinimum'
  | 'sellerCannotBid'
  | 'cannotFillOwnOrder';

const REVERT_REASONS: readonly (readonly [string, MarketplaceRevert])[] = [
  ['price below minimum', 'priceBelowMinimum'],
  ['seller cannot bid', 'sellerCannotBid'],
  ['cannot fill own order', 'cannotFillOwnOrder'],
];

const MAX_CAUSE_DEPTH = 5;

interface ErrorLike {
  cause?: unknown;
  details?: string;
  message?: string;
  reason?: string;
  shortMessage?: string;
}

/**
 * Finds a known CarbonMarketplace revert reason anywhere in a (viem/wagmi) error chain.
 * Returns null when the error is not one of the mapped reverts.
 */
export const getMarketplaceRevert = (
  error: unknown
): MarketplaceRevert | null => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== 'object') {
      return null;
    }
    const err = current as ErrorLike;
    const haystack =
      `${err.reason ?? ''} ${err.shortMessage ?? ''} ${err.details ?? ''} ${err.message ?? ''}`.toLowerCase();
    for (const [reason, key] of REVERT_REASONS) {
      if (haystack.includes(reason)) {
        return key;
      }
    }
    current = err.cause;
  }
  return null;
};
