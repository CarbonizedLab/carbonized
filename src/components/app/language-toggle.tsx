'use client';

import { LOCALES, type Locale, useLocaleStore, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { navMessages } from './nav-messages';

const LOCALE_SHORT_LABEL: Record<Locale, string> = { en: 'EN', zh: '中文' };

export const LanguageToggle = ({ className }: { className?: string }) => {
  const t = useT(navMessages);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <fieldset
      aria-label={t('lang.label')}
      className={cn(
        'm-0 inline-flex min-w-0 items-center border border-dashed p-0.5',
        className
      )}
    >
      {LOCALES.map((value: Locale) => {
        const selected = value === locale;
        return (
          <button
            aria-label={t(`lang.${value}`)}
            aria-pressed={selected}
            className={cn(
              'px-2 py-1 font-semibold text-xs uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            key={value}
            lang={value}
            onClick={() => setLocale(value)}
            type='button'
          >
            {LOCALE_SHORT_LABEL[value]}
          </button>
        );
      })}
    </fieldset>
  );
};
