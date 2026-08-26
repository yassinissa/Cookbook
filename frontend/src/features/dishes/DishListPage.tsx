import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { FoodCostValue } from '@/components/Meter'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { Page, PageHeader, SegmentedButtons, BiName } from '@/components/Page'
import { RatingPill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDishRecipes } from '@/lib/queries'
import { useAuth } from '@/auth/AuthProvider'
import { kwd } from '@/lib/format'
import { useI18n } from '@/i18n'
import type { DishRecipeListItem } from '@/types/api'

function foodCostPct(r: DishRecipeListItem): number | null {
  if (r.selling_price && Number(r.selling_price) > 0) {
    return (Number(r.cost) / Number(r.selling_price)) * 100
  }
  return null
}

export function DishListPage() {
  const { t } = useI18n()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { data: recipes, isLoading, isError, refetch } = useDishRecipes()
  const canEdit = can('dish.edit')

  const [q, setQ] = useState('')
  const [branch, setBranch] = useState('all')
  const [category, setCategory] = useState('all')
  const [rating, setRating] = useState('all')

  const branches = useMemo(
    () => Array.from(new Set((recipes ?? []).map((r) => r.branch).filter(Boolean))).sort(),
    [recipes],
  )
  const categories = useMemo(
    () =>
      Array.from(new Set((recipes ?? []).map((r) => r.category_name).filter(Boolean))).sort() as string[],
    [recipes],
  )

  const visible = useMemo(() => {
    let list = recipes ?? []
    const query = q.trim().toLowerCase()
    if (query)
      list = list.filter(
        (r) =>
          r.name_en.toLowerCase().includes(query) ||
          r.name_ar.includes(q) ||
          r.recipe_code.includes(q),
      )
    if (branch !== 'all') list = list.filter((r) => r.branch === branch)
    if (category !== 'all') list = list.filter((r) => r.category_name === category)
    if (rating !== 'all')
      list = list.filter((r) => (rating === 'flagged' ? r.rating_status === 'fix' || r.rating_status === 'attention' : r.rating_status === rating))
    return list
  }, [recipes, q, branch, category, rating])

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('dishes.title')}
        subtitle={recipes ? t('dishes.count', { n: recipes.length }) : undefined}
        actions={
          canEdit && (
            <Button variant="primary" icon="plus" onClick={() => navigate('/recipes/dishes/new')}>
              {t('action.newRecipe')}
            </Button>
          )
        }
      />

      {isError && <ErrorState body={t('state.retryHint')} onRetry={() => refetch()} />}

      {(recipes || isLoading) && (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
              <Icon name="search" size={15} />
            </span>
            <Input
              className="ps-8"
              placeholder={t('dishes.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FilterGroup
              label={t('dishes.filter.branch')}
              value={branch}
              onChange={setBranch}
              options={[
                { value: 'all', label: t('dishes.filter.all') },
                ...branches.map((b) => ({ value: b, label: b })),
              ]}
            />
            {categories.length > 1 && (
              <FilterGroup
                label={t('dishes.filter.category')}
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'all', label: t('dishes.filter.all') },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
            )}
            <FilterGroup
              label={t('dishes.filter.rating')}
              value={rating}
              onChange={setRating}
              options={[
                { value: 'all', label: t('dishes.filter.all') },
                { value: 'flagged', label: 'Flagged' },
                { value: 'ok', label: 'OK' },
              ]}
            />
          </div>
        </div>
      )}

      {isLoading && <ListSkeleton />}

      {recipes && visible.length === 0 && (
        <EmptyState
          icon="dish"
          title={recipes.length === 0 ? t('dishes.emptyAll') : t('dishes.empty')}
          action={
            canEdit
              ? { label: t('action.newRecipe'), icon: 'plus', onClick: () => navigate('/recipes/dishes/new') }
              : undefined
          }
        />
      )}

      {recipes && visible.length > 0 && (
        <>
          {/* desktop table */}
          <Card elevated rail="idle" className="hidden overflow-hidden md:block">
            <div className="scroll-x">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-[11px] uppercase tracking-[0.06em] text-ink-subtle">
                    <th className="px-4 py-2.5 text-start font-semibold">{t('dishes.col.name')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('dishes.col.code')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('dishes.col.branch')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('dishes.col.station')}</th>
                    <th className="px-3 py-2.5 text-end font-semibold">{t('dishes.col.foodCost')}</th>
                    <th className="px-3 py-2.5 text-end font-semibold">{t('dishes.col.price')}</th>
                    <th className="px-4 py-2.5 text-end font-semibold">{t('dishes.col.rating')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/recipes/dishes/${r.id}`)}
                      className="cursor-pointer transition-colors hover:bg-surface-sunken"
                    >
                      <td className="px-4 py-2.5">
                        <BiName en={r.name_en} ar={r.name_ar} className="font-medium" />
                        {r.version > 1 && (
                          <span className="ms-2 text-2xs text-ink-subtle">v{r.version}</span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2.5 font-mono text-xs text-ink-subtle">
                        {r.recipe_code || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.branch || '—'}</td>
                      <td className="px-3 py-2.5 text-ink-muted">{r.section_name || '—'}</td>
                      <td className="px-3 py-2.5 text-end">
                        <FoodCostValue value={foodCostPct(r)} />
                      </td>
                      <td className="tnum px-3 py-2.5 text-end font-mono text-ink">
                        {kwd(r.selling_price)}
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <div className="flex justify-end">
                          <RatingPill status={r.rating_status} rating={r.rating} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* mobile cards */}
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recipes/dishes/${r.id}`}
                  className="block rounded-card border border-hairline bg-surface p-3.5 transition-colors active:bg-surface-sunken"
                >
                  <div className="flex items-start justify-between gap-2">
                    <BiName en={r.name_en} ar={r.name_ar} className="font-medium" />
                    <RatingPill status={r.rating_status} rating={r.rating} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[13px]">
                    <span className="text-ink-subtle">
                      {r.branch} · #{r.recipe_code}
                    </span>
                    <span className="flex items-center gap-3">
                      <FoodCostValue value={foodCostPct(r)} />
                      <span className="tnum text-ink">{kwd(r.selling_price)}</span>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</span>
      <SegmentedButtons options={options} value={value} onChange={onChange} label={label} />
    </div>
  )
}

function ListSkeleton() {
  return (
    <Card className="overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ms-auto h-4 w-12" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </Card>
  )
}
