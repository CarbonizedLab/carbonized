import { formatDecimal } from '@/lib/chain-format';
import type { Locale } from '@/lib/i18n';
import type { CheckUnit } from './reconcile';

const UNIT_SUFFIX: Record<CheckUnit, string> = {
  tonnes: ' t',
  usdc: ' USDG',
  count: '',
};

const COUNT_DIGITS = 0;
const VALUE_DIGITS = 4;

export const formatCheckValue = (
  value: number,
  unit: CheckUnit,
  locale: Locale
): string =>
  `${formatDecimal(value, locale, unit === 'count' ? COUNT_DIGITS : VALUE_DIGITS)}${UNIT_SUFFIX[unit]}`;

/** Signed delta; exact zero (within display precision) is shown without sign. */
export const formatCheckDelta = (
  delta: number,
  unit: CheckUnit,
  locale: Locale
): string => {
  const text = formatCheckValue(delta, unit, locale);
  return delta > 0 && !text.startsWith('0') ? `+${text}` : text;
};
