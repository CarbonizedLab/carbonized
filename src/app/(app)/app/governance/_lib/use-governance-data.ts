'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address, PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  ABI_CARB_GOVERNOR,
  ABI_CARB_STAKING,
  ABI_ISSUER_BOND,
  ABI_MARKETPLACE_PARAMS,
  CONTRACTS,
} from '@/config/contracts';
import { targetChain } from '@/config/wagmi';
import { CARB_QUERY_KEY } from '@/hooks/use-carb-data';
import { CARB, isAddressSet } from '@/lib/carb';
import { readTokenDecimals } from '@/lib/token-units';
import {
  fetchGovernance,
  type GovernanceSnapshot,
  type GovernorSettings,
  readGovernorSettings,
} from './governance-chain';
import type { ParamSnapshot } from './proposal-actions';

const STALE_MS = 15_000;
const RPC_UNAVAILABLE = 'RPC client unavailable';

export const useGovernorSettings = () => {
  const publicClient = usePublicClient();
  const governor = CARB.governor;
  return useQuery<GovernorSettings>({
    queryKey: [CARB_QUERY_KEY, 'governor-settings', targetChain.id],
    enabled: Boolean(publicClient && governor),
    staleTime: 60_000,
    queryFn: () => {
      if (!(publicClient && governor)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readGovernorSettings(publicClient, governor);
    },
  });
};

export const useProposals = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  const governor = CARB.governor;
  return useQuery<GovernanceSnapshot>({
    queryKey: [CARB_QUERY_KEY, 'proposals', targetChain.id, account],
    enabled: Boolean(publicClient && governor),
    staleTime: STALE_MS,
    refetchInterval: 30_000,
    queryFn: () => {
      if (!(publicClient && governor)) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return fetchGovernance(publicClient, governor, account);
    },
  });
};

export interface ParamContext {
  snapshot: ParamSnapshot;
  paymentDecimals: number | null;
  maxMinPrice: bigint | null;
}

const settle = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

const readThresholds = async (
  client: PublicClient,
  staking: Address
): Promise<readonly [bigint, bigint, bigint]> => {
  const readTier = (index: bigint) =>
    client.readContract({
      address: staking,
      abi: ABI_CARB_STAKING,
      functionName: 'tierThresholds',
      args: [index],
    });
  const [t1, t2, t3] = await Promise.all([
    readTier(0n),
    readTier(1n),
    readTier(2n),
  ]);
  return [t1, t2, t3];
};

const readParamContext = async (
  client: PublicClient
): Promise<ParamContext> => {
  const market = CONTRACTS.carbonMarketplace;
  const hasMarket = isAddressSet(market);
  const staking = CARB.staking;
  const bond = CARB.bond;
  const [
    minPrice,
    maxMinPrice,
    feeBps,
    kycGate,
    provider,
    paymentDecimals,
    thresholds,
    minBond,
  ] = await Promise.all([
    hasMarket
      ? settle(() =>
          client.readContract({
            address: market,
            abi: ABI_MARKETPLACE_PARAMS,
            functionName: 'minPricePerTonne',
          })
        )
      : null,
    hasMarket
      ? settle(() =>
          client.readContract({
            address: market,
            abi: ABI_MARKETPLACE_PARAMS,
            functionName: 'MAX_MIN_PRICE_PER_TONNE',
          })
        )
      : null,
    hasMarket
      ? settle(() =>
          client.readContract({
            address: market,
            abi: ABI_MARKETPLACE_PARAMS,
            functionName: 'tradingFeePercent',
          })
        )
      : null,
    hasMarket
      ? settle(() =>
          client.readContract({
            address: market,
            abi: ABI_MARKETPLACE_PARAMS,
            functionName: 'kycGateEnabled',
          })
        )
      : null,
    hasMarket
      ? settle(() =>
          client.readContract({
            address: market,
            abi: ABI_MARKETPLACE_PARAMS,
            functionName: 'feeDiscountProvider',
          })
        )
      : null,
    isAddressSet(CONTRACTS.usdc)
      ? settle(() => readTokenDecimals(client, CONTRACTS.usdc))
      : null,
    staking ? settle(() => readThresholds(client, staking)) : null,
    bond
      ? settle(() =>
          client.readContract({
            address: bond,
            abi: ABI_ISSUER_BOND,
            functionName: 'minBond',
          })
        )
      : null,
  ]);
  return {
    snapshot: { minPrice, feeBps, kycGate, provider, thresholds, minBond },
    paymentDecimals,
    maxMinPrice,
  };
};

/** Current values of the parameters the guided form can change, for the "from X to Y" summary. */
export const useParamContext = () => {
  const publicClient = usePublicClient();
  return useQuery<ParamContext>({
    queryKey: [CARB_QUERY_KEY, 'param-context', targetChain.id],
    enabled: Boolean(publicClient),
    staleTime: STALE_MS,
    queryFn: () => {
      if (!publicClient) {
        throw new Error(RPC_UNAVAILABLE);
      }
      return readParamContext(publicClient);
    },
  });
};

/** Whether the governor currently lets proposals call `target` (read before submitting). */
export const readTargetAllowed = (
  client: PublicClient,
  governor: Address,
  target: Address
): Promise<boolean> =>
  client.readContract({
    address: governor,
    abi: ABI_CARB_GOVERNOR,
    functionName: 'allowedTargets',
    args: [target],
  });
