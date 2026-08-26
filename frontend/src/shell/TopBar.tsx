import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LocaleToggle } from './LocaleToggle'
import { ThemeToggle } from './ThemeToggle'
import { IdentitySwitcher } from './IdentitySwitcher'
import { Wordmark } from './Sidebar'
import { Icon } from '@/components/Icon'
import { useAuth } from '@/auth/AuthProvider'
import { useDishRecipes } from '@/lib/queries'
import { logout } from '@/lib/http'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'

export function TopBar() {
  const { t } = useI18n()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const canSearch = can('dish.view')
  const { data: dishes = [] } = useDishRecipes(canSearch)

  const matches = q.trim()
    ? dishes
        .filter(
          (d) =>
            d.name_en.toLowerCase().includes(q.toLowerCase()) ||
            d.recipe_code.includes(q) ||
            d.name_ar.includes(q),
        )
        .slice(0, 6)
    : []

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-surface/95 px-4 backdrop-blur sm:px-6">
      <div className="lg:hidden">
        <Wordmark />
      </div>

      <div className={cn('relative ms-auto w-full max-w-xs lg:ms-0 lg:max-w-sm', !canSearch && 'lg:hidden')}>
        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
          <Icon name="search" size={15} />
        </span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t('dishes.search')}
          aria-label={t('action.search')}
          className="h-9 w-full rounded-lg border border-hairline-strong bg-surface-sunken ps-8 pe-3 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
        />
        {open && matches.length > 0 && (
          <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover">
            {matches.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    navigate(`/recipes/dishes/${d.id}`)
                    setQ('')
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-[13px] text-ink hover:bg-accent-subtle hover:text-accent-ink"
                >
                  <span className="truncate">{d.name_en}</span>
                  <span className="tnum flex-none text-xs text-ink-subtle">#{d.recipe_code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ms-auto flex items-center gap-0.5">
        <IdentitySwitcher />
        <LocaleToggle />
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-hairline" />
        <UserMenu />
      </div>
    </header>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'GH'
}

function UserMenu() {
  const { t } = useI18n()
  const { me } = useAuth()
  const [open, setOpen] = useState(false)
  const name = me?.display_name || me?.username || 'Green Hills'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg px-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold text-accent-ink">
          {initials(name)}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute end-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover',
          )}
        >
          <div className="border-b border-hairline px-3 py-2">
            <p className="text-[13px] font-medium text-ink">{name}</p>
            {me?.role && <p className="text-xs text-ink-subtle">{me.role.name}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => {
              e.preventDefault()
              logout()
              window.location.assign('/login')
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-[13px] text-ink hover:bg-surface-sunken"
          >
            <Icon name="logout" size={15} />
            {t('action.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
