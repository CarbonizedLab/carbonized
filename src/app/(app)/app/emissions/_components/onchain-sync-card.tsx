'use client';

import { Link2, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, type ScopeTotals } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';
import type { OnChainStatus, OnChainTotals } from './use-onchain-totals';

interface OnChainSyncCardProps {
  year: number;
  local: ScopeTotals;
  onChain: OnChainTotals | null;
  status: OnChainStatus;
  configured: boolean;
  isSyncing: boolean;
  onSync: () => void;
  onRefresh: () => void;
}

const SCOPE_KEYS = ['scope1', 'scope2', 'scope3'] as const;
const ROW_LABELS = {
  scope1: 'kpi.scope1',
  scope2: 'kpi.scope2',
  scope3: 'kpi.scope3',
} as const;
const EPSILON = 0.0005;

export const OnChainSyncCard = ({
  year,
  local,
  onChain,
  status,
  configured,
  isSyncing,
  onSync,
  onRefresh,
}: OnChainSyncCardProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const inSync =
    onChain !== null &&
    SCOPE_KEYS.every((key) => Math.abs(onChain[key] - local[key]) < EPSILON);

  const renderChainValue = (key: (typeof SCOPE_KEYS)[number]) => {
    if (status === 'loading') {
      return <Skeleton className='ml-auto h-4 w-16' />;
    }
    return onChain ? formatNumber(onChain[key], locale, 3) : '—';
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Link2 className='size-4 text-primary' />
          {t('sync.title')}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('sync.description', { year })}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='overflow-x-auto border border-dashed'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/40 text-left text-muted-foreground text-xs'>
              <tr>
                <th className='px-3 py-2 font-medium' scope='col'>
                  {t('sync.colScope')}
                </th>
                <th className='px-3 py-2 text-right font-medium' scope='col'>
                  {t('sync.colTracker', { year })}
                </th>
                <th className='px-3 py-2 text-right font-medium' scope='col'>
                  {t('sync.colChain')}
                </th>
              </tr>
            </thead>
            <tbody>
              {SCOPE_KEYS.map((key) => (
                <tr className='border-t border-dashed' key={key}>
                  <th className='px-3 py-2 text-left font-normal' scope='row'>
                    {t(ROW_LABELS[key])}
                  </th>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {formatNumber(local[key], locale, 3)}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {renderChainValue(key)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status === 'ready' ? (
          <p
            className={
              inSync
                ? 'text-emerald-600 text-xs dark:text-emerald-400'
                : 'text-amber-600 text-xs dark:text-amber-400'
            }
          >
            {inSync ? t('sync.inSync') : t('sync.outOfSync')}
          </p>
        ) : null}
        {status === 'unavailable' ? (
          <p className='text-muted-foreground text-xs'>
            {configured ? t('sync.noRecord') : t('sync.notConfigured')}
          </p>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={!configured || isSyncing || local.total === 0}
            onClick={onSync}
            type='button'
          >
            {isSyncing ? <Loader2 className='animate-spin' /> : <UploadCloud />}
            {isSyncing ? t('sync.syncing') : t('sync.button')}
          </Button>
          <Button
            disabled={status === 'loading' || !configured}
            onClick={onRefresh}
            type='button'
            variant='outline'
          >
            <RefreshCw />
            {t('sync.refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
