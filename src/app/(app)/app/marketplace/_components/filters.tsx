'use client';

import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TranslateFn } from '@/lib/i18n';
import {
  CHIP_KEYS,
  type ChipKey,
  type SortDir,
  type SortKey,
} from '../_lib/market-utils';

const SORT_KEYS: readonly SortKey[] = [
  'price',
  'available',
  'expiry',
  'id',
] as const;

interface FiltersProps {
  search: string;
  onSearch: (value: string) => void;
  chip: ChipKey;
  onChip: (chip: ChipKey) => void;
  chipCounts: Record<ChipKey, number>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortKey: (key: SortKey) => void;
  onToggleDir: () => void;
  t: TranslateFn;
}

export const Filters = ({
  search,
  onSearch,
  chip,
  onChip,
  chipCounts,
  sortKey,
  sortDir,
  onSortKey,
  onToggleDir,
  t,
}: FiltersProps) => (
  <div className='space-y-3'>
    <div className='flex flex-col gap-3 sm:flex-row'>
      <div className='relative flex-1'>
        <Search className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          aria-label={t('filters.searchLabel')}
          className='pl-9'
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('filters.search')}
          value={search}
        />
      </div>
      <div className='flex gap-2'>
        <Select
          onValueChange={(value) => onSortKey(value as SortKey)}
          value={sortKey}
        >
          <SelectTrigger
            aria-label={t('filters.sortLabel')}
            className='w-full sm:w-48'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`sort.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={
            sortDir === 'asc' ? t('filters.dirAsc') : t('filters.dirDesc')
          }
          onClick={onToggleDir}
          size='icon'
          title={sortDir === 'asc' ? t('filters.dirAsc') : t('filters.dirDesc')}
          type='button'
          variant='outline'
        >
          {sortDir === 'asc' ? (
            <ArrowUp className='size-4' />
          ) : (
            <ArrowDown className='size-4' />
          )}
        </Button>
      </div>
    </div>

    <fieldset
      aria-label={t('filters.chipsLabel')}
      className='m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0'
    >
      {CHIP_KEYS.map((key) => (
        <Button
          aria-pressed={chip === key}
          key={key}
          onClick={() => onChip(key)}
          size='sm'
          type='button'
          variant={chip === key ? 'default' : 'outline'}
        >
          {t(`chip.${key}`)}
          <span className='opacity-70'>{chipCounts[key]}</span>
        </Button>
      ))}
    </fieldset>
  </div>
);
