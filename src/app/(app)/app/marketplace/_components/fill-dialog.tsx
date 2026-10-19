'use client';

import { Send } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';
import {
  CCT_DECIMALS,
  formatAmountInput,
  orderCostCeil,
  orderCostFloor,
  parseAmountInput,
  toDisplayNumber,
} from '@/lib/token-units';
import { cn } from '@/lib/utils';
import { formatExpiry, type OrderRow } from '../_lib/market-utils';

interface BalanceRowProps {
  label: string;
  value: string;
  insufficient: boolean;
  insufficientMessage: string;
}

const BalanceRow = ({
  label,
  value,
  insufficient,
  insufficientMessage,
}: BalanceRowProps) => (
  <>
    <div className='mt-2 flex justify-between border-t border-dashed pt-2 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span
        className={cn(
          'font-medium',
          insufficient
            ? 'text-destructive'
            : 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        {value}
      </span>
    </div>
    {insufficient ? (
      <p className='text-destructive text-xs' role='alert'>
        {insufficientMessage}
      </p>
    ) : null}
  </>
);

interface FillDialogProps {
  listing: OrderRow;
  nowSec: number;
  usdcBalanceWei: bigint | null;
  cctBalanceWei: bigint | null;
  isConnected: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (listing: OrderRow, amountWei: bigint) => void;
  t: TranslateFn;
}

const getConfirmLabel = (
  t: TranslateFn,
  isLoading: boolean,
  isBuyOrder: boolean
): string => {
  if (isLoading) {
    return t('fill.processing');
  }
  return isBuyOrder ? t('fill.confirmSell') : t('fill.confirmBuy');
};

export const FillDialog = ({
  listing,
  nowSec,
  usdcBalanceWei,
  cctBalanceWei,
  isConnected,
  isLoading,
  onClose,
  onConfirm,
  t,
}: FillDialogProps) => {
  const [amount, setAmount] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading, onClose]);

  // Exact bigint parsing; null when empty/invalid/too many decimals.
  const parsedWei = parseAmountInput(amount, CCT_DECIMALS);
  const amountWei = parsedWei ?? 0n;
  const totalWei = listing.isBuyOrder
    ? orderCostFloor(amountWei, listing.priceWei)
    : orderCostCeil(amountWei, listing.priceWei);
  const total = toDisplayNumber(totalWei, listing.paymentDecimals);
  const insufficientCct =
    listing.isBuyOrder && cctBalanceWei !== null && amountWei > cctBalanceWei;
  const insufficientUsdc =
    !listing.isBuyOrder && usdcBalanceWei !== null && totalWei > usdcBalanceWei;
  const overMax = amountWei > listing.availableWei;

  let balanceRow: ReactNode;
  if (listing.isBuyOrder) {
    balanceRow = (
      <BalanceRow
        insufficient={insufficientCct}
        insufficientMessage={t('fill.insufficientCct')}
        label={t('fill.yourCct')}
        value={
          cctBalanceWei === null
            ? t('fill.loading')
            : formatCarbonTonnes(toDisplayNumber(cctBalanceWei, CCT_DECIMALS))
        }
      />
    );
  } else {
    balanceRow = (
      <BalanceRow
        insufficient={insufficientUsdc}
        insufficientMessage={t('fill.insufficientUsdc')}
        label={t('fill.yourUsdc')}
        value={
          usdcBalanceWei === null
            ? t('fill.loading')
            : formatCurrency(
                toDisplayNumber(usdcBalanceWei, listing.paymentDecimals)
              )
        }
      />
    );
  }

  const disabled =
    parsedWei === null ||
    overMax ||
    !isConnected ||
    isLoading ||
    insufficientCct ||
    insufficientUsdc;

  return (
    <div
      aria-labelledby='fill-title'
      aria-modal='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm'
      role='dialog'
    >
      <Card className='w-full max-w-md rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle className='text-xl' id='fill-title'>
            {listing.isBuyOrder
              ? t('fill.titleSell', { id: listing.id })
              : t('fill.titleBuy', { id: listing.id })}
          </CardTitle>
          <p className='break-all text-muted-foreground text-sm'>
            {listing.isBuyOrder ? t('fill.buyer') : t('fill.seller')}:{' '}
            {listing.trader}
          </p>
          <p className='text-sm'>
            {t('fill.available', { amount: listing.available.toFixed(2) })}
            {listing.filled > 0
              ? ` ${t('fill.alreadyFilled', { amount: listing.filled.toFixed(2) })}`
              : ''}
            {' · '}
            {formatExpiry(listing.expiresAt, nowSec, t)}
          </p>
          {listing.isBuyOrder ? (
            <div className='border border-emerald-500/30 border-dashed bg-emerald-500/10 p-2 text-emerald-600 text-xs dark:text-emerald-400'>
              {t('fill.sellNote')}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='fill-amount'>
                  {listing.isBuyOrder
                    ? t('fill.amountSell')
                    : t('fill.amountBuy')}
                </Label>
                <button
                  className='text-primary text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  onClick={() =>
                    setAmount(
                      formatAmountInput(listing.availableWei, CCT_DECIMALS)
                    )
                  }
                  type='button'
                >
                  {t('fill.max', { amount: listing.available.toFixed(2) })}
                </button>
              </div>
              <Input
                id='fill-amount'
                inputMode='decimal'
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('fill.placeholder')}
                ref={inputRef}
                type='text'
                value={amount}
              />
              {overMax ? (
                <p className='text-destructive text-xs' role='alert'>
                  {t('fill.overMax', { amount: listing.available.toFixed(2) })}
                </p>
              ) : null}
            </div>
            <div className='space-y-2 border border-dashed p-4'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>
                  {t('orders.price')}
                </span>
                <span className='font-medium'>
                  {formatCurrency(listing.pricePerTonne)}
                </span>
              </div>
              <div className='flex justify-between font-semibold text-lg'>
                <span>
                  {listing.isBuyOrder
                    ? t('fill.youReceive')
                    : t('fill.totalCost')}
                </span>
                <span>{formatCurrency(total)}</span>
              </div>
              {balanceRow}
            </div>
          </div>

          <div className='flex gap-3'>
            <Button
              disabled={isLoading}
              onClick={onClose}
              type='button'
              variant='secondary'
            >
              {t('fill.cancel')}
            </Button>
            <Button
              disabled={disabled}
              onClick={() =>
                parsedWei !== null && onConfirm(listing, parsedWei)
              }
              type='button'
            >
              <Send className='size-4' />
              {getConfirmLabel(t, isLoading, listing.isBuyOrder)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
