'use client';

import { useMemo } from 'react';
import { CONTRACTS } from '@/config/contracts';
import { ActivityFeed } from './_components/activity-feed';
import { BatchesTable } from './_components/batches-table';
import { DashboardHero } from './_components/dashboard-hero';
import { KpiGrid } from './_components/kpi-grid';
import { MarketCharts } from './_components/market-charts';
import { OffsetRing } from './_components/offset-ring';
import { ReadinessCard } from './_components/readiness-card';
import { StatusAlerts } from './_components/status-alerts';
import { WeeklyChart } from './_components/weekly-chart';
import {
  buildDailyVolume,
  buildPriceSeries,
  buildWeeklyBuckets,
  computeReadiness,
  FALLBACK_PRICE,
} from './_lib/aggregate';
import { isConfiguredAddress } from './_lib/chain-reads';
import { useDashboardData } from './_lib/use-dashboard-data';

const DashboardPage = () => {
  const {
    data,
    isLoading,
    isSyncing,
    sync,
    address,
    isConnected,
    blockNumber,
    chainName,
    explorerUrl,
  } = useDashboardData();

  const weekly = useMemo(
    () => (data ? buildWeeklyBuckets(data.events, data.syncedAt) : null),
    [data]
  );
  const volume = useMemo(
    () => (data ? buildDailyVolume(data.events, data.syncedAt) : null),
    [data]
  );
  const priceSeries = useMemo(
    () =>
      data
        ? buildPriceSeries(
            data.priceHistory,
            data.events,
            data.oraclePrice ?? FALLBACK_PRICE,
            data.syncedAt
          )
        : null,
    [data]
  );
  const readiness = useMemo(
    () =>
      data
        ? computeReadiness({
            isConnected,
            profile: data.profile,
            hasCredits:
              data.credits.length > 0 ||
              data.pools.some((pool) => pool.balance > 0),
            retiredTonnes: data.walletRetiredTonnes,
          })
        : null,
    [data, isConnected]
  );

  const contractsConfigured =
    isConfiguredAddress(CONTRACTS.carbonCreditNFT) &&
    isConfiguredAddress(CONTRACTS.carbonMarketplace);

  return (
    <div className='space-y-8'>
      <DashboardHero
        address={address}
        blockNumber={blockNumber}
        chainName={chainName}
        isConnected={isConnected}
        isSyncing={isSyncing}
        kind={data?.profile?.kind ?? null}
        name={data?.profile?.name}
        onSync={sync}
        syncedAt={data?.syncedAt}
        verified={data?.profile?.verified ?? false}
      />

      <StatusAlerts
        contractsConfigured={contractsConfigured}
        errors={data?.errors ?? []}
      />

      <KpiGrid
        data={data}
        isConnected={isConnected}
        priceChange={priceSeries?.change}
      />

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <WeeklyChart buckets={weekly} />
        </div>
        <OffsetRing
          isConnected={isConnected}
          isLoading={isLoading}
          profile={data?.profile ?? null}
          retiredTonnes={data?.walletRetiredTonnes ?? 0}
        />
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <BatchesTable
            credits={data?.credits ?? []}
            isConnected={isConnected}
            isLoading={isLoading}
          />
        </div>
        <ReadinessCard readiness={readiness} />
      </div>

      <MarketCharts series={priceSeries} volume={volume} />

      <ActivityFeed
        account={address}
        events={data?.events ?? null}
        explorerUrl={explorerUrl}
      />
    </div>
  );
};

export default DashboardPage;
