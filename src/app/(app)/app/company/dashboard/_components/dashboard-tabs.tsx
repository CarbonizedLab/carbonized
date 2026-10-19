'use client';

import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAddress } from '@/lib/carb-format';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import type { EmissionPoint, OnchainCompany } from '@/lib/registry';
import type { CarbonCredit } from '@/types/carb';
import { messages } from '../../_messages';

const PERCENT = 100;

const chartTooltipStyle = {
  backgroundColor: 'var(--color-popover)',
  color: 'var(--color-popover-foreground)',
  border: '1px solid var(--color-border)',
  borderRadius: 0,
} as const;

const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 12 };

const INTL_LOCALES: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };

const formatDate = (unixSeconds: number, locale: Locale): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(INTL_LOCALES[locale], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const QUICK_ACTIONS = [
  {
    href: '/app/credit-requests',
    labelKey: 'tabs.action.requestCredits',
    primary: true,
  },
  {
    href: '/app/marketplace',
    labelKey: 'tabs.action.buyCredits',
    primary: false,
  },
  {
    href: '/app/sell-credits',
    labelKey: 'tabs.action.sellCredits',
    primary: true,
  },
  {
    href: '/app/auctions',
    labelKey: 'tabs.action.auctions',
    primary: false,
  },
  {
    href: '/app/company/register',
    labelKey: 'tabs.action.editProfile',
    primary: false,
  },
  {
    href: '/app/emissions',
    labelKey: 'tabs.action.emissionsTracker',
    primary: false,
  },
] as const;

export const KybBadge = ({ verified }: { verified: boolean }) => {
  const t = useT(messages);
  return (
    <Badge
      className={
        verified
          ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
          : 'border-amber-500/50 text-amber-600 dark:text-amber-400'
      }
      variant='outline'
    >
      {verified ? t('tabs.kyb.verified') : t('tabs.kyb.pending')}
    </Badge>
  );
};

interface OverviewTabProps {
  company: OnchainCompany;
  walletAddress: string;
  creditsDeficit: number;
  fullyCovered: boolean;
}

export const OverviewTab = ({
  company,
  walletAddress,
  creditsDeficit,
  fullyCovered,
}: OverviewTabProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  return (
    <div className='grid gap-4 lg:grid-cols-3'>
      <div className='space-y-4 lg:col-span-2'>
        <Card className='rounded-none border-dashed shadow-none'>
          <CardHeader>
            <CardTitle>{t('tabs.contact.title')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div>
              <p className='text-muted-foreground text-sm'>
                {t('tabs.contact.hash')}
              </p>
              <p className='font-mono text-sm'>
                {formatAddress(company.contactHash, 8)}
              </p>
              <p className='text-muted-foreground text-xs'>
                {t('tabs.contact.hashHint')}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground text-sm'>
                {t('tabs.contact.wallet')}
              </p>
              <p className='font-mono text-sm'>
                {formatAddress(walletAddress, 8)}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground text-sm'>
                {t('tabs.contact.registered')}
              </p>
              <p>{formatDate(company.registeredAt, locale)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className='rounded-none border-dashed shadow-none'>
          <CardHeader>
            <CardTitle>{t('tabs.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-3'>
            {QUICK_ACTIONS.map((action) => (
              <Button
                asChild
                key={action.href}
                variant={action.primary ? 'default' : 'secondary'}
              >
                <Link href={action.href}>{t(action.labelKey)}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className='h-fit rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('tabs.status.title')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='border border-emerald-500/30 border-dashed p-4'>
            <p className='font-semibold text-emerald-600 text-sm dark:text-emerald-400'>
              {t('tabs.status.registration')}
            </p>
            <p className='font-bold'>{t('tabs.status.registeredOnchain')}</p>
          </div>

          <div className='border border-dashed p-4'>
            <p className='font-semibold text-sm'>{t('tabs.status.kyb')}</p>
            <p className='font-bold'>
              {company.verified
                ? t('tabs.status.verified')
                : t('tabs.status.pendingReview')}
            </p>
            {company.verified ? null : (
              <p className='mt-2 text-muted-foreground text-xs'>
                {t('tabs.status.verifierHint')}
              </p>
            )}
          </div>

          {creditsDeficit > 0 ? (
            <div className='border border-amber-500/30 border-dashed p-4'>
              <p className='font-semibold text-amber-600 text-sm dark:text-amber-400'>
                {t('tabs.status.actionRequired')}
              </p>
              <p className='font-bold'>
                {t('tabs.status.creditsNeeded', {
                  amount: creditsDeficit.toFixed(2),
                })}
              </p>
              <p className='mt-2 text-muted-foreground text-xs'>
                {t('tabs.status.buyMore')}
              </p>
            </div>
          ) : null}

          {fullyCovered ? (
            <div className='border border-dashed p-4'>
              <p className='font-semibold text-primary text-sm'>
                {t('tabs.status.compliant')}
              </p>
              <p className='font-bold'>{t('tabs.status.fullyCovered')}</p>
              <p className='mt-2 text-muted-foreground text-xs'>
                {t('tabs.status.sellExcess')}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

interface EmissionsTabProps {
  company: OnchainCompany;
  history: EmissionPoint[];
  totalEmissions: number;
}

const SCOPE_BARS = [
  {
    key: 'scope1',
    labelKey: 'tabs.scope1.label',
    barClass: 'bg-red-500',
  },
  {
    key: 'scope2',
    labelKey: 'tabs.scope2.label',
    barClass: 'bg-amber-500',
  },
  {
    key: 'scope3',
    labelKey: 'tabs.scope3.label',
    barClass: 'bg-blue-500',
  },
] as const;

export const EmissionsTab = ({
  company,
  history,
  totalEmissions,
}: EmissionsTabProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const chartData = history.map((point, index) => ({
    id: `${point.timestamp}-${index}`,
    label: formatDate(point.timestamp, locale),
    scope1: point.scope1,
    scope2: point.scope2,
    scope3: point.scope3,
  }));

  return (
    <div className='space-y-4'>
      <Card className='rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('tabs.emissions.historyTitle')}</CardTitle>
          <p className='text-muted-foreground text-sm'>
            {t('tabs.emissions.historyDesc')}
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer height={300} width='100%'>
              <BarChart data={chartData}>
                <CartesianGrid
                  stroke='var(--color-border)'
                  strokeDasharray='3 3'
                />
                <XAxis
                  dataKey='label'
                  stroke='var(--color-border)'
                  tick={axisTick}
                />
                <YAxis stroke='var(--color-border)' tick={axisTick} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                />
                <Legend />
                <Bar
                  dataKey='scope1'
                  fill='#ef4444'
                  name={t('tabs.emissions.scope1')}
                  stackId='a'
                />
                <Bar
                  dataKey='scope2'
                  fill='#f59e0b'
                  name={t('tabs.emissions.scope2')}
                  stackId='a'
                />
                <Bar
                  dataKey='scope3'
                  fill='#3b82f6'
                  name={t('tabs.emissions.scope3')}
                  stackId='a'
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className='py-8 text-center text-muted-foreground text-sm'>
              {t('tabs.emissions.empty')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className='rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('tabs.emissions.breakdown')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {SCOPE_BARS.map((row) => {
            const tonnes = company[row.key];
            const width =
              totalEmissions > 0 ? (tonnes / totalEmissions) * PERCENT : 0;
            return (
              <div key={row.key}>
                <div className='mb-2 flex justify-between text-sm'>
                  <p className='text-muted-foreground'>{t(row.labelKey)}</p>
                  <p className='font-semibold'>
                    {t('tabs.emissions.tonnes', { amount: tonnes.toFixed(2) })}
                  </p>
                </div>
                <div className='h-2 w-full bg-muted'>
                  <div
                    className={`h-2 ${row.barClass}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
          {company.target > 0 ? (
            <p className='border-t border-dashed pt-4 text-muted-foreground text-sm'>
              {t('tabs.emissions.target')}{' '}
              <span className='font-semibold text-foreground'>
                {t('tabs.emissions.tonnes', {
                  amount: company.target.toFixed(2),
                })}
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export const CreditsTab = ({ credits }: { credits: CarbonCredit[] }) => {
  const t = useT(messages);
  if (credits.length === 0) {
    return (
      <Card className='rounded-none border-dashed shadow-none'>
        <CardContent>
          <EmptyState
            action={
              <Button asChild>
                <Link href='/app/marketplace'>{t('tabs.credits.buyNow')}</Link>
              </Button>
            }
            description={t('tabs.credits.emptyDesc')}
            title={t('tabs.credits.emptyTitle')}
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {credits.map((credit) => (
        <Card
          className='rounded-none border-dashed shadow-none'
          key={credit.id}
        >
          <CardHeader>
            <div className='flex items-start justify-between'>
              <div>
                <CardTitle>
                  {credit.projectName || t('tabs.credits.fallbackName')}
                </CardTitle>
                <p className='text-muted-foreground text-sm'>
                  {t('tabs.credits.tokenId', { id: credit.id })}
                </p>
              </div>
              <Badge
                className='border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                variant='outline'
              >
                {t('tabs.credits.active')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <div className='flex justify-between'>
              <p className='text-muted-foreground'>
                {t('tabs.credits.amount')}
              </p>
              <p className='font-semibold'>
                {t('tabs.emissions.tonnes', { amount: credit.co2Tonnes })}
              </p>
            </div>
            <div className='flex justify-between'>
              <p className='text-muted-foreground'>
                {t('tabs.credits.methodology')}
              </p>
              <p>{credit.methodology}</p>
            </div>
            <div className='flex justify-between'>
              <p className='text-muted-foreground'>
                {t('tabs.credits.vintage')}
              </p>
              <p>{credit.vintageYear}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const RequestsTab = () => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent>
        <EmptyState
          action={
            <Button asChild>
              <Link href='/app/credit-requests'>
                {t('tabs.action.requestCredits')}
              </Link>
            </Button>
          }
          description={t('tabs.requests.desc')}
          title={t('tabs.requests.title')}
        />
      </CardContent>
    </Card>
  );
};
