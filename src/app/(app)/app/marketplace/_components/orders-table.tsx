'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';
import {
  fillPercent,
  formatExpiry,
  type OrderRow,
  type SortDir,
  type SortKey,
} from '../_lib/market-utils';
import { AddressCopy } from './address-copy';

export const FillBar = ({ row }: { row: OrderRow }) => (
  <div
    aria-hidden='true'
    className='h-1.5 w-full max-w-24 overflow-hidden bg-muted'
  >
    <div
      className='h-full bg-primary'
      style={{ width: `${fillPercent(row)}%` }}
    />
  </div>
);

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}

const SortHeader = ({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
}: SortHeaderProps) => {
  const active = sortKey === activeKey;
  let ariaSort: 'ascending' | 'descending' | 'none' = 'none';
  if (active) {
    ariaSort = dir === 'asc' ? 'ascending' : 'descending';
  }
  let Icon = ArrowUpDown;
  if (active) {
    Icon = dir === 'asc' ? ArrowUp : ArrowDown;
  }
  return (
    <TableHead
      aria-sort={ariaSort}
      className={align === 'right' ? 'text-right' : undefined}
    >
      <button
        className='inline-flex items-center gap-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onClick={() => onSort(sortKey)}
        type='button'
      >
        {label}
        <Icon className={active ? 'size-3.5' : 'size-3.5 opacity-40'} />
      </button>
    </TableHead>
  );
};

interface ActionButtonProps {
  row: OrderRow;
  isOwn: boolean;
  onSelect: (row: OrderRow) => void;
  t: TranslateFn;
  fullWidth?: boolean;
}

const ActionButton = ({
  row,
  isOwn,
  onSelect,
  t,
  fullWidth,
}: ActionButtonProps) => (
  <Button
    className={fullWidth ? 'w-full' : undefined}
    disabled={isOwn}
    onClick={() => onSelect(row)}
    size='sm'
    title={isOwn ? t('orders.ownOrder') : undefined}
    type='button'
  >
    {row.isBuyOrder ? (
      <Zap className='size-4' />
    ) : (
      <ShoppingCart className='size-4' />
    )}
    {row.isBuyOrder ? t('orders.sell') : t('orders.buy')}
  </Button>
);

const isOwnOrder = (row: OrderRow, address?: string) =>
  Boolean(address) && row.trader.toLowerCase() === address?.toLowerCase();

interface OrdersTableProps {
  rows: OrderRow[];
  nowSec: number;
  address?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelect: (row: OrderRow) => void;
  t: TranslateFn;
}

const OrderCard = ({
  row,
  nowSec,
  address,
  onSelect,
  t,
}: Pick<OrdersTableProps, 'nowSec' | 'address' | 'onSelect' | 't'> & {
  row: OrderRow;
}) => (
  <Card className='rounded-none border-dashed shadow-none'>
    <CardContent className='space-y-4'>
      <div className='flex items-start justify-between gap-2'>
        <div className='space-y-1'>
          <p className='font-semibold'>
            {row.isBuyOrder ? t('orders.buyOrder') : t('orders.sellOrder')} #
            {row.id}
          </p>
          <AddressCopy
            address={row.trader}
            isYou={isOwnOrder(row, address)}
            t={t}
          />
        </div>
        <div className='flex flex-col items-end gap-1'>
          <Badge variant='outline'>CCT-VCS</Badge>
          {row.requiresKYC ? (
            <Badge
              className='text-amber-600 dark:text-amber-400'
              variant='outline'
            >
              KYC
            </Badge>
          ) : null}
        </div>
      </div>

      <div className='space-y-1.5'>
        <div className='flex justify-between text-sm'>
          <span className='text-muted-foreground'>{t('orders.available')}</span>
          <span className='font-medium'>
            {formatCarbonTonnes(row.available)}
          </span>
        </div>
        <div className='flex items-center justify-between gap-3 text-muted-foreground text-xs'>
          <FillBar row={row} />
          <span>
            {t('orders.filled', { percent: Math.round(fillPercent(row)) })}
          </span>
        </div>
        <div className='flex justify-between text-sm'>
          <span className='text-muted-foreground'>{t('orders.expires')}</span>
          <span>{formatExpiry(row.expiresAt, nowSec, t)}</span>
        </div>
      </div>

      <div className='flex items-center justify-between gap-3 border-t border-dashed pt-4'>
        <div>
          <p className='text-muted-foreground text-xs'>{t('orders.price')}</p>
          <p className='font-bold text-2xl tracking-tight'>
            {formatCurrency(row.pricePerTonne)}
          </p>
        </div>
        <ActionButton
          isOwn={isOwnOrder(row, address)}
          onSelect={onSelect}
          row={row}
          t={t}
        />
      </div>
    </CardContent>
  </Card>
);

/** Sortable table on desktop, card list on mobile. */
export const OrdersTable = ({
  rows,
  nowSec,
  address,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  t,
}: OrdersTableProps) => (
  <>
    <div className='hidden border border-dashed md:block'>
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader
              activeKey={sortKey}
              dir={sortDir}
              label={t('orders.col.order')}
              onSort={onSort}
              sortKey='id'
            />
            <TableHead>{t('orders.col.trader')}</TableHead>
            <SortHeader
              activeKey={sortKey}
              dir={sortDir}
              label={t('orders.col.available')}
              onSort={onSort}
              sortKey='available'
            />
            <SortHeader
              activeKey={sortKey}
              align='right'
              dir={sortDir}
              label={t('orders.col.price')}
              onSort={onSort}
              sortKey='price'
            />
            <TableHead className='text-right'>
              {t('orders.col.total')}
            </TableHead>
            <SortHeader
              activeKey={sortKey}
              dir={sortDir}
              label={t('orders.col.expires')}
              onSort={onSort}
              sortKey='expiry'
            />
            <TableHead className='text-right'>
              <span className='sr-only'>{t('orders.col.action')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className='font-medium'>
                #{row.id}
                {row.requiresKYC ? (
                  <Badge
                    className='ml-2 text-amber-600 dark:text-amber-400'
                    variant='outline'
                  >
                    KYC
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                <AddressCopy
                  address={row.trader}
                  isYou={isOwnOrder(row, address)}
                  t={t}
                />
              </TableCell>
              <TableCell>
                <div className='space-y-1'>
                  <span className='font-medium'>
                    {formatCarbonTonnes(row.available)}
                  </span>
                  <FillBar row={row} />
                </div>
              </TableCell>
              <TableCell className='text-right font-semibold'>
                {formatCurrency(row.pricePerTonne)}
              </TableCell>
              <TableCell className='text-right text-muted-foreground'>
                {formatCurrency(row.available * row.pricePerTonne)}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {formatExpiry(row.expiresAt, nowSec, t)}
              </TableCell>
              <TableCell className='text-right'>
                <ActionButton
                  isOwn={isOwnOrder(row, address)}
                  onSelect={onSelect}
                  row={row}
                  t={t}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    <div className='grid gap-4 md:hidden'>
      {rows.map((row) => (
        <OrderCard
          address={address}
          key={row.id}
          nowSec={nowSec}
          onSelect={onSelect}
          row={row}
          t={t}
        />
      ))}
    </div>
  </>
);
