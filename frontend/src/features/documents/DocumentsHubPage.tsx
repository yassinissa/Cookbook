import { Link } from 'react-router-dom'

import { Icon, type IconName } from '@/components/Icon'
import { Page, PageHeader } from '@/components/Page'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

interface Tool {
  to: string
  icon: IconName
  titleKey: MessageKey
  descKey: MessageKey
}

const TOOLS: Tool[] = [
  {
    to: '/documents/recipe-card',
    icon: 'dish',
    titleKey: 'documents.recipeCard.title',
    descKey: 'documents.recipeCard.desc',
  },
  {
    to: '/documents/station-pack',
    icon: 'standards',
    titleKey: 'documents.stationPack.title',
    descKey: 'documents.stationPack.desc',
  },
  {
    to: '/documents/prep-book',
    icon: 'production',
    titleKey: 'documents.prepBook.title',
    descKey: 'documents.prepBook.desc',
  },
  {
    to: '/documents/scoresheet',
    icon: 'camera',
    titleKey: 'documents.scoresheet.title',
    descKey: 'documents.scoresheet.desc',
  },
]

export function DocumentsHubPage() {
  const { t } = useI18n()

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('nav.section.operations')}
        title={t('nav.documents')}
        subtitle={t('documents.hub.subtitle')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="lift card-lit group flex gap-4 rounded-card border border-hairline bg-surface-raised p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface-sunken text-ink-subtle transition-colors group-hover:bg-accent-subtle group-hover:text-accent-ink">
              <Icon name={tool.icon} size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[1.05rem] font-medium tracking-tight text-ink">
                {t(tool.titleKey)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{t(tool.descKey)}</p>
            </div>
            <Icon
              name="chevronRight"
              size={16}
              className="ms-auto flex-none self-center text-ink-subtle transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ))}
      </div>
    </Page>
  )
}
