'use client';

import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { explorerTxUrl } from '@/lib/explorer';
import type { TranslateFn } from '@/lib/i18n';
import type { BatchChunk } from '../_lib/issuer-utils';
import type { ChunkState, ChunkStatus } from '../_lib/use-batch-runner';

const STATUS_STYLE: Record<ChunkStatus, string> = {
  pending: '',
  signing: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  confirming: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  done: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  failed: 'border-destructive/50 text-destructive',
};

const PENDING: ChunkState = { status: 'pending' };

const ChunkResult = ({ state, t }: { state: ChunkState; t: TranslateFn }) => (
  <>
    {state.error ? (
      <span className='block text-destructive' role='alert'>
        {state.error}
      </span>
    ) : null}
    {state.tokenIds && state.tokenIds.length > 0 ? (
      <span className='block text-muted-foreground'>
        {t('batch.tokenIds', { ids: state.tokenIds.join(', ') })}
      </span>
    ) : null}
    {state.hash ? (
      <a
        className='inline-flex items-center gap-1 underline'
        href={explorerTxUrl(state.hash)}
        rel='noopener noreferrer'
        target='_blank'
      >
        {t('common.viewTx')}
        <ExternalLink className='size-3' />
      </a>
    ) : null}
  </>
);

interface ChunkTableProps {
  chunks: BatchChunk[];
  states: Record<number, ChunkState>;
  totalCredits: number;
  totalTonnes: number;
  t: TranslateFn;
}

/** One row per `batchMint` transaction with live status, token ids and explorer link. */
export const ChunkTable = ({
  chunks,
  states,
  totalCredits,
  totalTonnes,
  t,
}: ChunkTableProps) => (
  <div className='space-y-2'>
    <h3 className='font-medium text-sm'>
      {t('batch.plan', {
        txs: chunks.length,
        credits: totalCredits,
        tonnes: totalTonnes.toLocaleString('en-US'),
      })}
    </h3>
    <div className='overflow-auto border border-dashed'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('batch.col.tx')}</TableHead>
            <TableHead>{t('f.projectId')}</TableHead>
            <TableHead className='text-right'>
              {t('batch.col.credits')}
            </TableHead>
            <TableHead className='text-right'>{t('f.tonnes')}</TableHead>
            <TableHead>{t('batch.col.status')}</TableHead>
            <TableHead>{t('batch.col.result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chunks.map((chunk) => {
            const state = states[chunk.index] ?? PENDING;
            return (
              <TableRow key={chunk.index}>
                <TableCell className='tabular-nums'>
                  {chunk.index + 1}/{chunks.length}
                </TableCell>
                <TableCell>{chunk.projectId}</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {chunk.credits.length}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {chunk.totalTonnes.toLocaleString('en-US')}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`rounded-none ${STATUS_STYLE[state.status]}`}
                    variant='outline'
                  >
                    {t(`chunk.${state.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className='text-xs'>
                  <ChunkResult state={state} t={t} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
    <p className='text-muted-foreground text-xs'>{t('batch.gasNote')}</p>
  </div>
);
