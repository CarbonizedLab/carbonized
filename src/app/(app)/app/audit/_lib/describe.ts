import { formatDecimal } from '@/lib/chain-format';
import type { Locale, TranslateFn } from '@/lib/i18n';
import type { ChainEvent } from '@/lib/onchain-events';
import { eventTokenIds } from './ledger';

const USD_DIGITS = 2;

/** One-line, localized summary of what an event moved. */
export const describeEvent = (
  event: ChainEvent,
  t: TranslateFn,
  locale: Locale
): string => {
  const parts: string[] = [];
  const ids = eventTokenIds(event);
  const [firstId] = ids;
  if (ids.length === 1 && firstId !== undefined) {
    parts.push(t('detail.token', { id: firstId.toString() }));
  } else if (ids.length > 1) {
    parts.push(t('detail.tokens', { count: ids.length }));
  }
  if (event.refId !== undefined) {
    const key = event.kind.startsWith('order')
      ? 'detail.order'
      : 'detail.auction';
    parts.push(t(key, { id: event.refId.toString() }));
  }
  if (event.tonnes !== undefined) {
    parts.push(`${formatDecimal(event.tonnes, locale)} t`);
  }
  if (event.usd !== undefined) {
    parts.push(`$${formatDecimal(event.usd, locale, USD_DIGITS)}`);
  }
  if (event.note) {
    parts.push(`“${event.note}”`);
  }
  return parts.join(' · ');
};
