'use client';

import { ChevronLeft, ChevronRight, ExternalLink, FilterX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { explorerTxUrl } from '@/lib/explorer';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import type { ChainEvent } from '@/lib/onchain-events';
import { cn } from '@/lib/utils';
import { describeEvent } from '../_lib/describe';
import {
  EMPTY_FILTERS,
  EVENT_KINDS,
  KIND_TONE,
  type LedgerFilters,
} from '../_lib/ledger';
import { messages } from '../_messages';

const PAGE_SIZE = 15;

interface FilterBarProps {
  filters: LedgerFilters;
  onChange: (next: LedgerFilters) => void;
}

const FilterBar = ({ filters, onChange }: FilterBarProps) => {
  const t = useT(messages);
  const isDefault =
    filters.kind === EMPTY_FILTERS.kind &&
    !filters.actor &&
    !filters.from &&
    !filters.to;
  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_1fr_auto] lg:items-end'>
      <div className='space-y-1.5'>
        <Label htmlFor='ledger-kind'>{t('ledger.type')}</Label>
        <Select
          onValueChange={(value) =>
            onChange({ ...filters, kind: value as LedgerFilters['kind'] })
          }
          value={filters.kind}
        >
          <SelectTrigger className='w-full' id='ledger-kind'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('ledger.allTypes')}</SelectItem>
            {EVENT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='ledger-actor'>{t('ledger.actor')}</Label>
        <Input
          className='font-mono'
          id='ledger-actor'
          onChange={(event) =>
            onChange({ ...filters, actor: event.target.value })
          }
          placeholder='0x…'
          value={filters.actor}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='ledger-from'>{t('ledger.from')}</Label>
        <Input
          id='ledger-from'
          onChange={(event) =>
            onChange({ ...filters, from: event.target.value })
          }
          type='date'
          value={filters.from}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='ledger-to'>{t('ledger.to')}</Label>
        <Input
          id='ledger-to'
          onChange={(event) => onChange({ ...filters, to: event.target.value })}
          type='date'
          value={filters.to}
        />
      </div>
      <Button
        disabled={isDefault}
        onClick={() => onChange(EMPTY_FILTERS)}
        type='button'
        variant='outline'
      >
        <FilterX />
        {t('ledger.reset')}
      </Button>
    </div>
  );
};

const LedgerRow = ({
  event,
  locale,
}: {
  event: ChainEvent;
  locale: Locale;
}) => {
  const t = useT(messages);
  return (
    <TableRow>
      <TableCell className='whitespace-nowrap text-muted-foreground text-xs'>
        {formatChainDate(event.timestamp, locale) || '—'}
      </TableCell>
      <TableCell>
        <Badge
          className={cn('rounded-none', KIND_TONE[event.kind])}
          variant='outline'
        >
          {t(`kind.${event.kind}`)}
        </Badge>
      </TableCell>
      <TableCell className='font-mono text-xs' title={event.actor}>
        {event.actor ? formatAddress(event.actor, 4) : '—'}
      </TableCell>
      <TableCell className='max-w-md whitespace-normal text-sm'>
        {describeEvent(event, t, locale) || '—'}
      </TableCell>
      <TableCell className='font-mono text-xs tabular-nums'>
        {event.blockNumber.toString()}
      </TableCell>
      <TableCell className='text-right'>
        <a
          aria-label={t('ledger.viewTx', {
            hash: formatAddress(event.txHash, 6),
          })}
          className='inline-flex items-center gap-1 font-mono text-primary text-xs underline-offset-4 hover:underline'
          href={explorerTxUrl(event.txHash)}
          rel='noopener noreferrer'
          target='_blank'
        >
          {formatAddress(event.txHash, 5)}
          <ExternalLink className='size-3' />
        </a>
      </TableCell>
    </TableRow>
  );
};

interface PagerProps {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}

const Pager = ({ page, pageCount, total, onPage }: PagerProps) => {
  const t = useT(messages);
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
      <p className='text-muted-foreground'>
        {t('ledger.showing', { first, last, total })}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          aria-label={t('ledger.prev')}
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          size='icon'
          type='button'
          variant='outline'
        >
          <ChevronLeft />
        </Button>
        <span className='text-muted-foreground text-xs'>
          {t('ledger.page', { page: page + 1, pages: pageCount })}
        </span>
        <Button
          aria-label={t('ledger.next')}
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          size='icon'
          type='button'
          variant='outline'
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
};

interface LedgerSectionProps {
  events: ChainEvent[];
  filters: LedgerFilters;
  onFiltersChange: (next: LedgerFilters) => void;
  filtered: ChainEvent[];
}

export const LedgerSection = ({
  events,
  filters,
  onFiltersChange,
  filtered,
}: LedgerSectionProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage]
  );

  const handleFilters = (next: LedgerFilters) => {
    setPage(0);
    onFiltersChange(next);
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('ledger.title')}</CardTitle>
        <CardDescription>{t('ledger.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <FilterBar filters={filters} onChange={handleFilters} />
        {rows.length === 0 ? (
          <EmptyState
            description={
              events.length === 0
                ? t('ledger.emptyHint')
                : t('ledger.emptyFilteredHint')
            }
            title={
              events.length === 0
                ? t('ledger.empty')
                : t('ledger.emptyFiltered')
            }
          />
        ) : (
          <div className='overflow-x-auto border border-dashed'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ledger.time')}</TableHead>
                  <TableHead>{t('ledger.kind')}</TableHead>
                  <TableHead>{t('ledger.actorCol')}</TableHead>
                  <TableHead>{t('ledger.details')}</TableHead>
                  <TableHead>{t('ledger.block')}</TableHead>
                  <TableHead className='text-right'>{t('ledger.tx')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((event) => (
                  <LedgerRow
                    event={event}
                    key={`${event.txHash}-${event.logIndex}`}
                    locale={locale}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager
          onPage={setPage}
          page={safePage}
          pageCount={pageCount}
          total={filtered.length}
        />
      </CardContent>
    </Card>
  );
};
