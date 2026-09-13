import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/Card'
import { DishImage } from '@/components/DishImage'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { BiName, Page, PageHeader, SegmentedButtons } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDishRecipes, useProductionRecipes } from '@/lib/queries'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'
import type { DishRecipeListItem, ProductionRecipeListItem } from '@/types/api'

/*
 * The staff-facing "what do I cook and how" screen — a photo-forward grid,
 * no costing, no pricing, no admin chrome. Full CRUD stays on the regular
 * Dish/Production screens (gated by dish.edit/production.edit); this one is
 * pure display, open to anyone who can see recipes at all.
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showDishes && showProduction && (
          <SegmentedButtons
            options={[
              { value: 'dishes', label: t('kitchen.tab.dishes') },
              { value: 'production', label: t('kitchen.tab.production') },
            ]}
            value={activeTab}
            onChange={(v) => setTab(v as 'dishes' | 'production')}
            label={t('kitchen.tab.label')}
          />
        )}
        <Input
          className="sm:max-w-xs"
          placeholder={t('kitchen.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('kitchen.search')}
        />
      </div>

      {activeTab === 'dishes' ? <DishGrid q={q} /> : <ProductionGrid q={q} />}
    </Page>
  )
}

function DishGrid({ q }: { q: string }) {
  const { t } = useI18n()
  const { data: recipes, isLoading, isError, refetch } = useDishRecipes()

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return recipes ?? []
    return (recipes ?? []).filter(
      (r: DishRecipeListItem) => r.name_en.toLowerCase().includes(query) || r.name_ar.includes(q),
    )
  }, [recipes, q])

  if (isLoading) return <CardGridSkeleton />
  if (isError) return <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
  if (visible.length === 0) {
    return (
      <EmptyState
        icon="dish"
        title={recipes && recipes.length === 0 ? t('kitchen.dishes.emptyAll') : t('kitchen.empty')}
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {visible.map((r) => (
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
            {(r.branch_name || r.category_name) && (
              <p className="mt-0.5 truncate text-xs text-ink-subtle">
                {[r.branch_name, r.category_name].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function ProductionGrid({ q }: { q: string }) {
  const { t } = useI18n()
  const { data: recipes, isLoading, isError, refetch } = useProductionRecipes()

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return recipes ?? []
    return (recipes ?? []).filter(
      (r: ProductionRecipeListItem) => r.name_en.toLowerCase().includes(query) || r.name_ar.includes(q),
    )
  }, [recipes, q])

  if (isLoading) return <CardGridSkeleton />
  if (isError) return <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
  if (visible.length === 0) {
    return (
      <EmptyState
        icon="production"
        title={recipes && recipes.length === 0 ? t('kitchen.production.emptyAll') : t('kitchen.empty')}
      />
    )
  }

  return (
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
