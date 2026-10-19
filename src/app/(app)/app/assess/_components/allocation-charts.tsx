'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { Allocation } from '../_lib/allocation';
import { messages } from '../_messages';

export const ALLOCATION_COLORS = {
  offset: '#10b981',
  reserve: '#f59e0b',
  sellable: '#3b82f6',
  shortfall: '#ef4444',
} as const;

const axisTick = { fontSize: 12, fill: 'var(--color-muted-foreground)' };
const tooltipStyle = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-popover-foreground)',
};
const CURSOR_STYLE = { fill: 'var(--color-muted)', opacity: 0.4 };
const EMPTY_RING_COLOR = 'var(--color-muted)';

type SegmentKey = keyof typeof ALLOCATION_COLORS;

export const AllocationCharts = ({
  allocation,
}: {
  allocation: Allocation;
}) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const segments: { key: SegmentKey; value: number }[] = [
    { key: 'offset', value: allocation.covered },
    { key: 'reserve', value: allocation.reserve },
    { key: 'sellable', value: allocation.sellable },
    { key: 'shortfall', value: allocation.shortfall },
  ];
  const donutData = segments.filter((segment) => segment.value > 0);
  const hasData = donutData.length > 0;
  const centerLabel =
    allocation.coveragePct === null
      ? '—'
      : `${formatNumber(allocation.coveragePct, locale, 0)}%`;

  const barData = [
    {
      name: t('chart.emissions'),
      offset: allocation.covered,
      reserve: 0,
      sellable: 0,
      shortfall: allocation.shortfall,
    },
    {
      name: t('chart.credits'),
      offset: allocation.covered,
      reserve: allocation.reserve,
      sellable: allocation.sellable,
      shortfall: 0,
    },
  ];

  const formatTooltip = (value: unknown, name: unknown): [string, string] => [
    `${formatNumber(Number(value), locale, 2)} ${t('unit.tco2e')}`,
    String(name),
  ];

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <div
        aria-label={t('chart.donutAria', { pct: centerLabel })}
        className='relative h-64'
        role='img'
      >
        <ResponsiveContainer height='100%' width='100%'>
          <PieChart>
            <Pie
              data={hasData ? donutData : [{ key: 'none', value: 1 }]}
              dataKey='value'
              innerRadius='62%'
              nameKey='key'
              outerRadius='88%'
              paddingAngle={hasData ? 2 : 0}
              stroke='none'
            >
              {hasData
                ? donutData.map((segment) => (
                    <Cell
                      fill={ALLOCATION_COLORS[segment.key]}
                      key={segment.key}
                    />
                  ))
                : [<Cell fill={EMPTY_RING_COLOR} key='none' />]}
            </Pie>
            {hasData ? (
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  formatTooltip(value, t(`chart.${String(name)}`))
                }
              />
            ) : null}
          </PieChart>
        </ResponsiveContainer>
        <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
          <span className='font-bold text-3xl tracking-tight'>
            {centerLabel}
          </span>
          <span className='text-muted-foreground text-xs'>
            {t('chart.coverage')}
          </span>
        </div>
      </div>

      <div aria-label={t('chart.barAria')} className='h-64' role='img'>
        <ResponsiveContainer height='100%' width='100%'>
          <BarChart
            data={barData}
            layout='vertical'
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke='var(--color-border)'
              strokeDasharray='4 4'
            />
            <XAxis
              axisLine={false}
              tick={axisTick}
              tickFormatter={(value: number) => formatNumber(value, locale, 0)}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              dataKey='name'
              tick={axisTick}
              tickLine={false}
              type='category'
              width={76}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={CURSOR_STYLE}
              formatter={formatTooltip}
            />
            <Legend iconType='square' wrapperStyle={{ fontSize: 12 }} />
            {(['offset', 'reserve', 'sellable', 'shortfall'] as const).map(
              (key) => (
                <Bar
                  dataKey={key}
                  fill={ALLOCATION_COLORS[key]}
                  key={key}
                  name={t(`chart.${key}`)}
                  stackId='allocation'
                />
              )
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
