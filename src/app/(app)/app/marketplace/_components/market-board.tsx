'use client';

import { AlertTriangle, ClipboardList, Plus, Store } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { FeeTierNote } from '@/components/app/fee-tier-note';
import { PendingClaimBanner } from '@/components/app/pending-claim-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTRACTS } from '@/config/contracts';
import { requestNotificationPermission } from '@/lib/carb-notifications';
import { useT } from '@/lib/i18n';
import { CCT_DECIMALS, toDisplayNumber } from '@/lib/token-units';
import {
  applyChip,
  CHIP_KEYS,
  type ChipKey,
  matchesSearch,
  type OrderRow,
  type SortDir,
  type SortKey,
  sortOrders,
  summarize,
} from '../_lib/market-utils';
import { useMarketplace } from '../_lib/use-marketplace';
import { messages } from '../_messages';
import { BalanceBar } from './balance-bar';
import { FillDialog } from './fill-dialog';
import { Filters } from './filters';
import { MyOrders } from './my-orders';
import { OrdersTable } from './orders-table';
import { SummaryCards } from './summary-cards';

type BoardTab = 'listings' | 'requests' | 'mine';

const MARKETPLACE_CONFIGURED = /^0x[a-fA-F0-9]{40}$/.test(
  CONTRACTS.carbonMarketplace
);

export const MarketBoard = () => {
  const t = useT(messages);
  const market = useMarketplace(t);
  const [tab, setTab] = useState<BoardTab>('listings');
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<ChipKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<OrderRow | null>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const handleTab = (value: string) => {
    const next = value as BoardTab;
    setTab(next);
    // Best price first: lowest ask for sellers, highest bid for buyers.
    setSortKey('price');
    setSortDir(next === 'requests' ? 'desc' : 'asc');
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const baseRows = tab === 'requests' ? market.buyRequests : market.listings;
  const searched = useMemo(
    () => baseRows.filter((row) => matchesSearch(row, search)),
    [baseRows, search]
  );
  const chipCounts = useMemo(() => {
    const counts = {} as Record<ChipKey, number>;
    for (const key of CHIP_KEYS) {
      counts[key] = applyChip(searched, key, market.now).length;
    }
    return counts;
  }, [searched, market.now]);
  const rows = useMemo(
    () => sortOrders(applyChip(searched, chip, market.now), sortKey, sortDir),
    [searched, chip, market.now, sortKey, sortDir]
  );
  const summary = useMemo(() => summarize(market.listings), [market.listings]);

  const handleConfirm = async (listing: OrderRow, amountWei: bigint) => {
    const ok = await market.fill(listing, amountWei);
    if (ok) {
      setSelected(null);
    }
  };

  const myOpenCount = market.myOrders.filter((row) => row.isActive).length;
  const usdcDisplay =
    market.usdcBalanceWei !== null && market.paymentDecimals !== null
      ? toDisplayNumber(market.usdcBalanceWei, market.paymentDecimals)
      : null;
  const cctDisplay =
    market.cctBalanceWei === null
      ? null
      : toDisplayNumber(market.cctBalanceWei, CCT_DECIMALS);

  const renderRows = () => {
    if (market.loading) {
      return <Skeleton className='h-64 rounded-none' />;
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          action={
            tab === 'listings' ? (
              <Button asChild>
                <Link href='/app/sell-credits'>
                  <Plus className='size-4' />
                  {t('page.createListing')}
                </Link>
              </Button>
            ) : undefined
          }
          description={
            market.loadFailed
              ? t('empty.loadFailed')
              : t(`empty.${tab}.description`)
          }
          icon={<Store className='size-12' />}
          title={t(`empty.${tab}.title`)}
        />
      );
    }
    return (
      <OrdersTable
        address={market.address}
        nowSec={market.now}
        onSelect={setSelected}
        onSort={handleSort}
        rows={rows}
        sortDir={sortDir}
        sortKey={sortKey}
        t={t}
      />
    );
  };

  const board = (
    <>
      <Filters
        chip={chip}
        chipCounts={chipCounts}
        onChip={setChip}
        onSearch={setSearch}
        onSortKey={setSortKey}
        onToggleDir={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        search={search}
        sortDir={sortDir}
        sortKey={sortKey}
        t={t}
      />
      {renderRows()}
    </>
  );

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {t('page.title')}
          </h1>
          <p className='text-muted-foreground'>{t('page.subtitle')}</p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Badge variant='outline'>CCT-VCS · Verra VCS</Badge>
            <Badge variant='outline'>{t('page.settles')}</Badge>
          </div>
        </div>
        <Button asChild>
          <Link href='/app/sell-credits'>
            <Plus className='size-4' />
            {t('page.createListing')}
          </Link>
        </Button>
      </div>

      {MARKETPLACE_CONFIGURED ? null : (
        <div
          className='flex items-center gap-2 border border-destructive/40 border-dashed bg-destructive/10 p-3 text-destructive text-sm'
          role='alert'
        >
          <AlertTriangle className='size-4 shrink-0' />
          {t('page.notConfigured')}
        </div>
      )}

      {market.isConnected ? null : (
        <div className='border border-amber-500/30 border-dashed bg-amber-500/10 p-3 text-amber-600 text-sm dark:text-amber-400'>
          {t('page.connect')}
        </div>
      )}

      {market.isConnected ? <PendingClaimBanner /> : null}

      {market.isConnected ? (
        <BalanceBar
          cctBalance={cctDisplay}
          onRefresh={market.refresh}
          refreshing={market.refreshing}
          t={t}
          usdcBalance={usdcDisplay}
        />
      ) : null}

      <FeeTierNote />

      <SummaryCards loading={market.loading} summary={summary} t={t} />

      <Tabs onValueChange={handleTab} value={tab}>
        <TabsList>
          <TabsTrigger value='listings'>
            {t('tab.listings')} ({market.listings.length})
          </TabsTrigger>
          <TabsTrigger value='requests'>
            {t('tab.requests')} ({market.buyRequests.length})
          </TabsTrigger>
          <TabsTrigger value='mine'>
            <ClipboardList className='size-4' />
            {t('tab.mine')}
            {market.isConnected ? ` (${myOpenCount})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent className='space-y-4 pt-4' value='listings'>
          {board}
        </TabsContent>

        <TabsContent className='space-y-4 pt-4' value='requests'>
          {board}
        </TabsContent>

        <TabsContent className='pt-4' value='mine'>
          <MyOrders
            cancellingId={market.cancellingId}
            isConnected={market.isConnected}
            loading={market.loading}
            nowSec={market.now}
            onCancel={market.cancel}
            rows={market.myOrders}
            t={t}
          />
        </TabsContent>
      </Tabs>

      {selected ? (
        <FillDialog
          cctBalanceWei={market.cctBalanceWei}
          isConnected={market.isConnected}
          isLoading={market.filling}
          listing={selected}
          nowSec={market.now}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
          t={t}
          usdcBalanceWei={market.usdcBalanceWei}
        />
      ) : null}
    </div>
  );
};
