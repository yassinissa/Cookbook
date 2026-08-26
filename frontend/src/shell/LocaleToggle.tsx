import { useI18n } from '@/i18n'

export function LocaleToggle() {
  const { locale, toggleLocale } = useI18n()
  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={locale === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      {locale === 'en' ? 'العربية' : 'EN'}
    </button>
  )
}
