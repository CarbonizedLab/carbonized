'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { TranslateFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatAmount, getTxUrl } from '../_lib/tokenize-utils';
import type { PlannedTx, TxStatus } from '../_lib/use-tokenize-flow';

const STATUS_KEY: Record<TxStatus, string> = {
  idle: 'exec.status.idle',
  wallet: 'exec.status.wallet',
  confirming: 'exec.status.confirming',
  success: 'exec.status.success',
  error: 'exec.status.error',
  rejected: 'exec.status.rejected',
};

const StatusIcon = ({ status }: { status: TxStatus }) => {
  if (status === 'wallet' || status === 'confirming') {
    return <Loader2 className='size-5 animate-spin text-primary' />;
  }
  if (status === 'success') {
    return (
      <CheckCircle2 className='size-5 text-emerald-600 dark:text-emerald-400' />
    );
  }
  if (status === 'error' || status === 'rejected') {
    return <XCircle className='size-5 text-destructive' />;
  }
  return <Circle className='size-5 text-muted-foreground' />;
};

const TxRow = ({ tx, t }: { tx: PlannedTx; t: TranslateFn }) => {
  const url = tx.hash ? getTxUrl(tx.hash) : null;
  const title =
    tx.kind === 'approve'
      ? t('exec.approveTitle', { symbol: tx.pool.symbol })
      : t('exec.wrapTitle', {
          id: tx.tokenId ?? 0,
          tonnes: formatAmount(tx.tonnes ?? 0),
          symbol: tx.pool.symbol,
        });
  return (
    <li
      className={cn(
        'flex items-start gap-3 border border-dashed p-3',
        (tx.status === 'error' || tx.status === 'rejected') &&
          'border-destructive/50 bg-destructive/5'
      )}
    >
      <StatusIcon status={tx.status} />
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='font-medium text-sm'>{title}</p>
        <p className='text-muted-foreground text-xs'>
          {t(STATUS_KEY[tx.status])}
        </p>
        {tx.status === 'rejected' ? (
          <p className='text-destructive text-xs'>{t('exec.rejectedHint')}</p>
        ) : null}
        {tx.error ? (
          <p className='break-words text-destructive text-xs'>{tx.error}</p>
        ) : null}
      </div>
      {tx.hash ? (
        <div className='shrink-0 text-right'>
          {url ? (
            <a
              className='inline-flex items-center gap-1 font-mono text-primary text-xs hover:underline'
              href={url}
              rel='noopener noreferrer'
              target='_blank'
            >
              {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
              <ExternalLink className='size-3' />
              <span className='sr-only'>{t('exec.viewTx')}</span>
            </a>
          ) : (
            <span className='font-mono text-xs'>
              {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
            </span>
          )}
        </div>
      ) : null}
    </li>
  );
};

interface ExecuteStepProps {
  txs: PlannedTx[];
  running: boolean;
  hasWrapped: boolean;
  onStart: () => void;
  onBack: () => void;
  onFinishPartial: () => void;
  t: TranslateFn;
}

export const ExecuteStep = ({
  txs,
  running,
  hasWrapped,
  onStart,
  onBack,
  onFinishPartial,
  t,
}: ExecuteStepProps) => {
  const started = txs.some((tx) => tx.status !== 'idle');
  const failed = txs.some(
    (tx) => tx.status === 'error' || tx.status === 'rejected'
  );
  const doneCount = txs.filter((tx) => tx.status === 'success').length;
  const percent = txs.length === 0 ? 0 : (doneCount / txs.length) * 100;

  let startLabel = t('exec.start');
  if (running) {
    startLabel = t('exec.running');
  } else if (failed) {
    startLabel = t('exec.retry');
  } else if (started) {
    startLabel = t('exec.resume');
  }

  return (
    <div className='space-y-6'>
      <Card className='rounded-none border-dashed shadow-none'>
        <CardContent className='space-y-3'>
          <div className='flex items-center justify-between text-sm'>
            <span className='font-medium'>
              {t('exec.progress', { done: doneCount, total: txs.length })}
            </span>
            <span className='text-muted-foreground'>
              {Math.round(percent)}%
            </span>
          </div>
          <div
            aria-label={t('exec.progressLabel')}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(percent)}
            className='h-2 w-full overflow-hidden bg-muted'
            role='progressbar'
          >
            <div
              className='h-full bg-primary transition-all'
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className='text-muted-foreground text-xs'>{t('exec.hint')}</p>
        </CardContent>
      </Card>

      <ul aria-live='polite' className='space-y-3'>
        {txs.map((tx) => (
          <TxRow key={tx.id} t={t} tx={tx} />
        ))}
      </ul>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button
          disabled={running || started}
          onClick={onBack}
          type='button'
          variant='outline'
        >
          <ArrowLeft className='size-4' />
          {t('common.back')}
        </Button>
        <div className='flex flex-wrap items-center gap-2'>
          {failed && hasWrapped && !running ? (
            <Button onClick={onFinishPartial} type='button' variant='secondary'>
              {t('exec.finishPartial')}
            </Button>
          ) : null}
          <Button disabled={running} onClick={onStart} type='button'>
            {running ? <Loader2 className='size-4 animate-spin' /> : null}
            {!running && failed ? <RotateCcw className='size-4' /> : null}
            {running || failed ? null : <Play className='size-4' />}
            {startLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
