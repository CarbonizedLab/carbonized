'use client';

import {
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Store,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CCT_POOLS } from '@/config/cct-pools';
import type { TranslateFn } from '@/lib/i18n';
import { formatAmount, getTxUrl } from '../_lib/tokenize-utils';
import type { MintedSummary, PlannedTx } from '../_lib/use-tokenize-flow';

interface SuccessStepProps {
  minted: MintedSummary[];
  txs: PlannedTx[];
  onReset: () => void;
  t: TranslateFn;
}

export const SuccessStep = ({ minted, txs, onReset, t }: SuccessStepProps) => {
  const totalTonnes = minted.reduce((sum, item) => sum + item.tonnes, 0);
  const totalNfts = minted.reduce((sum, item) => sum + item.count, 0);
  const hasVcs = minted.some(
    (item) => item.pool.address === CCT_POOLS.VERRA_VCS.address
  );
  const wrapTxs = txs.filter((tx) => tx.kind === 'wrap' && tx.hash);

  return (
    <div className='space-y-6'>
      <Card className='rounded-none border-emerald-500/40 border-dashed bg-emerald-500/5 shadow-none'>
        <CardContent className='flex flex-wrap items-center gap-4'>
          <CheckCircle2 className='size-10 text-emerald-600 dark:text-emerald-400' />
          <div>
            <h2 className='font-semibold text-xl'>{t('success.title')}</h2>
            <p className='text-muted-foreground text-sm'>
              {t('success.subtitle', {
                tonnes: formatAmount(totalTonnes),
                count: totalNfts,
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 md:grid-cols-2'>
        {minted.map((item) => (
          <Card
            className='rounded-none border-dashed shadow-none'
            key={item.pool.methodology}
          >
            <CardContent className='space-y-3'>
              <div className='flex items-center justify-between'>
                <p className='font-semibold'>{item.pool.symbol}</p>
                <Badge variant='outline'>{item.pool.standard}</Badge>
              </div>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <div>
                  <p className='text-muted-foreground text-xs'>
                    {t('success.minted')}
                  </p>
                  <p className='font-semibold text-emerald-600 dark:text-emerald-400'>
                    +{formatAmount(item.tonnes)} {item.pool.symbol}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground text-xs'>
                    {t('success.balance')}
                  </p>
                  <p className='font-semibold'>
                    {item.balance === null
                      ? '—'
                      : `${formatAmount(item.balance)} ${item.pool.symbol}`}
                  </p>
                </div>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('success.nftsLocked', { count: item.count })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {wrapTxs.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {wrapTxs.map((tx) => {
            const url = tx.hash ? getTxUrl(tx.hash) : null;
            if (!url) {
              return null;
            }
            return (
              <a
                className='inline-flex items-center gap-1 border border-dashed px-2 py-1 font-mono text-primary text-xs hover:bg-muted/50'
                href={url}
                key={tx.id}
                rel='noopener noreferrer'
                target='_blank'
              >
                NFT #{tx.tokenId}
                <ExternalLink className='size-3' />
                <span className='sr-only'>{t('exec.viewTx')}</span>
              </a>
            );
          })}
        </div>
      ) : null}

      {hasVcs ? null : (
        <p className='border border-amber-500/30 border-dashed bg-amber-500/10 p-3 text-amber-600 text-sm dark:text-amber-400'>
          {t('success.nonTradable')}
        </p>
      )}

      <div className='flex flex-wrap gap-3'>
        <Button asChild>
          <Link href='/app/sell-credits'>
            <Tag className='size-4' />
            {t('success.sell')}
          </Link>
        </Button>
        <Button asChild variant='outline'>
          <Link href='/app/marketplace'>
            <Store className='size-4' />
            {t('success.marketplace')}
          </Link>
        </Button>
        <Button asChild variant='outline'>
          <Link href='/app/portfolio'>
            <BriefcaseBusiness className='size-4' />
            {t('success.portfolio')}
          </Link>
        </Button>
        <Button onClick={onReset} type='button' variant='ghost'>
          <RefreshCw className='size-4' />
          {t('success.again')}
        </Button>
      </div>
    </div>
  );
};
