import {
  type CctPool,
  getPoolForMethodology,
  isPoolConfigured,
} from '@/config/cct-pools';
import type { CarbonCredit } from '@/types/carb';

/** Why `CarbonCreditToken.wrapCredit` would not accept a credit (read-only mirror of the contract). */
export type WrapBlocker =
  | 'retired' // "Cannot wrap retired credit"
  | 'empty' // "Empty credit": zero tonnes
  | 'no-serial' // "Unverified credit": empty registry serial
  | 'no-proof' // "Unverified credit": zero oracle proof hash
  | 'unknown-methodology' // no CCT pool exists for this methodology label ("Methodology mismatch")
  | 'no-pool'; // the pool for this methodology is not deployed / configured here

const ZERO_HASH_PATTERN = /^0x0{64}$/;

/**
 * Applies the same rules as `CarbonCreditToken._wrap` (methodology match, not retired, non-zero
 * tonnes, non-empty serial, non-zero oracle proof) without sending a transaction. Returns the
 * first failing rule, or null when the credit can be wrapped.
 *
 * `pool` is the CCT pool the wrap would go to; pass `undefined` when no pool matches the credit's
 * methodology label.
 */
export const getWrapBlocker = (
  credit: Pick<
    CarbonCredit,
    'isRetired' | 'co2Tonnes' | 'serialNumber' | 'oracleProofHash'
  >,
  pool: CctPool | undefined
): WrapBlocker | null => {
  if (!pool) {
    return 'unknown-methodology';
  }
  if (!isPoolConfigured(pool)) {
    return 'no-pool';
  }
  if (credit.isRetired) {
    return 'retired';
  }
  if (!(credit.co2Tonnes > 0)) {
    return 'empty';
  }
  if (credit.serialNumber.length === 0) {
    return 'no-serial';
  }
  if (ZERO_HASH_PATTERN.test(credit.oracleProofHash)) {
    return 'no-proof';
  }
  return null;
};

/** Convenience: resolves the pool from the credit's methodology label, then checks it. */
export const getCreditWrapBlocker = (
  credit: CarbonCredit
): { pool: CctPool | undefined; blocker: WrapBlocker | null } => {
  const pool = getPoolForMethodology(credit.methodology);
  return { pool, blocker: getWrapBlocker(credit, pool) };
};
