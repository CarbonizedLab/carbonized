'use client';

import { ArrowLeft, ArrowRight, Info, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CCT_POOLS } from '@/config/cct-pools';
import type { TranslateFn } from '@/lib/i18n';
import { formatAmount, type PoolGroup } from '../_lib/tokenize-utils';

interface PoolPreviewProps {
  group: PoolGroup;
  approved: boolean | undefined;
  balance: number | undefined;
  loading: boolean;
  t: TranslateFn;
}

const PoolPreview = ({
  group,
  approved,
  balance,
  loading,
  t,
}: PoolPreviewProps) => {
  const current = balance ?? 0;
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          {group.pool.symbol}
          <Badge variant='outline'>{group.pool.standard}</Badge>
        </CardTitle>
        {loading || approved === undefined ? (
          <Skeleton className='h-5 w-28 rounded-none' />
        ) : (
          <Badge
            className={
              approved ? 'text-emerald-600 dark:text-emerald-400' : undefined
            }
            variant='outline'
          >
            {approved ? t('review.approved') : t('review.needsApproval')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className='space-y-4'>
        <ul className='divide-y divide-dashed border border-dashed text-sm'>
          {group.credits.map((credit) => (
            <li
              className='flex items-center justify-between gap-3 px-3 py-2'
              key={credit.tokenId}
            >
              <span className='min-w-0 truncate'>
                <span className='font-mono text-muted-foreground text-xs'>
                  #{credit.tokenId}
                </span>{' '}
                {credit.projectName}{' '}
                <span className='text-muted-foreground'>
                  · {credit.vintageYear}
                </span>
              </span>
              <span className='shrink-0 font-medium'>
                {formatAmount(credit.co2Tonnes)} t
              </span>
            </li>
          ))}
        </ul>

        <dl className='grid grid-cols-3 gap-3 text-sm'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('review.mint')}
            </dt>
            <dd className='font-semibold text-emerald-600 dark:text-emerald-400'>
              +{formatAmount(group.tonnes)} {group.pool.symbol}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('review.currentBalance')}
            </dt>
            <dd className='font-medium'>
              {loading ? '…' : `${formatAmount(current)} ${group.pool.symbol}`}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('review.afterBalance')}
            </dt>
            <dd className='font-medium'>
              {loading
                ? '…'
                : `${formatAmount(current + group.tonnes)} ${group.pool.symbol}`}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

interface ReviewStepProps {
  groups: PoolGroup[];
  approved: Record<string, boolean>;
  currentBalances: Record<string, number>;
  loading: boolean;
  preparing: boolean;
  onBack: () => void;
  onConfirm: () => void;
  t: TranslateFn;
}

export const ReviewStep = ({
  groups,
  approved,
  currentBalances,
  loading,
  preparing,
  onBack,
  onConfirm,
  t,
}: ReviewStepProps) => {
  const totalTonnes = groups.reduce((sum, group) => sum + group.tonnes, 0);
  const nftCount = groups.reduce((sum, group) => sum + group.credits.length, 0);
  const approvalCount = groups.filter(
    (group) => approved[group.pool.address] === false
  ).length;
  const txCount = nftCount + approvalCount;
  const hasNonTradable = groups.some(
    (group) => group.pool.address !== CCT_POOLS.VERRA_VCS.address
  );

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-3'>
        <Card className='rounded-none border-dashed shadow-none'>
          <CardContent className='space-y-1'>
            <p className='text-muted-foreground text-sm'>
              {t('review.totalCct')}
            </p>
            <p className='font-bold text-3xl tracking-tight'>
              {formatAmount(totalTonnes)}
            </p>
            <p className='text-muted-foreground text-xs'>{t('review.ratio')}</p>
          </CardContent>
        </Card>
        <Card className='rounded-none border-dashed shadow-none'>
          <CardContent className='space-y-1'>
            <p className='text-muted-foreground text-sm'>{t('review.nfts')}</p>
            <p className='font-bold text-3xl tracking-tight'>{nftCount}</p>
            <p className='text-muted-foreground text-xs'>
              {t('review.pools', { count: groups.length })}
            </p>
          </CardContent>
        </Card>
        <Card className='rounded-none border-dashed shadow-none'>
          <CardContent className='space-y-1'>
            <p className='text-muted-foreground text-sm'>
              {t('review.transactions')}
            </p>
            <p className='font-bold text-3xl tracking-tight'>
              {loading ? '…' : txCount}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('review.txBreakdown', {
                wraps: nftCount,
                approvals: approvalCount,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='space-y-4'>
        {groups.map((group) => (
          <PoolPreview
            approved={approved[group.pool.address]}
            balance={currentBalances[group.pool.address]}
            group={group}
            key={group.pool.methodology}
            loading={loading}
            t={t}
          />
        ))}
      </div>

      <div className='space-y-2 border border-dashed bg-muted/30 p-4 text-sm'>
        <p className='flex items-start gap-2'>
          <ShieldCheck className='mt-0.5 size-4 shrink-0 text-primary' />
          {t('review.lockNote')}
        </p>
        <p className='flex items-start gap-2 text-muted-foreground'>
          <Info className='mt-0.5 size-4 shrink-0' />
          {t('review.reversible')}
        </p>
        {hasNonTradable ? (
          <p className='flex items-start gap-2 text-amber-600 dark:text-amber-400'>
            <Info className='mt-0.5 size-4 shrink-0' />
            {t('review.nonTradable')}
          </p>
        ) : null}
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button onClick={onBack} type='button' variant='outline'>
          <ArrowLeft className='size-4' />
          {t('common.back')}
        </Button>
        <Button
          disabled={loading || preparing}
          onClick={onConfirm}
          type='button'
        >
          {preparing ? t('common.preparing') : t('review.confirm')}
          <ArrowRight className='size-4' />
        </Button>
      </div>
    </div>
  );
};
