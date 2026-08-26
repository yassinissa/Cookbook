import { NavLink } from 'react-router-dom'

import { NAV } from './nav'
import { Icon } from '@/components/Icon'
import { cn } from '@/lib/cn'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'

export function Sidebar() {
  const { t } = useI18n()
  const { can } = useAuth()

  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.capability || can(i.capability)),
  })).filter((s) => s.items.length > 0)

  return (
    <aside className="hidden w-60 flex-none flex-col border-e border-hairline bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-hairline px-5">
        <Wordmark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.labelKey} className="mb-5">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
              {t(section.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
                        isActive
                          ? 'bg-accent-subtle text-accent-ink'
                          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                      )
                    }
                  >
                    <Icon name={item.icon} size={17} className="flex-none" />
                    <span className="flex-1 truncate">{t(item.labelKey)}</span>
                    {!item.ready && (
                      <span className="rounded bg-surface-sunken px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-subtle">
                        soon
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

export function Wordmark() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
        <Icon name="dish" size={16} />
      </span>
      <div className="leading-none">
        <p className="text-[13px] font-semibold text-ink">{t('app.name')}</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">
          {t('app.group')}
        </p>
      </div>
    </div>
  )
}
