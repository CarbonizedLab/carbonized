'use client';

import { Cloud, Factory, Truck, Zap } from 'lucide-react';
import { StatCard } from '@/components/app/stat-card';
import { formatNumber, type ScopeTotals } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

const PERCENT = 100;

export const EmissionKpis = ({ totals }: { totals: ScopeTotals }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const tonnes = (value: number) =>
    `${formatNumber(value, locale)} ${t('unit.tco2e')}`;
  const share = (value: number) =>
    totals.total > 0
      ? t('kpi.share', {
          pct: formatNumber((value / totals.total) * PERCENT, locale, 1),
        })
      : t('kpi.noData');

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      <StatCard
        icon={<Factory className='size-4 text-emerald-500' />}
        label={t('kpi.scope1')}
        subtext={share(totals.scope1)}
        value={tonnes(totals.scope1)}
      />
      <StatCard
        icon={<Zap className='size-4 text-blue-500' />}
        label={t('kpi.scope2')}
        subtext={share(totals.scope2)}
        value={tonnes(totals.scope2)}
      />
      <StatCard
        icon={<Truck className='size-4 text-amber-500' />}
        label={t('kpi.scope3')}
        subtext={share(totals.scope3)}
        value={tonnes(totals.scope3)}
      />
      <StatCard
        icon={<Cloud className='size-4' />}
        label={t('kpi.total')}
        subtext={t('kpi.totalHint')}
        value={tonnes(totals.total)}
      />
    </div>
  );
};
