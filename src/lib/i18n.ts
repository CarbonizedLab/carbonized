'use client';

import { create } from 'zustand';

export type Locale = 'en' | 'zh';

export const LOCALES: readonly Locale[] = ['en', 'zh'] as const;

const STORAGE_KEY = 'carb-locale';

/** Per-feature dictionary, defined next to the page that uses it. */
export interface Messages {
  en: Record<string, string>;
  zh: Record<string, string>;
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Reads the persisted locale; call once on the client after mount. */
  hydrate: () => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'en',
  setLocale: (locale) => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    set({ locale });
  },
  hydrate: () => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') {
      set({ locale: stored });
    }
  },
}));

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>
) => string;

const VAR_PATTERN = /\{(\w+)\}/g;

/**
 * Returns `t(key, vars)` for the active locale. Falls back to English, then to
 * the key itself. `{name}` placeholders are replaced from `vars`.
 */
export const useT = (messages: Messages): TranslateFn => {
  const locale = useLocaleStore((state) => state.locale);
  return (key, vars) => {
    const template = messages[locale][key] ?? messages.en[key] ?? key;
    if (!vars) {
      return template;
    }
    return template.replace(VAR_PATTERN, (_, name: string) =>
      String(vars[name] ?? `{${name}}`)
    );
  };
};
