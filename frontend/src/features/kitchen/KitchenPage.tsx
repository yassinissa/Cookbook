import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/Card'
import { DishImage } from '@/components/DishImage'
import { Icon } from '@/components/Icon'
import { BiName, Page, PageHeader, SegmentedButtons } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDishRecipes, useProductionRecipes } from '@/lib/queries'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'
import type { DishRecipeListItem, ProductionRecipeListItem } from '@/types/api'

/*
 * The staff-facing "what do I cook and how" screen — a photo-forward,
 * search-first guide with no costing, no pricing, no admin chrome. Full
 * CRUD stays on the regular Dish/Production screens (gated by
 * dish.edit/production.edit); this one is pure display, open to anyone
 * who can see recipes at all.
 */
export function KitchenPage() {
  const { t } = useI18n()
  const { can } = useAuth()
  const showDishes = can('dish.view')
  const showProduction = can('production.view')
  const [tab, setTab] = useState<'dishes' | 'production'>(showDishes ? 'dishes' : 'production')
  const [q, setQ] = useState('')

  const activeTab = showDishes && showProduction ? tab : showDishes ? 'dishes' : 'production'

  if (!showDishes && !showProduction) {
    return (
      <Page stagger>
        <PageHeader eyebrow={t('kitchen.eyebrow')} title={t('kitchen.title')} />
        <EmptyState icon="lock" title={t('access.denied.title')} body={t('access.denied.body')} />
      </Page>
    )
  }

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('kitchen.eyebrow')}
        title={t('kitchen.title')}
        subtitle={t('kitchen.subtitle')}
      />

      {/* the search is the primary way in — big, unmissable, not a small
          filter input competing with tabs for attention */}
      <div className="card-lit relative mb-5 overflow-hidden rounded-card border border-hairline">
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <Icon name="search" size={20} className="flex-none text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('kitchen.searchLarge')}
            aria-label={t('kitchen.searchLarge')}
            className="w-full border-0 bg-transparent font-display text-lg text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>
      </div>

      {showDishes && showProduction && (
        <div className="mb-5">
          <SegmentedButtons
            options={[
              { value: 'dishes', label: t('kitchen.tab.dishes') },
              { value: 'production', label: t('kitchen.tab.production') },
            ]}
            value={activeTab}
            onChange={(v) => setTab(v as 'dishes' | 'production')}
            label={t('kitchen.tab.label')}
          />
        </div>
      )}

      {activeTab === 'dishes' ? <DishGrid q={q} /> : <ProductionGrid q={q} />}
    </Page>
  )
}

function CategoryChips({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useI18n()
  if (options.length < 2) return null
  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      <CategoryChip active={value === 'all'} onClick={() => onChange('all')}>
        {t('kitchen.allCategories')}
      </CategoryChip>
      {options.map((o) => (
        <CategoryChip key={o} active={value === o} onClick={() => onChange(o)}>
          {o}
        </CategoryChip>
      ))}
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ' +
        (active
          ? 'border-accent bg-accent text-accent-on'
          : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken')
      }
    >
      {children}
    </button>
  )
}

function DishGrid({ q }: { q: string }) {
  const { t } = useI18n()
  const { data: recipes, isLoading, isError, refetch } = useDishRecipes()
  const [category, setCategory] = useState('all')

  const categories = useMemo(
    () => Array.from(new Set((recipes ?? []).map((r) => r.category_name).filter(Boolean))).sort() as string[],
    [recipes],
  )

  const visible = useMemo(() => {
    let list = recipes ?? []
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (r: DishRecipeListItem) => r.name_en.toLowerCase().includes(query) || r.name_ar.includes(q),
      )
    }
    if (category !== 'all') list = list.filter((r) => r.category_name === category)
    return list
  }, [recipes, q, category])

  // Grouped by category when browsing (menu-board feel); a search collapses
  // to one flat, relevance-free result list instead.
  const groups = useMemo(() => {
    if (q.trim()) return [{ label: null, items: visible }]
    const byCategory = new Map<string, DishRecipeListItem[]>()
    const uncategorized = t('kitchen.uncategorized')
    for (const r of visible) {
      const key = r.category_name || uncategorized
      if (!byCategory.has(key)) byCategory.set(key, [])
      byCategory.get(key)!.push(r)
    }
    // named categories first (alphabetically), the "more" bucket always last
    return [...byCategory.entries()]
      .sort(([a], [b]) => (a === uncategorized ? 1 : b === uncategorized ? -1 : a.localeCompare(b)))
      .map(([label, items]) => ({ label, items }))
  }, [visible, q, t])

  if (isLoading) return <CardGridSkeleton />
  if (isError) return <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />

  return (
    <>
      <CategoryChips options={categories} value={category} onChange={setCategory} />
      {visible.length === 0 ? (
        <EmptyState
          icon="dish"
          title={recipes && recipes.length === 0 ? t('kitchen.dishes.emptyAll') : t('kitchen.empty')}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.label ?? '_flat'}>
              {g.label && (
                <h2 className="mb-3 font-display text-base font-medium text-ink">{g.label}</h2>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {g.items.map((r) => (
                  <Link
                    key={r.id}
                    to={`/kitchen/dishes/${r.id}`}
                    className="group overflow-hidden rounded-card border border-hairline bg-surface transition-colors hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                  >
                    <div className="aspect-[4/3] w-full bg-surface-sunken">
                      <DishImage src={r.image_url} name={r.name_en} rounded="rounded-none" />
                    </div>
                    <div className="p-3">
                      <BiName en={r.name_en} ar={r.name_ar} className="font-medium leading-snug text-ink" />
                      {r.branch_name && (
                        <p className="mt-0.5 truncate text-xs text-ink-subtle">{r.branch_name}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ProductionGrid({ q }: { q: string }) {
  const { t } = useI18n()
  const { data: recipes, isLoading, isError, refetch } = useProductionRecipes()
  const [kitchen, setKitchen] = useState('all')

  const kitchens = useMemo(
    () =>
      Array.from(new Set((recipes ?? []).map((r) => r.prep_kitchen_name).filter(Boolean))).sort() as string[],
    [recipes],
  )

  const visible = useMemo(() => {
    let list = recipes ?? []
    const query = q.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (r: ProductionRecipeListItem) => r.name_en.toLowerCase().includes(query) || r.name_ar.includes(q),
      )
    }
    if (kitchen !== 'all') list = list.filter((r) => r.prep_kitchen_name === kitchen)
    return list
  }, [recipes, q, kitchen])

  if (isLoading) return <CardGridSkeleton />
  if (isError) return <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />

  return (
    <>
      <CategoryChips options={kitchens} value={kitchen} onChange={setKitchen} />
      {visible.length === 0 ? (
        <EmptyState
          icon="production"
          title={recipes && recipes.length === 0 ? t('kitchen.production.emptyAll') : t('kitchen.empty')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <Link
              key={r.id}
              to={`/kitchen/production/${r.id}`}
              className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-4 transition-colors hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
                <Icon name="production" size={20} />
              </span>
              <div className="min-w-0">
                <BiName en={r.name_en} ar={r.name_ar} className="font-medium text-ink" />
                <p className="mt-0.5 truncate text-xs text-ink-subtle">
                  {[r.prep_kitchen_name, r.output_qty && `${r.output_qty} ${r.output_unit_code ?? ''}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="p-3">
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      ))}
    </div>
  )
}
