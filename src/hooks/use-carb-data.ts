'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { ABI_MARKETPLACE_PARAMS, CONTRACTS } from '@/config/contracts';
import { targetChain } from '@/config/wagmi';
import {
  CARB,
  nowSeconds,
  readStakePosition,
  readStakingParams,
  readTokenAccount,
  readTokenInfo,
} from '@/lib/carb';
import { type BondState, readBondState } from '@/lib/carb-bond';

const STALE_MS = 15_000;
const STATIC_STALE_MS = 60_000;

/** Query-key prefix shared by every CARB read; invalidate it after any CARB transaction. */
export const CARB_QUERY_KEY = 'carb';

const RPC_UNAVAILABLE = 'RPC client unavailable';

export const useTokenInfo = () => {
  const publicClient = usePublicClient();
  const token = CARB.token;
  return useQuery({
    queryKey: [CARB_QUERY_KEY, 'info', targetChain.id],
    enabled: Boolean(publicClient && token),
    staleTime: STATIC_STALE_MS,
    queryFn: () => {
      if (!(publicClient && token)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readTokenInfo(publicClient, token);
    },
  });
};

export const useTokenAccount = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  const token = CARB.token;
  return useQuery({
    queryKey: [CARB_QUERY_KEY, 'account', targetChain.id, account],
    enabled: Boolean(publicClient && token && account),
    staleTime: STALE_MS,
    queryFn: () => {
      if (!(publicClient && token && account)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readTokenAccount(publicClient, token, account);
    },
  });
};

export const useStakingParams = () => {
  const publicClient = usePublicClient();
  const staking = CARB.staking;
  return useQuery({
    queryKey: [CARB_QUERY_KEY, 'staking-params', targetChain.id],
    enabled: Boolean(publicClient && staking),
    staleTime: STATIC_STALE_MS,
    queryFn: () => {
      if (!(publicClient && staking)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readStakingParams(publicClient, staking);
    },
  });
};

export const useStakePosition = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  const staking = CARB.staking;
  return useQuery({
    queryKey: [CARB_QUERY_KEY, 'position', targetChain.id, account],
    enabled: Boolean(publicClient && staking && account),
    staleTime: STALE_MS,
    queryFn: () => {
      if (!(publicClient && staking && account)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readStakePosition(publicClient, staking, account);
    },
  });
};

export const useBondState = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  const bond = CARB.bond;
  return useQuery<BondState>({
    queryKey: [CARB_QUERY_KEY, 'bond', targetChain.id, account],
    enabled: Boolean(publicClient && bond && account),
    staleTime: STALE_MS,
    queryFn: () => {
      if (!(publicClient && bond && account)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readBondState(publicClient, bond, account, nowSeconds());
    },
  });
};

export interface FeeTier {
  /** Tier 0..3 of the wallet in the staking contract. */
  tier: number;
  /** Share of the trading fee waived for the wallet, in bps of the fee (marketplace view). */
  discountBps: bigint;
  /** Marketplace base trading fee in bps. */
  feeBps: bigint;
}

/**
 * Fee tier and discount for the informational line on trading pages. The discount comes from
 * the marketplace's `feeDiscountBpsOf` (what it will actually apply); the tier from the staking
 * contract. Disabled (no request) while staking is not configured.
 */
export const useFeeTier = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  const staking = CARB.staking;
  const marketplace = CONTRACTS.carbonMarketplace;
  return useQuery<FeeTier>({
    queryKey: [CARB_QUERY_KEY, 'fee-tier', targetChain.id, account],
    enabled: Boolean(publicClient && staking && account),
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!(publicClient && staking && account)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      const [discountBps, feeBps, position] = await Promise.all([
        publicClient.readContract({
          address: marketplace,
          abi: ABI_MARKETPLACE_PARAMS,
          functionName: 'feeDiscountBpsOf',
          args: [account],
        }),
        publicClient.readContract({
          address: marketplace,
          abi: ABI_MARKETPLACE_PARAMS,
          functionName: 'tradingFeePercent',
        }),
        readStakePosition(publicClient, staking, account),
      ]);
      return { tier: position.tier, discountBps, feeBps };
    },
  });
};
