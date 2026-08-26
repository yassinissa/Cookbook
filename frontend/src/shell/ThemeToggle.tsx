import { Icon } from '@/components/Icon'
import { useI18n } from '@/i18n'
import { useTheme } from '@/theme/ThemeProvider'

export function ThemeToggle() {
  const { choice, resolved, cycle } = useTheme()
  const { t } = useI18n()
  const icon = choice === 'system' ? 'monitor' : resolved === 'dark' ? 'moon' : 'sun'
  const label = choice === 'light' ? t('theme.light') : choice === 'dark' ? t('theme.dark') : t('theme.system')
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${t('theme.light')} / ${t('theme.dark')} / ${t('theme.system')}`}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      <Icon name={icon} size={18} />
    </button>
  )
}
