'use client';

import { BarChart3 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import {
  AXIS_TICK,
  CHART_HEIGHT,
  RETIRED_COLOR,
  TOOLTIP_STYLE,
} from '../_lib/chart-style';
import type { WeekBucket } from '../_lib/types';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface WeeklyChartProps {
  buckets: WeekBucket[] | null;
}

export const WeeklyChart = ({ buckets }: WeeklyChartProps) => {
  const t = useT(messages);
  const { tonnes } = useFormatters();
  const hasActivity = buckets?.some((b) => b.minted > 0 || b.retired > 0);
  const data = buckets?.map((b) => ({
    ...b,
    minted: Number(b.minted.toFixed(2)),
    retired: Number(b.retired.toFixed(2)),
  }));

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-start justify-between gap-2'>
        <div className='space-y-1'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <BarChart3 className='size-5 text-primary' />
            {t('weekly.title')}
          </CardTitle>
          <p className='text-muted-foreground text-xs'>{t('weekly.desc')}</p>
        </div>
        <Badge variant='secondary'>{t('weekly.badge')}</Badge>
      </CardHeader>
      <CardContent>
        {data ? (
          <div className='relative'>
            <ResponsiveContainer height={CHART_HEIGHT} width='100%'>
              <BarChart data={data}>
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
                  formatter={(value) => tonnes(Number(value))}
                />
                <Legend />
                <Bar
                  dataKey='minted'
                  fill='var(--color-primary)'
                  name={t('weekly.minted')}
                  opacity={0.85}
                />
                <Bar
                  dataKey='retired'
                  fill={RETIRED_COLOR}
                  name={t('weekly.retired')}
                  opacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
            {hasActivity ? null : (
              <p className='pointer-events-none absolute inset-0 flex items-center justify-center text-center text-muted-foreground text-sm'>
                {t('weekly.empty')}
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
