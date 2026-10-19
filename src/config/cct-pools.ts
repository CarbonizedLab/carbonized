import { CONTRACTS } from '@/config/contracts';
import type { CarbonCredit } from '@/types/carb';

export type Methodology = CarbonCredit['methodology'];

export interface CctPool {
  methodology: Methodology;
  /** ERC-20 symbol as deployed (CCT-VCS, CCT-GS, CCT-ICM). */
  symbol: string;
  /** Short standard name for UI chips. */
  standard: string;
  address: `0x${string}`;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_REGEX = /^0x0{40}$/;

const toAddress = (value?: string): `0x${string}` =>
  (value && value !== '0x' ? value : '0x') as `0x${string}`;

/**
 * One pooled ERC-20 per methodology. VERRA_VCS is the token the marketplace
 * trades (`NEXT_PUBLIC_CARBON_CREDIT_TOKEN`); the other two are optional.
 */
export const CCT_POOLS: Record<Methodology, CctPool> = {
  VERRA_VCS: {
    methodology: 'VERRA_VCS',
    symbol: 'CCT-VCS',
    standard: 'Verra VCS',
    address: CONTRACTS.carbonCreditToken,
  },
  GOLD_STANDARD: {
    methodology: 'GOLD_STANDARD',
    symbol: 'CCT-GS',
    standard: 'Gold Standard',
    address: toAddress(
      process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_GOLD_STANDARD
    ),
  },
  ICM_COMPLIANCE: {
    methodology: 'ICM_COMPLIANCE',
    symbol: 'CCT-ICM',
    standard: 'ICM Compliance',
    address: toAddress(
      process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ICM_COMPLIANCE
    ),
  },
};

export const CCT_POOL_LIST: readonly CctPool[] = [
  CCT_POOLS.VERRA_VCS,
  CCT_POOLS.GOLD_STANDARD,
  CCT_POOLS.ICM_COMPLIANCE,
];

export const isPoolConfigured = (pool: CctPool): boolean =>
  ADDRESS_REGEX.test(pool.address) && !ZERO_ADDRESS_REGEX.test(pool.address);

/** Returns the pool for a credit's methodology string, if it is one of the three known pools. */
export const getPoolForMethodology = (
  methodology: string
): CctPool | undefined =>
  (CCT_POOLS as Record<string, CctPool | undefined>)[methodology];
