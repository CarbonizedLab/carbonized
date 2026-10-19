'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { fetchChainEvents } from '@/lib/onchain-events';
import {
  isConfiguredAddress,
  readGlobalStats,
  readPools,
  readPriceHistory,
  readPriceIsManual,
  readWalletRetiredTonnes,
} from './chain-reads';
import type { DashboardData, WalletProfile } from './types';

const AUTO_REFRESH_MS = 30_000;
const MS_PER_SECOND = 1000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'request failed';

/** Runs `task`; on failure records `label: message` and returns `fallback`. */
const settle = async <T>(
  errors: string[],
  label: string,
  task: () => Promise<T>,
  fallback: T
): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    errors.push(`${label}: ${errorMessage(error)}`);
    return fallback;
  }
};

export interface DashboardState {
  data: DashboardData | null;
  /** True until the first snapshot for the current wallet is available. */
  isLoading: boolean;
  isSyncing: boolean;
  sync: () => Promise<void>;
  address: `0x${string}` | undefined;
  isConnected: boolean;
  blockNumber: bigint | undefined;
  chainName: string | undefined;
  explorerUrl: string | undefined;
}

export const useDashboardData = (): DashboardState => {
  const {
    address,
    isConnected,
    blockNumber,
    publicClient,
    getMarketplaceOrders,
    getActiveAuctions,
    getCarbonPrice,
    getUserCredits,
    getErc20Balance,
    getRegistrationType,
    getCompanyData,
    getCompanyEmissions,
    getCompanyKyb,
    getTraderData,
  } = useContractInteraction();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const requestId = useRef(0);

  const loadProfile = useCallback(
    async (account: string): Promise<WalletProfile> => {
      const kind = await getRegistrationType(account);
      if (kind === 'company') {
        const [company, emissions, kyb] = await Promise.all([
          getCompanyData(account),
          getCompanyEmissions(account),
          getCompanyKyb(account),
        ]);
        return {
          kind,
          name: company?.name || undefined,
          verified: kyb?.verified ?? company?.verified ?? false,
          emissions: emissions
            ? {
                scope1: emissions.scope1,
                scope2: emissions.scope2,
                scope3: emissions.scope3,
                total: emissions.scope1 + emissions.scope2 + emissions.scope3,
                target: emissions.totalTarget,
              }
            : null,
        };
      }
      if (kind === 'trader') {
        const trader = await getTraderData(account);
        return {
          kind,
          name: trader?.name || undefined,
          verified: false,
          emissions: null,
        };
      }
      return { kind: 'none', verified: false, emissions: null };
    },
    [
      getRegistrationType,
      getCompanyData,
      getCompanyEmissions,
      getCompanyKyb,
      getTraderData,
    ]
  );

  const countActiveMarket = useCallback(
    async (nowSec: number) => {
      const [orders, auctions] = await Promise.all([
        getMarketplaceOrders(),
        getActiveAuctions(),
      ]);
      return {
        orders: orders.filter(
          (order) =>
            order.isActive &&
            order.filled < order.amount &&
            (order.expiresAt === 0 || order.expiresAt > nowSec)
        ).length,
        auctions: auctions.filter((auction) => auction.endTime > nowSec).length,
      };
    },
    [getMarketplaceOrders, getActiveAuctions]
  );

  const load = useCallback(async () => {
    if (!publicClient) {
      return;
    }
    requestId.current += 1;
    const current = requestId.current;
    setIsSyncing(true);

    const errors: string[] = [];
    const nowSec = Math.floor(Date.now() / MS_PER_SECOND);
    const account = address;
    const marketReady = isConfiguredAddress(CONTRACTS.carbonMarketplace);
    const usdcReady = isConfiguredAddress(CONTRACTS.usdc);

    const [
      stats,
      pools,
      priceHistory,
      oraclePrice,
      oracleManual,
      market,
      chain,
      credits,
      usdcBalance,
      walletRetiredTonnes,
      profile,
    ] = await Promise.all([
      settle(errors, 'NFT', () => readGlobalStats(publicClient), null),
      settle(errors, 'CCT', () => readPools(publicClient, account), []),
      settle(errors, 'Oracle', () => readPriceHistory(publicClient), []),
      settle(errors, 'Oracle', () => getCarbonPrice(), null),
      settle(errors, 'Oracle', () => readPriceIsManual(publicClient), null),
      marketReady
        ? settle(errors, 'Marketplace', () => countActiveMarket(nowSec), null)
        : Promise.resolve(null),
      settle(errors, 'Events', () => fetchChainEvents(publicClient), {
        events: [],
        errors: [] as string[],
      }),
      account
        ? settle(errors, 'Credits', () => getUserCredits(account), [])
        : Promise.resolve([]),
      account && usdcReady
        ? settle(
            errors,
            'USDG',
            () => getErc20Balance(CONTRACTS.usdc, account),
            null
          )
        : Promise.resolve(null),
      account
        ? settle(
            errors,
            'NFT',
            () => readWalletRetiredTonnes(publicClient, account),
            0
          )
        : Promise.resolve(0),
      account
        ? settle(errors, 'Registry', () => loadProfile(account), null)
        : Promise.resolve(null),
    ]);

    if (current !== requestId.current) {
      return;
    }
    errors.push(...chain.errors);
    setData({
      account,
      syncedAt: nowSec,
      stats,
      wrappedSupply:
        pools.length > 0
          ? pools.reduce((sum, pool) => sum + pool.supply, 0)
          : null,
      pools,
      usdcBalance,
      activeOrders: market?.orders ?? null,
      activeAuctions: market?.auctions ?? null,
      oraclePrice,
      oracleManual,
      priceHistory,
      events: chain.events,
      credits: credits.filter((credit) => !credit.isRetired),
      walletRetiredTonnes,
      profile,
      errors: [...new Set(errors)],
    });
    setIsSyncing(false);
  }, [
    publicClient,
    address,
    countActiveMarket,
    getCarbonPrice,
    getUserCredits,
    getErc20Balance,
    loadProfile,
  ]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        load();
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const isCurrent = data !== null && data.account === address;

  return {
    data: isCurrent ? data : null,
    isLoading: !isCurrent,
    isSyncing,
    sync: load,
    address,
    isConnected,
    blockNumber,
    chainName: publicClient?.chain?.name,
    explorerUrl: publicClient?.chain?.blockExplorers?.default.url,
  };
};
