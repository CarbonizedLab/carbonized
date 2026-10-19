'use client';

import { Loader2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import type { TranslateFn } from '@/lib/i18n';
import {
  formatAmount,
  getTxErrorMessage,
  getTxUrl,
  isUserRejection,
  type WrappedCredit,
} from '../_lib/tokenize-utils';

interface UnwrapPanelProps {
  wrapped: WrappedCredit[];
  loading: boolean;
  onChanged: () => void;
  t: TranslateFn;
}

export const UnwrapPanel = ({
  wrapped,
  loading,
  onChanged,
  t,
}: UnwrapPanelProps) => {
  const { address, publicClient, getErc20Balance, unwrapCredit } =
    useContractInteraction();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<number | null>(null);

  const loadBalances = useCallback(async () => {
    if (!address) {
      return;
    }
    const pools = [...new Set(wrapped.map((item) => item.pool.address))];
    const entries = await Promise.all(
      pools.map(
        async (pool) => [pool, await getErc20Balance(pool, address)] as const
      )
    );
    setBalances(Object.fromEntries(entries));
  }, [address, wrapped, getErc20Balance]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const handleUnwrap = async (item: WrappedCredit) => {
    const { tokenId } = item.credit;
    setPending(tokenId);
    const toastId = toast.loading(t('unwrap.toast.wallet'));
    try {
      const hash = await unwrapCredit(tokenId, item.pool.address);
      toast.loading(t('unwrap.toast.confirming'), { id: toastId });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (receipt && receipt.status !== 'success') {
        throw new Error(t('tx.reverted'));
      }
      const url = getTxUrl(hash);
      toast.success(t('unwrap.toast.success', { id: tokenId }), {
        id: toastId,
        action: url
          ? {
              label: t('exec.viewTx'),
              onClick: () => window.open(url, '_blank', 'noopener,noreferrer'),
            }
          : undefined,
      });
      await loadBalances();
      onChanged();
    } catch (error) {
      toast.error(
        isUserRejection(error)
          ? t('tx.rejected')
          : getTxErrorMessage(error, t('tx.failed')),
        { id: toastId }
      );
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div className='grid gap-3 md:grid-cols-2'>
        {['a', 'b'].map((key) => (
          <Skeleton className='h-32 rounded-none' key={key} />
        ))}
      </div>
    );
  }

  if (wrapped.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild variant='outline'>
            <Link href='/app/portfolio'>{t('unwrap.empty.cta')}</Link>
          </Button>
        }
        description={t('unwrap.empty.description')}
        icon={<Undo2 className='size-12' />}
        title={t('unwrap.empty.title')}
      />
    );
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>{t('unwrap.intro')}</p>
      <div className='grid gap-4 md:grid-cols-2'>
        {wrapped.map((item) => {
          const { credit, pool } = item;
          const balance = balances[pool.address];
          const shortfall =
            balance === undefined ? 0 : Math.max(0, credit.co2Tonnes - balance);
          const busy = pending === credit.tokenId;
          return (
            <Card
              className='rounded-none border-dashed shadow-none'
              key={`${pool.methodology}-${credit.tokenId}`}
            >
              <CardContent className='space-y-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='truncate font-semibold'>
                      {credit.projectName}
                    </p>
                    <p className='font-mono text-muted-foreground text-xs'>
                      NFT #{credit.tokenId} · {credit.vintageYear}
                    </p>
                  </div>
                  <Badge variant='outline'>{pool.symbol}</Badge>
                </div>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {t('unwrap.burn')}
                    </dt>
                    <dd className='font-semibold'>
                      {formatAmount(credit.co2Tonnes)} {pool.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {t('unwrap.yourBalance')}
                    </dt>
                    <dd className='font-medium'>
                      {balance === undefined
                        ? '…'
                        : `${formatAmount(balance)} ${pool.symbol}`}
                    </dd>
                  </div>
                </dl>
                {shortfall > 0 ? (
                  <p className='text-destructive text-xs'>
                    {t('unwrap.shortfall', {
                      amount: formatAmount(shortfall),
                      symbol: pool.symbol,
                    })}
                  </p>
                ) : null}
                <Button
                  className='w-full'
                  disabled={
                    busy || pending !== null || shortfall > 0 || !address
                  }
                  onClick={() => handleUnwrap(item)}
                  type='button'
                  variant='outline'
                >
                  {busy ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Undo2 className='size-4' />
                  )}
                  {busy ? t('unwrap.working') : t('unwrap.action')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
