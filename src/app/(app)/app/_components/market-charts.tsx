'use client';

import { Activity, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PriceSeries } from '../_lib/aggregate';
import { AXIS_TICK, CHART_HEIGHT, TOOLTIP_STYLE } from '../_lib/chart-style';
import type { DayBucket } from '../_lib/types';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface MarketChartsProps {
  series: PriceSeries | null;
  volume: DayBucket[] | null;
}

const PRICE_GRADIENT_ID = 'dashboard-price-gradient';

const PriceTrend = ({ series }: { series: PriceSeries | null }) => {
  const t = useT(messages);
  const { usd } = useFormatters();
  const { change } = series ?? {};

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-start justify-between gap-2'>
        <div className='space-y-1'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <TrendingUp className='size-5 text-primary' />
            {t('price.title')}
          </CardTitle>
          <p className='text-muted-foreground text-xs'>
            {series ? t(`price.source.${series.source}`) : null}
          </p>
        </div>
        {series?.source === 'demo' ? (
          <Badge variant='secondary'>{t('common.demo')}</Badge>
        ) : null}
        {change === undefined ? null : (
          <Badge
            className={cn(
              change >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive'
            )}
            variant='outline'
          >
            {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {series ? (
          <ResponsiveContainer height={CHART_HEIGHT} width='100%'>
            <AreaChart data={series.points}>
              <defs>
                <linearGradient
                  id={PRICE_GRADIENT_ID}
                  x1='0'
                  x2='0'
                  y1='0'
                  y2='1'
                >
                  <stop
                    offset='5%'
                    stopColor='var(--color-primary)'
                    stopOpacity={0.3}
                  />
                  <stop
                    offset='95%'
                    stopColor='var(--color-primary)'
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke='var(--color-border)'
                strokeDasharray='3 3'
                vertical={false}
              />
              <XAxis
                dataKey='label'
                minTickGap={24}
                stroke='var(--color-border)'
                tick={AXIS_TICK}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke='var(--color-border)'
                tick={AXIS_TICK}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => usd(Number(value))}
              />
              <Area
                dataKey='price'
                fill={`url(#${PRICE_GRADIENT_ID})`}
                fillOpacity={1}
                name={t('price.series')}
                stroke='var(--color-primary)'
                type='monotone'
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Skeleton className='h-64 rounded-none' />
        )}
      </CardContent>
    </Card>
  );
};

const TradingVolume = ({ volume }: { volume: DayBucket[] | null }) => {
  const t = useT(messages);
  const { usd, tonnes } = useFormatters();
  const hasFills = volume?.some((day) => day.volume > 0 || day.tonnes > 0);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-start justify-between gap-2'>
        <div className='space-y-1'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Activity className='size-5 text-primary' />
            {t('volume.title')}
          </CardTitle>
          <p className='text-muted-foreground text-xs'>{t('volume.desc')}</p>
        </div>
        <Badge variant='secondary'>{t('volume.badge')}</Badge>
      </CardHeader>
      <CardContent>
        {volume ? (
          <div className='relative'>
            <ResponsiveContainer height={CHART_HEIGHT} width='100%'>
              <BarChart data={volume}>
                <CartesianGrid
                  stroke='var(--color-border)'
                  strokeDasharray='3 3'
                  vertical={false}
                />
                <XAxis
                  dataKey='label'
                  stroke='var(--color-border)'
                  tick={AXIS_TICK}
                />
                <YAxis stroke='var(--color-border)' tick={AXIS_TICK} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, _name, item) => [
                    usd(Number(value)),
                    `${t('volume.series')} (${tonnes(Number(item.payload?.tonnes ?? 0))})`,
                  ]}
                />
                <Bar
                  dataKey='volume'
                  fill='var(--color-primary)'
                  name={t('volume.series')}
                  opacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
            {hasFills ? null : (
              <p className='pointer-events-none absolute inset-0 flex items-center justify-center text-center text-muted-foreground text-sm'>
                {t('volume.empty')}
              </p>
            )}
          </div>
        ) : (
          <Skeleton className='h-64 rounded-none' />
        )}
      </CardContent>
    </Card>
  );
};

export const MarketCharts = ({ series, volume }: MarketChartsProps) => (
  <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
    <PriceTrend series={series} />
    <TradingVolume volume={volume} />
  </div>
);
