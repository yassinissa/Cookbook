import { NavLink } from 'react-router-dom'

import { BOTTOM_NAV } from './nav'
import { Icon } from '@/components/Icon'
import { cn } from '@/lib/cn'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'

export function BottomNav() {
  const { t } = useI18n()
  const { can } = useAuth()
  const items = BOTTOM_NAV.filter((i) => !i.capability || can(i.capability))
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface lg:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]',
              isActive ? 'text-accent-ink' : 'text-ink-subtle',
            )
          }
        >
          <Icon name={item.icon} size={20} />
          <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
