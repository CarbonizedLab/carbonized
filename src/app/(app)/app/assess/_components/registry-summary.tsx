'use client';

import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { MethodologySummary } from '../_lib/allocation';
import { messages } from '../_messages';
import type { CreditsStatus } from './use-assess-data';

interface RegistrySummaryProps {
  summaries: MethodologySummary[];
  status: CreditsStatus;
  configured: boolean;
}

const PERCENT = 100;

const STANDARD_COLORS = {
  VERRA_VCS: 'bg-emerald-500',
  GOLD_STANDARD: 'bg-amber-500',
  ICM_COMPLIANCE: 'bg-blue-500',
} as const;

const STANDARD_NAMES = {
  VERRA_VCS: 'Verra VCS',
  GOLD_STANDARD: 'Gold Standard',
  ICM_COMPLIANCE: 'ICM Compliance',
} as const;

export const RegistrySummary = ({
  summaries,
  status,
  configured,
}: RegistrySummaryProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const totalEligible = summaries.reduce((sum, row) => sum + row.eligible, 0);
  const totalRetired = summaries.reduce((sum, row) => sum + row.retired, 0);
  const totalCount = summaries.reduce((sum, row) => sum + row.count, 0);

  const renderBody = () => {
    if (!configured) {
      return (
        <p className='py-8 text-center text-muted-foreground text-sm'>
          {t('registry.notConfigured')}
        </p>
      );
    }
    if (status === 'loading') {
      return (
        <div className='space-y-3'>
          {['a', 'b', 'c'].map((key) => (
            <Skeleton className='h-16 rounded-none' key={key} />
          ))}
        </div>
      );
    }
    if (totalCount === 0) {
      return (
        <p className='py-8 text-center text-muted-foreground text-sm'>
          {t('registry.empty')}
        </p>
      );
    }
    return (
      <ul className='space-y-3'>
        {summaries.map((row) => {
          const share =
            totalEligible > 0 ? (row.eligible / totalEligible) * PERCENT : 0;
          return (
            <li
              className='space-y-2 border border-dashed p-3'
              key={row.methodology}
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='flex items-center gap-2 font-medium text-sm'>
                  <span
                    aria-hidden='true'
                    className={`size-2.5 ${STANDARD_COLORS[row.methodology]}`}
                  />
                  {STANDARD_NAMES[row.methodology]}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {t('registry.credits', { count: row.count })}
                </span>
              </div>
              <div
                aria-hidden='true'
                className='h-1.5 w-full overflow-hidden bg-muted'
              >
                <div
                  className={`h-full ${STANDARD_COLORS[row.methodology]}`}
                  style={{ width: `${share}%` }}
                />
              </div>
              <dl className='grid grid-cols-2 gap-2 text-xs'>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('registry.eligible')}
                  </dt>
                  <dd className='font-semibold text-sm tabular-nums'>
                    {formatNumber(row.eligible, locale)} {t('unit.tco2e')}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('registry.retired')}
                  </dt>
                  <dd className='font-semibold text-sm tabular-nums'>
                    {formatNumber(row.retired, locale)} {t('unit.tco2e')}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
        <li className='flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-sm'>
          <span className='font-medium'>{t('registry.total')}</span>
          <span className='tabular-nums'>
            {formatNumber(totalEligible, locale)} {t('registry.eligibleShort')}{' '}
            · {formatNumber(totalRetired, locale)} {t('registry.retiredShort')}
          </span>
        </li>
      </ul>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Layers className='size-4 text-primary' />
          {t('registry.title')}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('registry.description')}
        </p>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
