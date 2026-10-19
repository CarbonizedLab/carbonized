import { Coins, DollarSign, Layers, ListChecks } from 'lucide-react';
import { StatCard } from '@/components/app/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';
import type { MarketSummary } from '../_lib/market-utils';

interface SummaryCardsProps {
  summary: MarketSummary;
  loading: boolean;
  t: TranslateFn;
}

export const SummaryCards = ({ summary, loading, t }: SummaryCardsProps) => {
  if (loading) {
    return (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {['a', 'b', 'c', 'd'].map((key) => (
          <Skeleton className='h-28 rounded-none' key={key} />
        ))}
      </div>
    );
  }
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        icon={<ListChecks className='size-4' />}
        label={t('summary.listings')}
        subtext={t('summary.listingsHint')}
        value={summary.count}
      />
      <StatCard
        icon={<Layers className='size-4' />}
        label={t('summary.volume')}
        subtext={t('summary.volumeHint')}
        value={formatCarbonTonnes(summary.volume)}
      />
      <StatCard
        icon={<DollarSign className='size-4' />}
        label={t('summary.avgPrice')}
        subtext={
          summary.bestPrice === null
            ? t('summary.noBest')
            : t('summary.best', { price: formatCurrency(summary.bestPrice) })
        }
        value={summary.count > 0 ? formatCurrency(summary.avgPrice) : '—'}
      />
      <StatCard
        icon={<Coins className='size-4' />}
        label={t('summary.currency')}
        subtext={t('summary.currencyHint')}
        value='USDG'
      />
    </div>
  );
};
