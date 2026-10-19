'use client';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatMonth,
  formatNumber,
  type MonthlyBreakdown,
} from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

export const SCOPE_COLORS = {
  scope1: '#10b981',
  scope2: '#3b82f6',
  scope3: '#f59e0b',
} as const;

const axisTick = { fontSize: 12, fill: 'var(--color-muted-foreground)' };
const tooltipStyle = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-popover-foreground)',
};
const CURSOR_STYLE = { fill: 'var(--color-muted)', opacity: 0.4 };

export const MonthlyChart = ({
  data,
  year,
  total,
}: {
  data: MonthlyBreakdown[];
  year: number;
  total: number;
}) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const chartData = data.map((entry) => ({
    ...entry,
    label: formatMonth(entry.month, locale),
  }));
  const hasData = total > 0;

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('chart.title', { year })}</CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('chart.description')}
        </p>
      </CardHeader>
      <CardContent>
        <div
          aria-label={t('chart.aria', {
            year,
            total: formatNumber(total, locale),
          })}
          className='relative h-72 w-full'
          role='img'
        >
          {hasData ? null : (
            <p className='absolute inset-0 z-10 flex items-center justify-center text-center text-muted-foreground text-sm'>
              {t('chart.empty')}
            </p>
          )}
          <ResponsiveContainer height='100%' width='100%'>
            <BarChart data={chartData} margin={{ left: -12, right: 8 }}>
              <CartesianGrid
                stroke='var(--color-border)'
                strokeDasharray='4 4'
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey='label'
                tick={axisTick}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={axisTick}
                tickFormatter={(value: number) => formatNumber(value, locale)}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={CURSOR_STYLE}
                formatter={(value, name): [string, string] => [
                  `${formatNumber(Number(value), locale, 3)} ${t('unit.tco2e')}`,
                  String(name),
                ]}
              />
              <Legend iconType='square' wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey='scope1'
                fill={SCOPE_COLORS.scope1}
                name={t('scope.1.short')}
                stackId='emissions'
              />
              <Bar
                dataKey='scope2'
                fill={SCOPE_COLORS.scope2}
                name={t('scope.2.short')}
                stackId='emissions'
              />
              <Bar
                dataKey='scope3'
                fill={SCOPE_COLORS.scope3}
                name={t('scope.3.short')}
                radius={[2, 2, 0, 0]}
                stackId='emissions'
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
