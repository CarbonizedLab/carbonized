'use client';

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDot,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Readiness, ReadinessItem } from '../_lib/types';
import { messages } from '../_messages';

interface ReadinessCardProps {
  readiness: Readiness | null;
}

const HIGH_SCORE = 80;
const MID_SCORE = 40;

const levelKey = (score: number): string => {
  if (score >= HIGH_SCORE) {
    return 'readiness.level.high';
  }
  return score >= MID_SCORE ? 'readiness.level.mid' : 'readiness.level.low';
};

const scoreColor = (score: number): string => {
  if (score >= HIGH_SCORE) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return score >= MID_SCORE
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-destructive';
};

const StatusIcon = ({ item }: { item: ReadinessItem }) => {
  if (item.done) {
    return (
      <CheckCircle2
        aria-hidden='true'
        className='size-4 text-emerald-600 dark:text-emerald-400'
      />
    );
  }
  return item.earned > 0 ? (
    <CircleDot
      aria-hidden='true'
      className='size-4 text-amber-600 dark:text-amber-400'
    />
  ) : (
    <Circle aria-hidden='true' className='size-4 text-muted-foreground' />
  );
};

const ChecklistRow = ({ item }: { item: ReadinessItem }) => {
  const t = useT(messages);
  return (
    <li className='flex items-start gap-3 border-b border-dashed py-3 last:border-b-0'>
      <span className='mt-0.5'>
        <StatusIcon item={item} />
      </span>
      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'font-medium text-sm',
            item.done && 'text-muted-foreground line-through'
          )}
        >
          {t(`readiness.${item.id}.label`)}
        </p>
        {item.done ? null : (
          <p className='text-muted-foreground text-xs'>
            {t(`readiness.${item.id}.hint`)}
          </p>
        )}
      </div>
      <span className='shrink-0 font-mono text-muted-foreground text-xs'>
        {Math.round(item.earned)}/{item.weight}
      </span>
      {item.done ? null : (
        <Link
          aria-label={t('readiness.fix', {
            item: t(`readiness.${item.id}.label`),
          })}
          className='shrink-0 text-primary hover:underline'
          href={item.href}
        >
          <ArrowRight className='size-4' />
        </Link>
      )}
    </li>
  );
};

export const ReadinessCard = ({ readiness }: ReadinessCardProps) => {
  const t = useT(messages);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <ShieldCheck className='size-5 text-primary' />
          {t('readiness.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {readiness ? (
          <>
            <div className='space-y-2'>
              <div className='flex items-baseline justify-between gap-2'>
                <p
                  className={cn(
                    'font-bold text-4xl tracking-tight',
                    scoreColor(readiness.score)
                  )}
                >
                  {readiness.score}
                  <span className='font-medium text-base text-muted-foreground'>
                    {' '}
                    / 100
                  </span>
                </p>
                <p className='font-medium text-sm'>
                  {t(levelKey(readiness.score))}
                </p>
              </div>
              <div
                aria-label={t('readiness.title')}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={readiness.score}
                className='h-2 w-full bg-muted'
                role='progressbar'
              >
                <div
                  className='h-full bg-primary transition-all'
                  style={{ width: `${readiness.score}%` }}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('readiness.subtitle')}
              </p>
            </div>
            <ul>
              {readiness.items.map((item) => (
                <ChecklistRow item={item} key={item.id} />
              ))}
            </ul>
          </>
        ) : (
          <div className='space-y-3'>
            <Skeleton className='h-10 w-32 rounded-none' />
            <Skeleton className='h-2 w-full rounded-none' />
            <Skeleton className='h-40 w-full rounded-none' />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
