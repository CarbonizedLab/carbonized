import type { Locale } from '@/lib/i18n';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };
const MS_PER_SECOND = 1000;

/** Formats unix seconds as a localized date + time; empty string when unknown. */
export const formatChainDate = (
  seconds: number,
  locale: Locale,
  withTime = true
): string => {
  if (!seconds) {
    return '';
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined,
  }).format(new Date(seconds * MS_PER_SECOND));
};

/** Localized decimal number with a fixed maximum precision. */
export const formatDecimal = (
  value: number,
  locale: Locale,
  maximumFractionDigits = 4
): string =>
  new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits }).format(
    value
  );
