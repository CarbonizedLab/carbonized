import { formatUnits, type PublicClient, parseAbi, parseUnits } from 'viem';

/**
 * Exact (bigint) token-unit math for the trade flow.
 *
 * - CCT (Carbon Credit Token) is always 18 decimals; tonnes are "wei" of CCT.
 * - The payment token has `decimals()` that must be READ from the
 *   token (6 on Robinhood Chain mainnet). Prices are denominated in payment-token
 *   base units per tonne; `cost = amount * price / 1e18`.
 * - Floats are only ever used to DISPLAY values, never to build amounts that go
 *   into approvals or transactions.
 */

export const CCT_DECIMALS = 18;
const TONNE_SCALE = 10n ** 18n;
const MAX_DECIMALS = 36;
const DECIMAL_INPUT_REGEX = /^(\d*)(?:\.(\d*))?$/;

/** Parses a user-typed decimal string. Returns null for empty, malformed, zero-precision overflow or non-positive input. */
export const parseAmountInput = (
  value: string,
  decimals: number
): bigint | null => {
  const trimmed = value.trim();
  const match = DECIMAL_INPUT_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, whole = '', fraction = ''] = match;
  if (whole.length === 0 && fraction.length === 0) {
    return null;
  }
  // Never silently round what the user typed: reject extra precision.
  if (fraction.length > decimals) {
    return null;
  }
  const parsed = parseUnits(`${whole || '0'}.${fraction || '0'}`, decimals);
  return parsed > 0n ? parsed : null;
};

/** Exact decimal string for a token amount (no float round-trip). */
export const formatAmountInput = (wei: bigint, decimals: number): string =>
  formatUnits(wei, decimals);

/** Float for DISPLAY only. */
export const toDisplayNumber = (wei: bigint, decimals: number): number =>
  Number(formatUnits(wei, decimals));

const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator;

/**
 * Payment-token amount needed to take `amountWei` CCT at `priceWei` (payment
 * base units per tonne). Rounded UP so an approval of exactly this value always
 * covers the contract's (floor or ceil) integer cost.
 */
export const orderCostCeil = (amountWei: bigint, priceWei: bigint): bigint =>
  ceilDiv(amountWei * priceWei, TONNE_SCALE);

const ERC20_DECIMALS_ABI = parseAbi([
  'function decimals() view returns (uint8)',
]);

/** Payment-token amount the contract pays out for `amountWei` at `priceWei` (rounded down). */
export const orderCostFloor = (amountWei: bigint, priceWei: bigint): bigint =>
  (amountWei * priceWei) / TONNE_SCALE;

const decimalsCache = new Map<string, Promise<number>>();

/**
 * Reads `decimals()` of an ERC-20 once per (chain, token) and caches it. A
 * failed read is not cached and is thrown so callers fail closed instead of
 * guessing 18.
 */
export const readTokenDecimals = (
  client: PublicClient,
  token: `0x${string}`
): Promise<number> => {
  const key = `${client.chain?.id ?? 0}:${token.toLowerCase()}`;
  const cached = decimalsCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = client
    .readContract({
      address: token,
      abi: ERC20_DECIMALS_ABI,
      functionName: 'decimals',
    })
    .then((value) => {
      const decimals = Number(value);
      if (!Number.isInteger(decimals) || decimals > MAX_DECIMALS) {
        throw new Error(`Unsupported token decimals: ${decimals}`);
      }
      return decimals;
    })
    .catch((error: unknown) => {
      decimalsCache.delete(key);
      throw error;
    });
  decimalsCache.set(key, pending);
  return pending;
};
