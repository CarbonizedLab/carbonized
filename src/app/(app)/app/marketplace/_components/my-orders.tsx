'use client';

import { ClipboardList, Loader2, Plus, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';
import {
  fillPercent,
  formatExpiry,
  getOrderStatus,
  type OrderRow,
  type OrderStatus,
} from '../_lib/market-utils';
import { FillBar } from './orders-table';

const STATUS_STYLE: Record<OrderStatus, string> = {
  open: 'text-emerald-600 dark:text-emerald-400',
  partial: 'text-sky-600 dark:text-sky-400',
  filled: 'text-muted-foreground',
  cancelled: 'text-muted-foreground',
  expired: 'text-amber-600 dark:text-amber-400',
};

const CANCELLABLE: readonly OrderStatus[] = ['open', 'partial', 'expired'];

interface MyOrderCardProps {
  row: OrderRow;
  nowSec: number;
  cancelling: boolean;
  disabled: boolean;
  onCancel: (orderId: number) => Promise<boolean>;
  t: TranslateFn;
}

const MyOrderCard = ({
  row,
  nowSec,
  cancelling,
  disabled,
  onCancel,
  t,
}: MyOrderCardProps) => {
  const [confirming, setConfirming] = useState(false);
  const status = getOrderStatus(row, nowSec);
  const canCancel = CANCELLABLE.includes(status);
  const refund = row.isBuyOrder
    ? formatCurrency(row.available * row.pricePerTonne)
    : formatCarbonTonnes(row.available);

  const handleConfirm = async () => {
    await onCancel(row.id);
    setConfirming(false);
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent className='space-y-4'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <p className='font-semibold'>
              {row.isBuyOrder ? t('orders.buyOrder') : t('orders.sellOrder')} #
              {row.id}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('mine.price', { price: formatCurrency(row.pricePerTonne) })}
            </p>
          </div>
          <Badge className={STATUS_STYLE[status]} variant='outline'>
            {t(`status.${status}`)}
          </Badge>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <FillBar row={row} />
            <span className='text-muted-foreground text-xs'>
              {t('orders.filled', { percent: Math.round(fillPercent(row)) })}
            </span>
          </div>
          <dl className='grid grid-cols-3 gap-2 text-xs'>
            <div className='border border-dashed p-2'>
              <dt className='text-muted-foreground'>{t('mine.total')}</dt>
              <dd className='font-semibold text-sm'>
                {formatCarbonTonnes(row.amount)}
              </dd>
            </div>
            <div className='border border-dashed p-2'>
              <dt className='text-muted-foreground'>{t('mine.filled')}</dt>
              <dd className='font-semibold text-sm'>
                {formatCarbonTonnes(row.filled)}
              </dd>
            </div>
            <div className='border border-dashed p-2'>
              <dt className='text-muted-foreground'>{t('mine.remaining')}</dt>
              <dd className='font-semibold text-sm'>
                {formatCarbonTonnes(row.available)}
              </dd>
            </div>
          </dl>
          <p className='text-muted-foreground text-xs'>
            {t('mine.expires')}: {formatExpiry(row.expiresAt, nowSec, t)}
          </p>
        </div>

        {canCancel ? (
          <div className='border-t border-dashed pt-4'>
            {confirming ? (
              <div className='space-y-3'>
                <p className='text-sm'>{t('mine.confirm', { refund })}</p>
                <div className='flex gap-2'>
                  <Button
                    disabled={cancelling}
                    onClick={handleConfirm}
                    size='sm'
                    type='button'
                    variant='destructive'
                  >
                    {cancelling ? (
                      <Loader2 className='size-4 animate-spin' />
                    ) : (
                      <Undo2 className='size-4' />
                    )}
                    {cancelling
                      ? t('mine.cancelling')
                      : t('mine.confirmCancel')}
                  </Button>
                  <Button
                    disabled={cancelling}
                    onClick={() => setConfirming(false)}
                    size='sm'
                    type='button'
                    variant='ghost'
                  >
                    {t('mine.keep')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={disabled}
                onClick={() => setConfirming(true)}
                size='sm'
                type='button'
                variant='outline'
              >
                <X className='size-4' />
                {status === 'expired' ? t('mine.reclaim') : t('mine.cancel')}
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

interface MyOrdersProps {
  rows: OrderRow[];
  nowSec: number;
  loading: boolean;
  isConnected: boolean;
  cancellingId: number | null;
  onCancel: (orderId: number) => Promise<boolean>;
  t: TranslateFn;
}

export const MyOrders = ({
  rows,
  nowSec,
  loading,
  isConnected,
  cancellingId,
  onCancel,
  t,
}: MyOrdersProps) => {
  if (!isConnected) {
    return (
      <EmptyState
        description={t('mine.connect')}
        icon={<ClipboardList className='size-12' />}
        title={t('mine.title')}
      />
    );
  }
  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        {['a', 'b'].map((key) => (
          <Skeleton className='h-52 rounded-none' key={key} />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link href='/app/sell-credits'>
              <Plus className='size-4' />
              {t('page.createListing')}
            </Link>
          </Button>
        }
        description={t('mine.empty.description')}
        icon={<ClipboardList className='size-12' />}
        title={t('mine.empty.title')}
      />
    );
  }
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {rows.map((row) => (
        <MyOrderCard
          cancelling={cancellingId === row.id}
          disabled={cancellingId !== null}
          key={row.id}
          nowSec={nowSec}
          onCancel={onCancel}
          row={row}
          t={t}
        />
      ))}
    </div>
  );
};
