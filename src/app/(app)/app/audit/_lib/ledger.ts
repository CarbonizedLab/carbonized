import { explorerTxUrl } from '@/lib/explorer';
import type { ChainEvent, ChainEventKind } from '@/lib/onchain-events';

export const EVENT_KINDS: readonly ChainEventKind[] = [
  'mint',
  'retire',
  'wrap',
  'unwrap',
  'order_created',
  'order_filled',
  'order_cancelled',
  'auction_created',
  'bid',
  'auction_finalized',
  'auction_cancelled',
] as const;

/** Badge tone per event kind (semantic Tailwind classes; works in light + dark). */
export const KIND_TONE: Record<ChainEventKind, string> = {
  mint: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  retire:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  wrap: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  unwrap: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  order_created:
    'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  order_filled:
    'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  order_cancelled: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  auction_created:
    'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  bid: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  auction_finalized:
    'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  auction_cancelled:
    'border-muted-foreground/30 bg-muted text-muted-foreground',
};

export interface LedgerFilters {
  kind: 'all' | ChainEventKind;
  actor: string;
  /** `YYYY-MM-DD` (local), inclusive. */
  from: string;
  to: string;
}

export const EMPTY_FILTERS: LedgerFilters = {
  kind: 'all',
  actor: '',
  from: '',
  to: '',
};

const SECOND_MS = 1000;
const END_OF_DAY_MS = 24 * 60 * 60 * SECOND_MS - 1;

const startOfDay = (value: string): number | null => {
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
};

export const filterEvents = (
  events: ChainEvent[],
  filters: LedgerFilters
): ChainEvent[] => {
  const actor = filters.actor.trim().toLowerCase();
  const from = filters.from ? startOfDay(filters.from) : null;
  const toStart = filters.to ? startOfDay(filters.to) : null;
  const to = toStart === null ? null : toStart + END_OF_DAY_MS;
  return events.filter((event) => {
    if (filters.kind !== 'all' && event.kind !== filters.kind) {
      return false;
    }
    if (actor && !event.actor?.toLowerCase().includes(actor)) {
      return false;
    }
    if (from === null && to === null) {
      return true;
    }
    const at = event.timestamp * SECOND_MS;
    return (
      event.timestamp > 0 &&
      (from === null || at >= from) &&
      (to === null || at <= to)
    );
  });
};

/** Token ids an event touches, for display (single id or a batch). */
export const eventTokenIds = (event: ChainEvent): string[] =>
  event.tokenIds ??
  (event.tokenId === undefined ? [] : [event.tokenId.toString()]);

const CSV_HEADERS = [
  'timestamp_utc',
  'block',
  'log_index',
  'type',
  'contract',
  'actor',
  'token_ids',
  'ref_id',
  'tonnes',
  'usd',
  'note',
  'tx_hash',
  'explorer_url',
] as const;

const CSV_SPECIAL = /[",\n\r]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180 quoting plus a leading apostrophe to neutralize spreadsheet formulas. */
const csvCell = (value: string | number | bigint | undefined): string => {
  if (value === undefined) {
    return '';
  }
  let text = String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return CSV_SPECIAL.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const eventsToCsv = (events: ChainEvent[]): string => {
  const rows = events.map((event) =>
    [
      event.timestamp > 0
        ? new Date(event.timestamp * SECOND_MS).toISOString()
        : '',
      event.blockNumber,
      event.logIndex,
      event.kind,
      event.contract,
      event.actor,
      eventTokenIds(event).join(';'),
      event.refId,
      event.tonnes,
      event.usd,
      event.note,
      event.txHash,
      explorerTxUrl(event.txHash),
    ]
      .map(csvCell)
      .join(',')
  );
  return [CSV_HEADERS.join(','), ...rows].join('\r\n');
};

export const downloadTextFile = (
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8'
): void => {
  const blob = new Blob([`\uFEFF${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
