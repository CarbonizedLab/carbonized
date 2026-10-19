'use client';

import { ArrowRight, Check, Layers, Lock, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CCT_POOL_LIST } from '@/config/cct-pools';
import type { TranslateFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CarbonCredit } from '@/types/carb';
import {
  type CreditEligibility,
  formatAmount,
  getEligibility,
  type WrappedCredit,
} from '../_lib/tokenize-utils';

interface CreditCardProps {
  credit: CarbonCredit;
  selected: boolean;
  onToggle: (tokenId: number) => void;
  t: TranslateFn;
}

const getBlockedLabel = (eligibility: CreditEligibility, t: TranslateFn) =>
  eligibility.blocked ? t(`select.flag.${eligibility.blocked}`) : null;

const CreditCard = ({ credit, selected, onToggle, t }: CreditCardProps) => {
  const eligibility = getEligibility(credit);
  const blockedLabel = getBlockedLabel(eligibility, t);
  const disabled = eligibility.blocked !== null;
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer flex-col gap-3 border border-dashed p-4 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent'
      )}
    >
      <input
        aria-label={t('select.cardLabel', {
          project: credit.projectName,
          id: credit.tokenId,
        })}
        checked={selected}
        className='sr-only'
        disabled={disabled}
        onChange={() => onToggle(credit.tokenId)}
        type='checkbox'
      />
      <span className='flex items-start justify-between gap-3'>
        <span className='min-w-0'>
          <span className='block truncate font-semibold'>
            {credit.projectName}
          </span>
          <span className='block font-mono text-muted-foreground text-xs'>
            NFT #{credit.tokenId} ·{' '}
            {credit.serialNumber || t('select.noSerial')}
          </span>
        </span>
        <span
          aria-hidden='true'
          className={cn(
            'flex size-5 shrink-0 items-center justify-center border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-dashed'
          )}
        >
          {selected ? <Check className='size-3.5' /> : null}
        </span>
      </span>

      <span className='grid grid-cols-3 gap-3 text-xs'>
        <span>
          <span className='block text-muted-foreground'>
            {t('select.tonnes')}
          </span>
          <span className='block font-semibold text-sm'>
            {formatAmount(credit.co2Tonnes)} t
          </span>
        </span>
        <span>
          <span className='block text-muted-foreground'>
            {t('select.vintage')}
          </span>
          <span className='block font-medium text-sm'>
            {credit.vintageYear}
          </span>
        </span>
        <span>
          <span className='block text-muted-foreground'>
            {t('select.pool')}
          </span>
          <span className='block font-medium text-sm'>
            {eligibility.pool?.symbol ?? credit.methodology}
          </span>
        </span>
      </span>

      <span className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline'>
          {eligibility.pool?.standard ?? credit.methodology}
        </Badge>
        {credit.geography ? (
          <span className='inline-flex items-center gap-1 text-muted-foreground text-xs'>
            <MapPin className='size-3' />
            {credit.geography}
          </span>
        ) : null}
        {blockedLabel ? (
          <Badge
            className='text-amber-600 dark:text-amber-400'
            variant='outline'
          >
            {blockedLabel}
          </Badge>
        ) : null}
      </span>

      {eligibility.blocked ? (
        <span className='block text-amber-700 text-xs dark:text-amber-300'>
          {t(`select.reason.${eligibility.blocked}`, {
            methodology: credit.methodology,
          })}
        </span>
      ) : null}
    </label>
  );
};

interface WrappedRowProps {
  item: WrappedCredit;
  onUnwrap: () => void;
  t: TranslateFn;
}

const WrappedRow = ({ item, onUnwrap, t }: WrappedRowProps) => (
  <div className='flex flex-wrap items-center justify-between gap-3 border border-dashed p-3'>
    <div className='flex min-w-0 items-center gap-3'>
      <Lock className='size-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0'>
        <p className='truncate font-medium text-sm'>
          {item.credit.projectName}
        </p>
        <p className='font-mono text-muted-foreground text-xs'>
          NFT #{item.credit.tokenId} · {formatAmount(item.credit.co2Tonnes)} t
        </p>
      </div>
    </div>
    <div className='flex items-center gap-2'>
      <Badge variant='outline'>
        {t('select.flag.wrapped', { symbol: item.pool.symbol })}
      </Badge>
      <Button onClick={onUnwrap} size='sm' type='button' variant='ghost'>
        {t('select.goUnwrap')}
      </Button>
    </div>
  </div>
);

interface SelectStepProps {
  loading: boolean;
  credits: CarbonCredit[];
  eligible: CarbonCredit[];
  wrapped: WrappedCredit[];
  selected: number[];
  selectedTonnes: number;
  onToggle: (tokenId: number) => void;
  onSelection: (tokenIds: number[]) => void;
  onNext: () => void;
  onGoUnwrap: () => void;
  t: TranslateFn;
}

interface FilterChipsProps {
  value: string;
  onChange: (value: string) => void;
  credits: CarbonCredit[];
  t: TranslateFn;
}

const FilterChips = ({ value, onChange, credits, t }: FilterChipsProps) => {
  const chips = CCT_POOL_LIST.map((pool) => ({
    key: pool.methodology,
    label: pool.standard,
    count: credits.filter((credit) => credit.methodology === pool.methodology)
      .length,
  })).filter((chip) => chip.count > 0);
  if (chips.length < 2) {
    return null;
  }
  const all = {
    key: 'all',
    label: t('select.filter.all'),
    count: credits.length,
  };
  return (
    <fieldset
      aria-label={t('select.filter.label')}
      className='m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0'
    >
      {[all, ...chips].map((chip) => (
        <Button
          aria-pressed={value === chip.key}
          key={chip.key}
          onClick={() => onChange(chip.key)}
          size='sm'
          type='button'
          variant={value === chip.key ? 'default' : 'outline'}
        >
          {chip.label}
          <span className='opacity-70'>{chip.count}</span>
        </Button>
      ))}
    </fieldset>
  );
};

export const SelectStep = ({
  loading,
  credits,
  eligible,
  wrapped,
  selected,
  selectedTonnes,
  onToggle,
  onSelection,
  onNext,
  onGoUnwrap,
  t,
}: SelectStepProps) => {
  const [filter, setFilter] = useState('all');
  const visible = useMemo(
    () =>
      credits.filter(
        (credit) => filter === 'all' || credit.methodology === filter
      ),
    [credits, filter]
  );
  const visibleEligibleIds = visible
    .filter((credit) => getEligibility(credit).blocked === null)
    .map((credit) => credit.tokenId);

  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2'>
        {['a', 'b', 'c', 'd'].map((key) => (
          <Skeleton className='h-32 rounded-none' key={key} />
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <FilterChips
          credits={credits}
          onChange={setFilter}
          t={t}
          value={filter}
        />
        <div className='flex items-center gap-2'>
          <Button
            disabled={visibleEligibleIds.length === 0}
            onClick={() => onSelection(visibleEligibleIds)}
            size='sm'
            type='button'
            variant='outline'
          >
            {t('select.selectAll', { count: eligible.length })}
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => onSelection([])}
            size='sm'
            type='button'
            variant='ghost'
          >
            {t('select.clear')}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className='border border-dashed p-6 text-center text-muted-foreground text-sm'>
          {t('select.allWrapped')}
        </p>
      ) : null}

      <div className='grid gap-3 md:grid-cols-2'>
        {visible.map((credit) => (
          <CreditCard
            credit={credit}
            key={credit.tokenId}
            onToggle={onToggle}
            selected={selected.includes(credit.tokenId)}
            t={t}
          />
        ))}
      </div>

      {wrapped.length > 0 ? (
        <Card className='rounded-none border-dashed shadow-none'>
          <CardContent className='space-y-3'>
            <div className='flex items-center gap-2'>
              <Layers className='size-4 text-primary' />
              <h3 className='font-semibold text-sm'>
                {t('select.wrappedTitle', { count: wrapped.length })}
              </h3>
            </div>
            {wrapped.map((item) => (
              <WrappedRow
                item={item}
                key={`${item.pool.methodology}-${item.credit.tokenId}`}
                onUnwrap={onGoUnwrap}
                t={t}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className='sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border border-dashed bg-background/95 p-4 backdrop-blur'>
        <p aria-live='polite' className='text-sm'>
          {selected.length === 0
            ? t('select.nothingSelected')
            : t('select.summary', {
                count: selected.length,
                tonnes: formatAmount(selectedTonnes),
              })}
        </p>
        <Button disabled={selected.length === 0} onClick={onNext} type='button'>
          {t('select.next')}
          <ArrowRight className='size-4' />
        </Button>
      </div>
    </div>
  );
};
