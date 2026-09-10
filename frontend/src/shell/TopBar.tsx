import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LocaleToggle } from './LocaleToggle'
import { ThemeToggle } from './ThemeToggle'
import { IdentitySwitcher } from './IdentitySwitcher'
import { Wordmark } from './Sidebar'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { useAuth } from '@/auth/AuthProvider'
import { useDishRecipes } from '@/lib/queries'
import { logout, USE_SEED } from '@/lib/http'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'
import type { DishRecipeListItem } from '@/types/api'

export function TopBar() {
  const { t } = useI18n()
  const { can } = useAuth()
  const canSearch = can('dish.view')
  const { data: dishes = [] } = useDishRecipes(canSearch)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-surface/95 px-4 shadow-e1 backdrop-blur sm:px-6">
      <div className="shrink-0 lg:hidden">
        <Wordmark />
      </div>

      <DishSearch
        dishes={dishes}
        canSearch={canSearch}
        className={cn('relative ms-auto hidden min-w-0 max-w-sm lg:block', !canSearch && 'lg:hidden')}
      />

      <div className="ms-auto flex items-center gap-0.5">
        {canSearch && (
          <IconButton
            label={t('action.search')}
            icon="search"
            className="lg:hidden"
            onClick={() => setMobileSearchOpen(true)}
          />
        )}
        <IdentitySwitcher />
        <LocaleToggle />
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-hairline" />
        <UserMenu />
      </div>

      <Drawer
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        title={t('dishes.search')}
      >
        <DishSearch dishes={dishes} canSearch={canSearch} autoFocus inline onNavigate={() => setMobileSearchOpen(false)} />
      </Drawer>
    </header>
  )
}

function DishSearch({
  dishes,
  canSearch,
  className,
  autoFocus,
  inline,
  onNavigate,
}: {
  dishes: DishRecipeListItem[]
  canSearch: boolean
  className?: string
  autoFocus?: boolean
  /** Renders results as a static list under the input instead of an absolute-positioned popover — used inside the mobile search Drawer. */
  inline?: boolean
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  if (!canSearch) return null

  const matches = q.trim()
    ? dishes
        .filter(
          (d) =>
            d.name_en.toLowerCase().includes(q.toLowerCase()) ||
            d.recipe_code.includes(q) ||
            d.name_ar.includes(q),
        )
        .slice(0, inline ? 20 : 6)
    : []

  const goTo = (id: string) => {
    navigate(`/recipes/dishes/${id}`)
    setQ('')
    setOpen(false)
    onNavigate?.()
  }

  return (
    <div className={className}>
      <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
        <Icon name="search" size={15} />
      </span>
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={inline ? undefined : () => setTimeout(() => setOpen(false), 150)}
        placeholder={t('dishes.search')}
        aria-label={t('action.search')}
        className="h-9 w-full rounded-lg border border-hairline-strong bg-surface-sunken ps-8 pe-3 text-[13px] text-ink placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
      />
      {(inline ? q.trim().length > 0 : open) && matches.length > 0 && (
        <ul
          className={
            inline
              ? 'mt-2 overflow-hidden rounded-lg border border-hairline'
              : 'absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover'
          }
        >
          {matches.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onMouseDown={
                  inline
                    ? undefined
                    : (e) => {
                        e.preventDefault()
                        goTo(d.id)
                      }
                }
                onClick={inline ? () => goTo(d.id) : undefined}
                className={cn(
                  'flex w-full items-center justify-between gap-2 text-start text-[13px] text-ink hover:bg-accent-subtle hover:text-accent-ink',
                  inline ? 'border-b border-hairline px-3 py-2.5 last:border-0' : 'px-3 py-1.5',
                )}
              >
                <span className="truncate">{d.name_en}</span>
                <span className="tnum flex-none text-xs text-ink-subtle">#{d.recipe_code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {inline && q.trim() && matches.length === 0 && (
        <p className="mt-2 text-sm text-ink-subtle">{t('dishes.empty')}</p>
      )}
    </div>
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
  const navigate = useNavigate()
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
        className="flex h-11 items-center gap-1.5 rounded-lg px-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
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
              setOpen(false)
              navigate('/settings')
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-[13px] text-ink hover:bg-surface-sunken"
          >
            <Icon name="settings" size={15} />
            {t('nav.settings')}
          </button>
          {USE_SEED ? (
            <p className="px-3 py-2 text-xs leading-relaxed text-ink-subtle">
              {t('auth.seedBuildHint')}
            </p>
          ) : (
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
          )}
        </div>
      )}
    </div>
  )
}
