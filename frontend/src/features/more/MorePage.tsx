import { NavLink } from 'react-router-dom'

import { useAuth } from '@/auth/AuthProvider'
import { Icon } from '@/components/Icon'
import { Page, PageHeader } from '@/components/Page'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'
import { NAV } from '@/shell/nav'

/*
 * The full navigation as a screen — reachable from the "More" tab in the
 * bottom bar on phones/tablets, where the Sidebar (`hidden lg:flex`) never
 * shows. Sections and items are capability-filtered with the same rule the
 * Sidebar uses, so a user only sees what they can open. Not-yet-built routes
 * still list here (with a "Soon" badge) and land on their ComingSoonPage,
 * matching the Sidebar's behaviour.
 */
export function MorePage() {
  const { t, dir } = useI18n()
  const { can } = useAuth()
  const chevron = dir === 'rtl' ? 'chevronLeft' : 'chevronRight'

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.capability || can(item.capability)),
  })).filter((section) => section.items.length > 0)

  return (
    <Page stagger>
      <PageHeader eyebrow={t('app.group')} title={t('nav.more')} subtitle={t('more.subtitle')} />

      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.labelKey}>
            <h2 className="mb-2 px-1 text-2xs font-semibold uppercase tracking-[0.1em] text-ink-subtle">
              {t(section.labelKey)}
            </h2>
            <ul className="card-lit relative divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface-raised">
              <span
                aria-hidden
                className="spice-rail absolute inset-y-0 start-0 w-[3px] opacity-40"
              />
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={cn(
                      'flex items-center gap-3 py-3.5 pe-4 ps-5 transition-colors duration-150',
                      'hover:bg-surface-sunken active:bg-surface-sunken',
                      'focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)]',
                    )}
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                      {t(item.labelKey)}
                    </span>
                    {!item.ready && (
                      <span className="flex-none rounded bg-surface-sunken px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        {t('nav.soon')}
                      </span>
                    )}
                    <Icon name={chevron} size={16} className="flex-none text-ink-subtle" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  )
}
