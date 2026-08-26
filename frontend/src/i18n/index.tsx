import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { ar, en, type MessageKey } from './messages'

export type Locale = 'en' | 'ar'
type Vars = Record<string, string | number>
export type TFunc = (key: MessageKey, vars?: Vars) => string

interface I18nValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  setLocale: (l: Locale) => void
  toggleLocale: () => void
  t: (key: MessageKey, vars?: Vars) => string
}

const STORAGE_KEY = 'cookbook.locale'
const I18nContext = createContext<I18nValue | null>(null)

function readLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale)

  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', locale)
    root.setAttribute('dir', dir)
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* private mode */
    }
  }, [locale, dir])

  const setLocale = useCallback((l: Locale) => setLocaleState(l), [])
  const toggleLocale = useCallback(
    () => setLocaleState((l) => (l === 'en' ? 'ar' : 'en')),
    [],
  )

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => {
      const table = locale === 'ar' ? ar : en
      return interpolate(table[key] ?? en[key] ?? key, vars)
    },
    [locale],
  )

  const value = useMemo<I18nValue>(
    () => ({ locale, dir, setLocale, toggleLocale, t }),
    [locale, dir, setLocale, toggleLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
