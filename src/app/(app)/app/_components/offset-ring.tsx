'use client';

import { Target } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WalletButton } from '@/components/web3/wallet-button';
import { useT } from '@/lib/i18n';
import { offsetCoverage } from '../_lib/aggregate';
import type { WalletProfile } from '../_lib/types';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface OffsetRingProps {
  isLoading: boolean;
  isConnected: boolean;
  profile: WalletProfile | null;
  retiredTonnes: number;
}

const RING_SIZE = 168;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PERCENT = 100;

const Ring = ({ coverage, label }: { coverage: number; label: string }) => (
  <div className='relative size-[168px] shrink-0'>
    <svg
      aria-label={label}
      className='size-full -rotate-90'
      role='img'
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill='none'
        r={RING_RADIUS}
        stroke='var(--color-muted)'
        strokeWidth={RING_STROKE}
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill='none'
        r={RING_RADIUS}
        stroke='var(--color-primary)'
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - coverage)}
        strokeLinecap='butt'
        strokeWidth={RING_STROKE}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
    </svg>
    <div className='absolute inset-0 flex flex-col items-center justify-center'>
      <span className='font-bold text-3xl tracking-tight'>
        {Math.round(coverage * PERCENT)}%
      </span>
    </div>
  </div>
);

const Cta = ({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) => (
  <EmptyState
    action={
      <Button asChild size='sm'>
        <Link href={href}>{action}</Link>
      </Button>
    }
    description={description}
    icon={<Target className='size-8' />}
    title={title}
  />
);

const OffsetBody = ({
  isConnected,
  profile,
  retiredTonnes,
}: Omit<OffsetRingProps, 'isLoading'>): ReactNode => {
  const t = useT(messages);
  const { tonnes } = useFormatters();

  if (!isConnected) {
    return (
      <EmptyState
        action={<WalletButton />}
        description={t('offset.connect.desc')}
        icon={<Target className='size-8' />}
        title={t('offset.connect.title')}
      />
    );
  }
  if (!profile || profile.kind === 'none') {
    return (
      <Cta
        action={t('offset.register.action')}
        description={t('offset.register.desc')}
        href='/app/company/register'
        title={t('offset.register.title')}
      />
    );
  }
  if (profile.kind === 'trader') {
    return (
      <Cta
        action={t('offset.trader.action')}
        description={t('offset.trader.desc')}
        href='/app/company/register'
        title={t('offset.trader.title')}
      />
    );
  }
  if (!profile.emissions || profile.emissions.total <= 0) {
    return (
      <Cta
        action={t('offset.emissions.action')}
        description={t('offset.emissions.desc')}
        href='/app/emissions'
        title={t('offset.emissions.title')}
      />
    );
  }

  const { total } = profile.emissions;
  const coverage = offsetCoverage(retiredTonnes, total);
  const remaining = Math.max(total - retiredTonnes, 0);

  return (
    <div className='flex flex-col items-center gap-6 sm:flex-row'>
      <Ring
        coverage={coverage}
        label={t('offset.ring.label', {
          percent: Math.round(coverage * PERCENT),
        })}
      />
      <dl className='w-full space-y-3 text-sm'>
        <div className='flex justify-between gap-2 border-b border-dashed pb-2'>
          <dt className='text-muted-foreground'>{t('offset.retired')}</dt>
          <dd className='font-semibold'>{tonnes(retiredTonnes)}</dd>
        </div>
        <div className='flex justify-between gap-2 border-b border-dashed pb-2'>
          <dt className='text-muted-foreground'>{t('offset.emissions')}</dt>
          <dd className='font-semibold'>{tonnes(total)}</dd>
        </div>
        <div className='flex justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('offset.remaining')}</dt>
          <dd className='font-semibold'>{tonnes(remaining)}</dd>
        </div>
        {remaining > 0 ? (
          <Button asChild className='w-full' size='sm' variant='outline'>
            <Link href='/app/carbon-wallet'>{t('offset.retireMore')}</Link>
          </Button>
        ) : (
          <p className='text-emerald-600 text-xs dark:text-emerald-400'>
            {t('offset.complete')}
          </p>
        )}
      </dl>
    </div>
  );
};

export const OffsetRing = ({ isLoading, ...body }: OffsetRingProps) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <Target className='size-5 text-primary' />
          {t('offset.title')}
        </CardTitle>
        <p className='text-muted-foreground text-xs'>{t('offset.desc')}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className='h-44 w-full rounded-none' />
        ) : (
          <OffsetBody {...body} />
        )}
      </CardContent>
    </Card>
  );
};
