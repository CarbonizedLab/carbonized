'use client';

import { Eye, EyeOff, Flame, Send, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import type { DepositoryCredit } from '@/lib/carb-api';
import { fetchDepositoryCredits } from '@/lib/carb-api';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import { explorerTxUrl } from '@/lib/explorer';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import {
  type ChainEvent,
  type ChainEventKind,
  fetchChainEvents,
} from '@/lib/onchain-events';
import { readWalletRetiredTonnes } from '../_lib/chain-reads';
import { messages } from './_messages';

interface AssetHolding {
  id: string;
  projectName: string;
  quantity: number;
  /** Oracle price per tonne (indicative, not a cost basis). */
  currentPrice: number | null;
  totalValue: number | null;
  methodology: string;
  /** NFT token id when the holding is an onchain credit; enables onchain retirement. */
  tokenId?: number;
}

type PortfolioTab = 'overview' | 'assets' | 'transactions';

const TABS: PortfolioTab[] = ['overview', 'assets', 'transactions'];

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
const TOOLTIP_STYLE = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-popover-foreground)',
};
const MAX_TRANSACTIONS = 100;

const TX_STYLES: Record<ChainEventKind, string> = {
  mint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  retire: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  wrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  unwrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  order_created: 'bg-muted text-foreground',
  order_filled: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  order_cancelled: 'bg-muted text-muted-foreground',
  auction_created: 'bg-muted text-foreground',
  bid: 'bg-muted text-foreground',
  auction_finalized: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  auction_cancelled: 'bg-muted text-muted-foreground',
};

interface OnChainCredit {
  id?: string | number;
  tokenId?: number;
  projectName?: string;
  co2Tonnes?: number;
  methodology?: string;
  isRetired?: boolean;
}

const mapDepositoryToAssets = (
  credits: DepositoryCredit[],
  marketPrice: number | null
): AssetHolding[] =>
  credits
    .filter((credit) => credit.status === 'Active')
    .map((credit) => {
      const quantity = Number(credit.co2Amount || 0);
      return {
        id: credit.creditId,
        projectName: credit.projectId || '',
        quantity,
        currentPrice: marketPrice,
        totalValue: marketPrice === null ? null : quantity * marketPrice,
        methodology: credit.methodology || 'VERRA_VCS',
      };
    });

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

const formatRelative = (date: Date, locale: Locale): string => {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { numeric: 'auto' }
  );
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(Math.round(seconds), 'second');
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className='border border-dashed p-3'>
    <p className='text-muted-foreground text-xs'>{label}</p>
    <p className='font-semibold'>{value}</p>
  </div>
);

const PortfolioPage = () => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { getUserCredits, getCarbonPrice, isConnected, address, publicClient } =
    useContractInteraction();

  const [showHiddenValues, setShowHiddenValues] = useState(false);
  const [activeTab, setActiveTab] = useState<PortfolioTab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [userAssets, setUserAssets] = useState<AssetHolding[]>([]);
  const [retiredTonnes, setRetiredTonnes] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<ChainEvent[]>([]);
  const [txLoadFailed, setTxLoadFailed] = useState(false);

  const loadAssets = useCallback(async () => {
    if (!address) {
      return;
    }
    const [credits, depositoryRes, price] = await Promise.all([
      getUserCredits(address).catch(() => []),
      fetchDepositoryCredits(address, false).catch(() => null),
      getCarbonPrice().catch(() => null),
    ]);

    const onChainAssets: AssetHolding[] = ((credits || []) as OnChainCredit[])
      .filter((credit) => !credit?.isRetired)
      .map((credit) => {
        const quantity = Number(credit?.co2Tonnes || 0);
        return {
          id: credit?.id?.toString() || String(credit?.tokenId ?? ''),
          tokenId: credit?.tokenId,
          projectName: credit?.projectName || '',
          quantity,
          currentPrice: price,
          totalValue: price === null ? null : quantity * price,
          methodology: credit?.methodology || 'VERRA_VCS',
        };
      });

    // If no onchain credits, fall back to the optional depository backend.
    const fallbackDepositoryAssets = mapDepositoryToAssets(
      depositoryRes?.credits || [],
      price
    );
    setUserAssets(
      onChainAssets.length > 0 ? onChainAssets : fallbackDepositoryAssets
    );
  }, [address, getUserCredits, getCarbonPrice]);

  const loadTransactions = useCallback(async () => {
    if (!(address && publicClient)) {
      return;
    }
    try {
      const { events, errors } = await fetchChainEvents(publicClient, {
        account: address,
      });
      setTransactions(events.slice(0, MAX_TRANSACTIONS));
      setTxLoadFailed(errors.length > 0);
    } catch {
      setTransactions([]);
      setTxLoadFailed(true);
    }
  }, [address, publicClient]);

  const loadRetired = useCallback(async () => {
    if (!(address && publicClient)) {
      return;
    }
    try {
      setRetiredTonnes(await readWalletRetiredTonnes(publicClient, address));
    } catch {
      setRetiredTonnes(null);
    }
  }, [address, publicClient]);

  useEffect(() => {
    if (!(isConnected && address)) {
      setUserAssets([]);
      setTransactions([]);
      setRetiredTonnes(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([loadAssets(), loadTransactions(), loadRetired()])
      .catch(() => setUserAssets([]))
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, loadAssets, loadTransactions, loadRetired]);

  const assets = userAssets;
  const totalAssets = assets.reduce(
    (sum, asset) => sum + (asset.totalValue ?? 0),
    0
  );
  const totalTonnes = assets.reduce((sum, asset) => sum + asset.quantity, 0);

  const assetAllocationData = assets.map((asset) => ({
    id: asset.id,
    name: asset.projectName || t('asset.defaultName'),
    value: asset.quantity,
  }));

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('page.title')}
        </h1>
        <p className='text-muted-foreground'>{t('page.description')}</p>
        {isConnected ? null : (
          <p className='mt-4 border border-dashed p-3 text-muted-foreground text-sm'>
            {t('page.connectHint')}
          </p>
        )}
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {isLoading ? (
          ['a', 'b', 'c'].map((key) => (
            <Skeleton className='h-32 rounded-none' key={key} />
          ))
        ) : (
          <>
            <StatCard
              icon={<Wallet className='size-5' />}
              label={t('stat.value')}
              subtext={t('stat.valueSub')}
              value={showHiddenValues ? formatCurrency(totalAssets) : '*****'}
            />
            <StatCard
              icon={<Send className='size-5' />}
              label={t('stat.holdings')}
              subtext={t('stat.holdingsSub')}
              value={formatCarbonTonnes(totalTonnes)}
            />
            <StatCard
              icon={<Flame className='size-5' />}
              label={t('stat.retired')}
              subtext={t('stat.retiredSub')}
              value={
                retiredTonnes === null ? '—' : formatCarbonTonnes(retiredTonnes)
              }
            />
          </>
        )}
      </div>

      <div className='flex justify-end'>
        <Button
          onClick={() => setShowHiddenValues(!showHiddenValues)}
          size='sm'
          type='button'
          variant='ghost'
        >
          {showHiddenValues ? (
            <EyeOff className='size-4' />
          ) : (
            <Eye className='size-4' />
          )}
          {showHiddenValues ? t('toggle.hide') : t('toggle.show')}
        </Button>
      </div>

      <Tabs
        onValueChange={(value) => setActiveTab(value as PortfolioTab)}
        value={activeTab}
      >
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger className='capitalize' key={tab} value={tab}>
              {t(`tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className='mt-4' value='overview'>
          <Card className='rounded-none border-dashed shadow-none'>
            <CardHeader>
              <CardTitle>{t('chart.allocation')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {assetAllocationData.length > 0 && totalTonnes > 0 ? (
                <>
                  <ResponsiveContainer height={280} width='100%'>
                    <PieChart>
                      <Pie
                        cx='50%'
                        cy='50%'
                        data={assetAllocationData}
                        dataKey='value'
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        stroke='var(--color-background)'
                      >
                        {assetAllocationData.map((entry, index) => (
                          <Cell
                            fill={COLORS[index % COLORS.length]}
                            key={entry.id}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) =>
                          formatCarbonTonnes(value as number)
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className='space-y-2 text-sm'>
                    {assetAllocationData.map((asset, idx) => (
                      <div className='flex items-center gap-2' key={asset.id}>
                        <div
                          className='size-3 rounded-full'
                          style={{ background: COLORS[idx % COLORS.length] }}
                        />
                        <span className='flex-1 text-muted-foreground'>
                          {asset.name}
                        </span>
                        <span className='font-medium'>
                          {((asset.value / totalTonnes) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className='py-8 text-center text-muted-foreground'>
                  {isConnected
                    ? t('asset.emptyConnected')
                    : t('asset.emptyDisconnected')}
                </p>
              )}
              <p className='text-muted-foreground text-xs'>
                {t('page.valueDisclaimer')}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className='mt-4 space-y-4' value='assets'>
          {assets.length > 0 ? (
            assets.map((asset) => (
              <Card
                className='rounded-none border-dashed shadow-none'
                key={asset.id}
              >
                <CardContent className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <h3 className='font-semibold text-lg'>
                        {asset.projectName || t('asset.defaultName')}
                      </h3>
                      <Badge className='mt-2' variant='secondary'>
                        {asset.methodology}
                      </Badge>
                    </div>
                    <div className='text-right'>
                      <p className='text-muted-foreground text-sm'>
                        {t('asset.indicativeValue')}
                      </p>
                      <p className='font-bold text-2xl'>
                        {asset.totalValue === null
                          ? '—'
                          : formatCurrency(asset.totalValue)}
                      </p>
                    </div>
                  </div>

                  <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                    <Metric
                      label={t('asset.quantity')}
                      value={formatCarbonTonnes(asset.quantity)}
                    />
                    <Metric
                      label={t('asset.oraclePrice')}
                      value={
                        asset.currentPrice === null
                          ? '—'
                          : formatCurrency(asset.currentPrice)
                      }
                    />
                    <div className='flex items-center gap-2 md:col-span-2'>
                      <Button asChild size='sm' variant='outline'>
                        <Link href='/app/sell-credits'>
                          <Send className='size-4' />
                          {t('asset.sell')}
                        </Link>
                      </Button>
                      <Button asChild size='sm' variant='outline'>
                        <Link
                          href={
                            asset.tokenId === undefined
                              ? '/app/carbon-wallet?tab=depository'
                              : `/app/carbon-wallet?retire=${asset.tokenId}`
                          }
                        >
                          <Flame className='size-4' />
                          {t('asset.retire')}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className='rounded-none border-dashed shadow-none'>
              <CardContent className='py-8 text-center text-muted-foreground'>
                {isConnected
                  ? t('asset.emptyConnected')
                  : t('asset.emptyDisconnected')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent className='mt-4 space-y-3' value='transactions'>
          {txLoadFailed ? (
            <p
              className='border border-amber-500/30 border-dashed bg-amber-500/10 p-3 text-amber-600 text-sm dark:text-amber-400'
              role='alert'
            >
              {t('tx.loadFailed')}
            </p>
          ) : null}
          {transactions.length > 0 ? (
            transactions.map((tx) => (
              <Card
                className='rounded-none border-dashed shadow-none'
                key={`${tx.txHash}-${tx.logIndex}`}
              >
                <CardContent className='flex items-center justify-between gap-4'>
                  <div className='flex flex-1 items-center gap-4'>
                    <Badge className={TX_STYLES[tx.kind]} variant='outline'>
                      {t(`tx.${tx.kind}`)}
                    </Badge>
                    <div>
                      {tx.tonnes === undefined ? null : (
                        <p className='font-semibold'>
                          {formatCarbonTonnes(tx.tonnes)}
                        </p>
                      )}
                      <p className='text-muted-foreground text-xs'>
                        {tx.timestamp > 0
                          ? formatRelative(
                              new Date(tx.timestamp * 1000),
                              locale
                            )
                          : `#${tx.blockNumber.toString()}`}
                      </p>
                    </div>
                  </div>
                  <div className='text-right'>
                    {tx.usd === undefined ? null : (
                      <p className='font-semibold'>{formatCurrency(tx.usd)}</p>
                    )}
                    <a
                      className='text-primary text-xs hover:underline'
                      href={explorerTxUrl(tx.txHash)}
                      rel='noopener noreferrer'
                      target='_blank'
                    >
                      {t('tx.viewOnExplorer')}
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className='rounded-none border-dashed shadow-none'>
              <CardContent className='py-8 text-center text-muted-foreground'>
                {isConnected ? t('tx.empty') : t('asset.emptyDisconnected')}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PortfolioPage;
