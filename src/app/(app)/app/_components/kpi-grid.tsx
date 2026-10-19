'use client';

import {
  Coins,
  Flame,
  Gavel,
  Layers,
  Leaf,
  Sprout,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { StatCard } from '@/components/app/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { FALLBACK_PRICE } from '../_lib/aggregate';
import type { DashboardData } from '../_lib/types';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface KpiGridProps {
  data: DashboardData | null;
  isConnected: boolean;
  /** Percent change of the price series, when it is real data. */
  priceChange?: number;
}

const SKELETON_KEYS = ['a', 'b', 'c', 'd'] as const;
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className='font-semibold text-muted-foreground text-xs uppercase tracking-widest'>
    {children}
  </h2>
);

const SkeletonRow = () => (
  <div className={GRID}>
    {SKELETON_KEYS.map((key) => (
      <Skeleton className='h-32 rounded-none' key={key} />
    ))}
  </div>
);

const NetworkRow = ({ data }: { data: DashboardData }) => {
  const t = useT(messages);
  const { tonnes, number } = useFormatters();
  const { stats } = data;
  const unavailable = t('common.unavailable');
  const ordersValue =
    data.activeOrders === null ? '—' : number(data.activeOrders);

  return (
    <div className={GRID}>
      <StatCard
        icon={<Sprout className='size-5' />}
        label={t('kpi.minted')}
        subtext={t('kpi.minted.sub')}
        value={stats ? tonnes(stats.mintedTonnes) : unavailable}
      />
      <StatCard
        icon={<Flame className='size-5' />}
        label={t('kpi.retired')}
        subtext={t('kpi.retired.sub')}
        value={stats ? tonnes(stats.retiredTonnes) : unavailable}
      />
      <StatCard
        icon={<Layers className='size-5' />}
        label={t('kpi.wrapped')}
        subtext={t('kpi.wrapped.sub')}
        value={
          data.wrappedSupply === null ? unavailable : tonnes(data.wrappedSupply)
        }
      />
      <StatCard
        icon={<Gavel className='size-5' />}
        label={t('kpi.orders')}
        subtext={
          data.activeAuctions === null
            ? t('kpi.orders.sub.none')
            : t('kpi.orders.sub', { auctions: number(data.activeAuctions) })
        }
        value={ordersValue}
      />
    </div>
  );
};

const PositionRow = ({
  data,
  isConnected,
  priceChange,
}: KpiGridProps & { data: DashboardData }) => {
  const t = useT(messages);
  const { tonnes, number, usd } = useFormatters();
  const connectHint = t('common.connectToView');
  const price = data.oraclePrice ?? FALLBACK_PRICE;
  const nftTonnes = data.credits.reduce((sum, c) => sum + c.co2Tonnes, 0);
  const cctTotal = data.pools.reduce((sum, pool) => sum + pool.balance, 0);
  const cctBreakdown = data.pools
    .filter((pool) => pool.balance > 0)
    .map(
      (pool) =>
        `${t(`methodology.${pool.methodology}`)} ${number(pool.balance)}`
    )
    .join(' · ');

  let priceSubtext = t('kpi.price.oracle');
  if (data.oraclePrice === null) {
    priceSubtext = t('kpi.price.fallback');
  } else if (data.oracleManual === true) {
    priceSubtext = t('kpi.price.manual');
  } else if (data.oracleManual === false) {
    priceSubtext = t('kpi.price.functions');
  }

  return (
    <div className={GRID}>
      <StatCard
        change={data.oraclePrice === null ? undefined : priceChange}
        icon={<TrendingUp className='size-5' />}
        label={t('kpi.price')}
        subtext={priceSubtext}
        value={usd(price)}
      />
      <StatCard
        icon={<Leaf className='size-5' />}
        label={t('kpi.nft')}
        subtext={
          isConnected
            ? t('kpi.nft.sub', { tonnes: tonnes(nftTonnes) })
            : connectHint
        }
        value={isConnected ? number(data.credits.length) : '—'}
      />
      <StatCard
        icon={<Coins className='size-5' />}
        label={t('kpi.cct')}
        subtext={
          isConnected ? cctBreakdown || t('kpi.cct.sub.empty') : connectHint
        }
        value={isConnected ? tonnes(cctTotal) : '—'}
      />
      <StatCard
        icon={<Wallet className='size-5' />}
        label={t('kpi.usdc')}
        subtext={isConnected ? t('kpi.usdc.sub') : connectHint}
        value={
          isConnected && data.usdcBalance !== null ? usd(data.usdcBalance) : '—'
        }
      />
    </div>
  );
};

export const KpiGrid = ({ data, isConnected, priceChange }: KpiGridProps) => {
  const t = useT(messages);
  return (
    <div className='space-y-6'>
      <section aria-label={t('kpi.section.network')} className='space-y-3'>
        <SectionTitle>{t('kpi.section.network')}</SectionTitle>
        {data ? <NetworkRow data={data} /> : <SkeletonRow />}
      </section>
      <section aria-label={t('kpi.section.position')} className='space-y-3'>
        <SectionTitle>{t('kpi.section.position')}</SectionTitle>
        {data ? (
          <PositionRow
            data={data}
            isConnected={isConnected}
            priceChange={priceChange}
          />
        ) : (
          <SkeletonRow />
        )}
      </section>
    </div>
  );
};
