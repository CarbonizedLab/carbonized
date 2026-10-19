'use client';

import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';
import { useMemo } from 'react';
import { type Locale, useLocaleStore } from '@/lib/i18n';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };
const MS_PER_SECOND = 1000;
const MAX_TONNE_DECIMALS = 2;

export interface Formatters {
  /** 1,234.56 */
  number: (value: number) => string;
  /** 1,234.56 t */
  tonnes: (value: number) => string;
  /** $1,234.56 */
  usd: (value: number) => string;
  /** "3 minutes ago" for a unix-seconds timestamp. */
  relative: (unixSeconds: number) => string;
}

export const useFormatters = (): Formatters => {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => {
    const intl = INTL_LOCALE[locale];
    const numberFormat = new Intl.NumberFormat(intl, {
      maximumFractionDigits: MAX_TONNE_DECIMALS,
    });
    const usdFormat = new Intl.NumberFormat(intl, {
      style: 'currency',
      currency: 'USD',
    });
    return {
      number: (value) => numberFormat.format(value),
      tonnes: (value) => `${numberFormat.format(value)} t`,
      usd: (value) => usdFormat.format(value),
      relative: (unixSeconds) =>
        formatDistanceToNow(new Date(unixSeconds * MS_PER_SECOND), {
          addSuffix: true,
          locale: locale === 'zh' ? zhCN : undefined,
        }),
    };
  }, [locale]);
};
