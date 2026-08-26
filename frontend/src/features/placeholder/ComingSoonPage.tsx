import { Icon, type IconName } from '@/components/Icon'
import { Page, PageHeader } from '@/components/Page'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

export function ComingSoonPage({ titleKey, icon }: { titleKey: MessageKey; icon: IconName }) {
  const { t } = useI18n()
  const name = t(titleKey)
  return (
    <Page>
      <PageHeader eyebrow={t('app.group')} title={name} />
      <div className="flex flex-col items-center rounded-card border border-dashed border-hairline-strong bg-surface px-6 py-16 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken text-ink-subtle">
          <Icon name={icon} size={22} />
        </span>
        <p className="text-base font-semibold text-ink">{t('soon.title', { name })}</p>
        <p className="mt-2 max-w-md text-sm text-ink-subtle">{t('soon.body')}</p>
      </div>
    </Page>
  )
}
