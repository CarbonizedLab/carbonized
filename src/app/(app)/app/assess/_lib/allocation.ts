import type { CarbonCredit } from '@/types/carb';

export type Methodology = CarbonCredit['methodology'];

export const METHODOLOGIES: readonly Methodology[] = [
  'VERRA_VCS',
  'GOLD_STANDARD',
  'ICM_COMPLIANCE',
] as const;

export interface Allocation {
  /** Non-retired NFT tonnes. */
  eligible: number;
  /** This year's emissions, i.e. the internal offset needed. */
  need: number;
  /** Credits assigned to offset emissions. */
  covered: number;
  /** Emissions that eligible credits cannot cover. */
  shortfall: number;
  /** Surplus above the offset need. */
  surplus: number;
  /** Surplus held back for future years. */
  reserve: number;
  /** Surplus that can be wrapped and sold. */
  sellable: number;
  /** Null when no emissions are logged. */
  coveragePct: number | null;
}

const PERCENT = 100;

/**
 * Splits eligible credits into offset / reserve / sellable.
 * `reservePct` is the share (0-100) of the surplus to hold back.
 */
export const computeAllocation = (
  eligible: number,
  need: number,
  reservePct: number
): Allocation => {
  const covered = Math.min(eligible, need);
  const shortfall = Math.max(0, need - eligible);
  const surplus = Math.max(0, eligible - need);
  const clamped = Math.min(PERCENT, Math.max(0, reservePct));
  const reserve = (surplus * clamped) / PERCENT;
  return {
    eligible,
    need,
    covered,
    shortfall,
    surplus,
    reserve,
    sellable: surplus - reserve,
    coveragePct: need > 0 ? (covered / need) * PERCENT : null,
  };
};

export interface MethodologySummary {
  methodology: Methodology;
  count: number;
  eligible: number;
  retired: number;
}

export const summarizeByMethodology = (
  credits: readonly CarbonCredit[]
): MethodologySummary[] => {
  const summaries: MethodologySummary[] = METHODOLOGIES.map((methodology) => ({
    methodology,
    count: 0,
    eligible: 0,
    retired: 0,
  }));
  for (const credit of credits) {
    const entry = summaries.find(
      (summary) => summary.methodology === credit.methodology
    );
    if (!entry) {
      continue;
    }
    entry.count += 1;
    if (credit.isRetired) {
      entry.retired += credit.co2Tonnes;
    } else {
      entry.eligible += credit.co2Tonnes;
    }
  }
  return summaries;
};
