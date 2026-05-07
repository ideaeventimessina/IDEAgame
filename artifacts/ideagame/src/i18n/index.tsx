import React, { createContext, useContext, useState, useMemo } from 'react';
import type { Locale } from '@/data/types';
import { STRINGS } from './strings';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
  missingKeys: string[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano', flag: 'IT' },
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Español', flag: 'ES' },
  { code: 'fr', label: 'Français', flag: 'FR' },
];

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('it');

  const value = useMemo<I18nContextType>(() => {
    const t = (key: string, fallback?: string): string => {
      const v = STRINGS[locale]?.[key];
      if (v) return v;
      const it = STRINGS.it[key];
      if (it) return it;
      return fallback ?? key;
    };
    const missingKeys = Object.keys(STRINGS.it).filter(k => !STRINGS[locale]?.[k]);
    return { locale, setLocale, t, missingKeys };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
