'use client';

import { ArrowRight, Calculator, Flame, Layers, Store } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { Allocation } from '../_lib/allocation';
import { messages } from '../_messages';
import { ALLOCATION_COLORS, AllocationCharts } from './allocation-charts';

interface SurplusCalculatorProps {
  allocation: Allocation;
  year: number;
  reservePct: number;
  onReservePctChange: (value: number) => void;
}

const QUICK_RESERVE = [0, 25, 50, 100] as const;

const PlanRow = ({
  color,
  label,
  hint,
  value,
}: {
  color: string;
  label: string;
  hint: string;
  value: string;
}) => (
  <li className='flex items-start justify-between gap-3 border border-dashed p-3'>
    <div className='flex items-start gap-2'>
      <span
        aria-hidden='true'
        className='mt-1.5 size-2.5 shrink-0'
        style={{ backgroundColor: color }}
      />
      <div>
        <p className='font-medium text-sm'>{label}</p>
        <p className='text-muted-foreground text-xs'>{hint}</p>
      </div>
    </div>
    <p className='whitespace-nowrap font-semibold tabular-nums'>{value}</p>
  </li>
);

export const SurplusCalculator = ({
  allocation,
  year,
  reservePct,
  onReservePctChange,
}: SurplusCalculatorProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const tonnes = (value: number) =>
    `${formatNumber(value, locale, 2)} ${t('unit.tco2e')}`;
  const hasSurplus = allocation.surplus > 0;

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Calculator className='size-4 text-primary' />
          {t('calc.title')}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('calc.description', { year })}
        </p>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='grid gap-6 xl:grid-cols-2'>
          <div className='space-y-4'>
            <ul className='space-y-2'>
              <PlanRow
                color={ALLOCATION_COLORS.offset}
                hint={t('calc.offsetHint', {
                  need: formatNumber(allocation.need, locale, 2),
                })}
                label={t('calc.offset')}
                value={tonnes(allocation.covered)}
              />
              <PlanRow
                color={ALLOCATION_COLORS.reserve}
                hint={t('calc.reserveHint', { pct: reservePct })}
                label={t('calc.reserve')}
                value={tonnes(allocation.reserve)}
              />
              <PlanRow
                color={ALLOCATION_COLORS.sellable}
                hint={t('calc.sellableHint')}
                label={t('calc.sellable')}
                value={tonnes(allocation.sellable)}
              />
              {allocation.shortfall > 0 ? (
                <PlanRow
                  color={ALLOCATION_COLORS.shortfall}
                  hint={t('calc.shortfallHint')}
                  label={t('calc.shortfall')}
                  value={tonnes(allocation.shortfall)}
                />
              ) : null}
            </ul>

            <div className='space-y-3 border border-dashed p-3'>
              <div className='flex items-center justify-between gap-2'>
                <label className='font-medium text-sm' htmlFor='reserve-slider'>
                  {t('calc.sliderLabel')}
                </label>
                <span className='font-semibold text-sm tabular-nums'>
                  {reservePct}%
                </span>
              </div>
              <input
                aria-valuetext={t('calc.sliderValue', {
                  pct: reservePct,
                  tonnes: tonnes(allocation.reserve),
                })}
                className='h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50'
                disabled={!hasSurplus}
                id='reserve-slider'
                max={100}
                min={0}
                onChange={(event) =>
                  onReservePctChange(Number(event.target.value))
                }
                step={1}
                type='range'
                value={reservePct}
              />
              <div className='flex flex-wrap items-center gap-2'>
                {QUICK_RESERVE.map((pct) => (
                  <Button
                    aria-pressed={reservePct === pct}
                    disabled={!hasSurplus}
                    key={pct}
                    onClick={() => onReservePctChange(pct)}
                    size='sm'
                    type='button'
                    variant={reservePct === pct ? 'default' : 'outline'}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
              <p className='text-muted-foreground text-xs'>
                {hasSurplus ? t('calc.sliderHelp') : t('calc.noSurplus')}
              </p>
            </div>
          </div>

          <AllocationCharts allocation={allocation} />
        </div>

        <div className='flex flex-wrap items-center gap-2 border-t border-dashed pt-4'>
          <Button asChild variant='outline'>
            <Link href='/app/carbon-wallet'>
              <Flame />
              {t('calc.ctaRetire')}
            </Link>
          </Button>
          <Button asChild variant='outline'>
            <Link href='/app/tokenize'>
              <Layers />
              {t('calc.ctaWrap')}
            </Link>
          </Button>
          <Button asChild>
            <Link href='/app/sell-credits'>
              <Store />
              {t('calc.ctaSell')}
              <ArrowRight />
            </Link>
          </Button>
          <p className='basis-full text-muted-foreground text-xs'>
            {t('calc.ctaHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
