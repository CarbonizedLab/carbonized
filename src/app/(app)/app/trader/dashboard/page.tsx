'use client';

import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatAddress } from '@/lib/carb-format';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import { isRegistryConfigured, type OnchainTrader } from '@/lib/registry';
import type { CarbonCredit } from '@/types/carb';
import { messages } from '../_messages';

const PERCENT = 100;
const ALLOCATION_COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#22c55e',
  '#06b6d4',
  '#a855f7',
];
const TABS = ['overview', 'portfolio', 'trading', 'analytics'] as const;
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };

const mockPriceHistory = [
  { date: '1/1', price: 22.5 },
  { date: '1/2', price: 23.1 },
  { date: '1/3', price: 22.8 },
  { date: '1/4', price: 24.2 },
  { date: '1/5', price: 25.0 },
  { date: '1/6', price: 24.5 },
  { date: '1/7', price: 26.3 },
];

const mockPortfolioHistory = [
  { month: 'Sep', value: 1000 },
  { month: 'Oct', value: 1200 },
  { month: 'Nov', value: 1150 },
  { month: 'Dec', value: 1400 },
  { month: 'Jan', value: 1650 },
  { month: 'Feb', value: 1800 },
];

const mockTradingSeries = [
  { time: '09:00', price: 24.1, volume: 120 },
  { time: '10:00', price: 24.6, volume: 160 },
  { time: '11:00', price: 24.4, volume: 140 },
  { time: '12:00', price: 24.9, volume: 220 },
  { time: '13:00', price: 25.3, volume: 250 },
  { time: '14:00', price: 25.0, volume: 210 },
  { time: '15:00', price: 25.6, volume: 280 },
  { time: '16:00', price: 25.8, volume: 300 },
];

const chartTooltipStyle = {
  backgroundColor: 'var(--color-popover)',
  color: 'var(--color-popover-foreground)',
  border: '1px solid var(--color-border)',
  borderRadius: 0,
} as const;

const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 12 };

const lastPrice = mockTradingSeries.at(-1)?.price ?? 0;

const DemoBadge = () => {
  const t = useT(messages);
  return (
    <Badge className='font-normal text-xs' variant='outline'>
      {t('dash.demo')}
    </Badge>
  );
};

/** Share of held tonnes per methodology (real data from the wallet's credits). */
const buildAllocation = (credits: CarbonCredit[], unknownLabel: string) => {
  const byMethodology = new Map<string, number>();
  for (const credit of credits) {
    const key = credit.methodology || unknownLabel;
    byMethodology.set(
      key,
      (byMethodology.get(key) ?? 0) + Number(credit.co2Tonnes || 0)
    );
  }
  const total = [...byMethodology.values()].reduce((sum, v) => sum + v, 0);
  return [...byMethodology.entries()].map(([name, tonnes], index) => ({
    name,
    value: total > 0 ? (tonnes / total) * PERCENT : 0,
    color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
  }));
};

const TraderDashboardPage = () => {
  const t = useT(messages);
  const locale = useLocaleStore((s) => s.locale);
  const { address, isConnected } = useAccount();
  const { getTraderData, getUserCredits, getErc20Balance, getCarbonPrice } =
    useContractInteraction();

  const [trader, setTrader] = useState<OnchainTrader | null>(null);
  const [credits, setCredits] = useState<CarbonCredit[]>([]);
  const [cctBalance, setCctBalance] = useState(0);
  const [carbonPrice, setCarbonPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!(isConnected && address)) {
      return;
    }

    const fetchData = async () => {
      try {
        const [traderData, userCredits, currentCctBalance, price] =
          await Promise.all([
            getTraderData(address),
            getUserCredits(address).catch(() => [] as CarbonCredit[]),
            getErc20Balance(CONTRACTS.carbonCreditToken, address),
            getCarbonPrice(),
          ]);
        setTrader(traderData);
        setCredits((userCredits || []).filter((credit) => !credit?.isRetired));
        setCctBalance(Number(currentCctBalance || 0));
        setCarbonPrice(price);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [
    isConnected,
    address,
    getTraderData,
    getUserCredits,
    getErc20Balance,
    getCarbonPrice,
  ]);

  if (!isConnected) {
    return (
      <EmptyState
        description={t('dash.connect.desc')}
        icon={<Wallet className='size-8' />}
        title={t('dash.connect.title')}
      />
    );
  }

  if (!isRegistryConfigured()) {
    return (
      <EmptyState
        description={t('common.registryNotConfiguredDesc')}
        icon={<Wallet className='size-8' />}
        title={t('common.registryNotConfiguredTitle')}
      />
    );
  }

  if (loading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-8 w-64' />
        <div className='grid gap-4 md:grid-cols-4'>
          <Skeleton className='h-28 rounded-none' />
          <Skeleton className='h-28 rounded-none' />
          <Skeleton className='h-28 rounded-none' />
          <Skeleton className='h-28 rounded-none' />
        </div>
        <Skeleton className='h-72 rounded-none' />
      </div>
    );
  }

  if (!trader) {
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link href='/app/trader/register'>{t('dash.notFound.action')}</Link>
          </Button>
        }
        description={t('dash.notFound.desc')}
        icon={<Wallet className='size-8' />}
        title={t('dash.notFound.title')}
      />
    );
  }

  const creditTonnes = credits.reduce(
    (sum, credit) => sum + Number(credit?.co2Tonnes || 0),
    0
  );
  const portfolioValue =
    carbonPrice === null ? null : creditTonnes * carbonPrice;
  const allocation = buildAllocation(credits, t('dash.unknownMethodology'));
  const memberSince = new Date(
    trader.registrationDate * 1000
  ).toLocaleDateString(INTL_LOCALE[locale]);
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {trader.name}
          </h1>
          <p className='text-muted-foreground'>{t('dash.role')}</p>
        </div>
        {trader.isActive ? (
          <Badge
            className='border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
            variant='outline'
          >
            {t('dash.activeTrader')}
          </Badge>
        ) : null}
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          label={t('dash.stat.portfolio')}
          subtext={t('dash.stat.portfolioSub')}
          value={
            portfolioValue === null ? '—' : `$${portfolioValue.toFixed(2)}`
          }
        />
        <StatCard
          label={t('dash.stat.credits')}
          subtext={t('dash.stat.creditsSub', { count: credits.length })}
          value={creditTonnes.toFixed(2)}
        />
        <StatCard
          label={t('dash.stat.cct')}
          subtext={t('dash.stat.cctSub')}
          value={cctBalance.toFixed(2)}
        />
        <StatCard
          label={t('dash.stat.member')}
          subtext={t('dash.stat.memberSub')}
          value={memberSince}
        />
      </div>

      <Tabs defaultValue='overview'>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger className='capitalize' key={tab} value={tab}>
              {t(`dash.tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='overview'>
          <div className='grid gap-4 lg:grid-cols-3'>
            <div className='space-y-4 lg:col-span-2'>
              <Card className='rounded-none border-dashed shadow-none'>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    {t('dash.growth')} <DemoBadge />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer height={300} width='100%'>
                    <AreaChart data={mockPortfolioHistory}>
                      <CartesianGrid
                        stroke='var(--color-border)'
                        strokeDasharray='3 3'
                      />
                      <XAxis
                        dataKey='month'
                        stroke='var(--color-border)'
                        tick={axisTick}
                      />
                      <YAxis stroke='var(--color-border)' tick={axisTick} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Area
                        dataKey='value'
                        fill='var(--color-primary)'
                        fillOpacity={0.2}
                        stroke='var(--color-primary)'
                        type='monotone'
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className='rounded-none border-dashed shadow-none'>
                <CardHeader>
                  <CardTitle>{t('dash.quickActions')}</CardTitle>
                </CardHeader>
                <CardContent className='grid grid-cols-2 gap-3'>
                  <Button asChild>
                    <Link href='/app/marketplace'>
                      {t('common.buyCredits')}
                    </Link>
                  </Button>
                  <Button asChild variant='secondary'>
                    <Link href='/app/sell-credits'>
                      {t('common.sellCredits')}
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href='/app/auctions'>{t('dash.viewAuctions')}</Link>
                  </Button>
                  <Button asChild variant='secondary'>
                    <Link href='/app/portfolio'>{t('dash.myPortfolio')}</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className='space-y-4'>
              <Card className='rounded-none border-dashed shadow-none'>
                <CardHeader>
                  <CardTitle>{t('dash.carbonPrice')}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <p className='font-bold text-3xl text-primary'>
                      {carbonPrice === null
                        ? '—'
                        : `$${carbonPrice.toFixed(2)}`}
                    </p>
                    <p className='text-muted-foreground text-sm'>
                      {t('dash.perTonne')}
                    </p>
                  </div>
                  <ResponsiveContainer height={100} width='100%'>
                    <LineChart data={mockPriceHistory}>
                      <Line
                        dataKey='price'
                        dot={false}
                        stroke='var(--color-primary)'
                        strokeWidth={2}
                        type='monotone'
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className='text-muted-foreground text-xs'>
                    {t('dash.trendIllustrative')} <DemoBadge />
                  </p>
                </CardContent>
              </Card>

              <Card className='rounded-none border-dashed shadow-none'>
                <CardHeader>
                  <CardTitle>{t('dash.allocation')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {allocation.length > 0 ? (
                    <>
                      <ResponsiveContainer height={200} width='100%'>
                        <PieChart>
                          <Pie
                            cx='50%'
                            cy='50%'
                            data={allocation}
                            dataKey='value'
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={2}
                            stroke='var(--color-background)'
                          >
                            {allocation.map((entry) => (
                              <Cell fill={entry.color} key={entry.name} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className='mt-4 space-y-2'>
                        {allocation.map((item) => (
                          <div
                            className='flex items-center justify-between text-sm'
                            key={item.name}
                          >
                            <div className='flex items-center gap-2'>
                              <div
                                className='size-3 rounded-full'
                                style={{ backgroundColor: item.color }}
                              />
                              <span className='text-muted-foreground'>
                                {item.name}
                              </span>
                            </div>
                            <span className='font-semibold'>
                              {item.value.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className='py-6 text-center text-muted-foreground text-sm'>
                      {t('dash.allocationEmpty')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className='rounded-none border-dashed shadow-none'>
                <CardHeader>
                  <CardTitle>{t('dash.account')}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  <div>
                    <p className='text-muted-foreground'>
                      {t('dash.account.contactHash')}
                    </p>
                    <p className='font-mono text-xs'>
                      {formatAddress(trader.contactHash, 8)}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('dash.account.contactHashHint')}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground'>
                      {t('dash.account.country')}
                    </p>
                    <p>{trader.country}</p>
                  </div>
                  <div>
                    <p className='text-muted-foreground'>
                      {t('dash.account.wallet')}
                    </p>
                    <p className='font-mono text-xs'>
                      {formatAddress(trader.walletAddress, 8)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value='portfolio'>
          {credits.length > 0 ? (
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              {credits.map((credit) => (
                <Card
                  className='rounded-none border-dashed shadow-none'
                  key={credit.id}
                >
                  <CardHeader>
                    <div className='flex items-start justify-between'>
                      <div>
                        <CardTitle>
                          {credit.projectName || t('common.fallbackCredit')}
                        </CardTitle>
                        <p className='text-muted-foreground text-sm'>
                          #{credit.id}
                        </p>
                      </div>
                      <Badge
                        className='border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                        variant='outline'
                      >
                        {t('common.active')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-2 text-sm'>
                    <div className='flex justify-between'>
                      <p className='text-muted-foreground'>
                        {t('dash.portfolio.amount')}
                      </p>
                      <p className='font-semibold'>
                        {t('dash.portfolio.tonnes', {
                          amount: credit.co2Tonnes,
                        })}
                      </p>
                    </div>
                    <div className='flex justify-between'>
                      <p className='text-muted-foreground'>
                        {t('dash.portfolio.value')}
                      </p>
                      <p className='font-semibold'>
                        {carbonPrice === null
                          ? '—'
                          : `$${(credit.co2Tonnes * carbonPrice).toFixed(2)}`}
                      </p>
                    </div>
                    <div className='flex justify-between'>
                      <p className='text-muted-foreground'>
                        {t('dash.portfolio.methodology')}
                      </p>
                      <p>{credit.methodology}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className='rounded-none border-dashed shadow-none'>
              <CardContent>
                <EmptyState
                  action={
                    <Button asChild>
                      <Link href='/app/marketplace'>
                        {t('common.buyCreditsNow')}
                      </Link>
                    </Button>
                  }
                  description={t('dash.portfolio.emptyDesc')}
                  title={t('dash.portfolio.emptyTitle')}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value='trading'>
          <div className='grid gap-4 lg:grid-cols-3'>
            <Card className='rounded-none border-dashed shadow-none lg:col-span-2'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  {t('dash.trading.graph')} <DemoBadge />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer height={320} width='100%'>
                  <LineChart data={mockTradingSeries}>
                    <CartesianGrid
                      stroke='var(--color-border)'
                      strokeDasharray='3 3'
                    />
                    <XAxis
                      dataKey='time'
                      stroke='var(--color-border)'
                      tick={axisTick}
                    />
                    <YAxis stroke='var(--color-border)' tick={axisTick} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value) => [
                        `$${Number(value).toFixed(2)}`,
                        t('dash.trading.price'),
                      ]}
                    />
                    <Line
                      dataKey='price'
                      dot={false}
                      stroke='var(--color-primary)'
                      strokeWidth={3}
                      type='monotone'
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className='rounded-none border-dashed shadow-none'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  {t('dash.trading.summary')} <DemoBadge />
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-3 text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                      {t('dash.trading.last')}
                    </span>
                    <span className='font-semibold'>
                      ${lastPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                      {t('dash.trading.high')}
                    </span>
                    <span className='font-semibold'>
                      $
                      {Math.max(
                        ...mockTradingSeries.map((point) => point.price)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                      {t('dash.trading.low')}
                    </span>
                    <span className='font-semibold'>
                      $
                      {Math.min(
                        ...mockTradingSeries.map((point) => point.price)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>
                      {t('dash.trading.volume')}
                    </span>
                    <span className='font-semibold'>
                      {mockTradingSeries.reduce(
                        (sum, point) => sum + point.volume,
                        0
                      )}
                    </span>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <Button asChild>
                    <Link href='/app/marketplace'>{t('dash.trading.buy')}</Link>
                  </Button>
                  <Button asChild variant='secondary'>
                    <Link href='/app/sell-credits'>
                      {t('dash.trading.sell')}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value='analytics'>
          <Card className='rounded-none border-dashed shadow-none'>
            <CardContent>
              <EmptyState
                description={t('dash.analytics.desc')}
                title={t('dash.analytics.title')}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TraderDashboardPage;
