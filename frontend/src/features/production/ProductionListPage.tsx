import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { Page, PageHeader, SegmentedButtons, BiName } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useProductionRecipes } from '@/lib/queries'
import { useAuth } from '@/auth/AuthProvider'
import { kwd } from '@/lib/format'
import { useI18n } from '@/i18n'
import type { ProductionRecipeListItem } from '@/types/api'

function perUnit(r: ProductionRecipeListItem): string | null {
  const qty = Number(r.output_qty)
  if (!qty || qty <= 0) return null
  return (Number(r.cost) / qty).toFixed(3)
}

export function ProductionListPage() {
  const { t } = useI18n()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { data: recipes, isLoading, isError, refetch } = useProductionRecipes()
  const canEdit = can('production.edit')

  const [q, setQ] = useState('')
  const [kitchen, setKitchen] = useState('all')
  const [section, setSection] = useState('all')

  const kitchens = useMemo(
    () =>
      Array.from(
        new Set((recipes ?? []).map((r) => r.prep_kitchen_name).filter(Boolean)),
      ).sort() as string[],
    [recipes],
  )
  const sections = useMemo(
    () =>
      Array.from(
        new Set((recipes ?? []).map((r) => r.section_name).filter(Boolean)),
      ).sort() as string[],
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
          r.recipe_code.toLowerCase().includes(query),
      )
    if (kitchen !== 'all') list = list.filter((r) => r.prep_kitchen_name === kitchen)
    if (section !== 'all') list = list.filter((r) => r.section_name === section)
    return list
  }, [recipes, q, kitchen, section])

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('production.title')}
        subtitle={recipes ? t('production.count', { n: recipes.length }) : undefined}
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => navigate('/recipes/production/new')}
            >
              {t('action.newProduction')}
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
              placeholder={t('production.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {kitchens.length > 1 && (
              <FilterGroup
                label={t('production.filter.kitchen')}
                value={kitchen}
                onChange={setKitchen}
                options={[
                  { value: 'all', label: t('production.filter.all') },
                  ...kitchens.map((k) => ({ value: k, label: k })),
                ]}
              />
            )}
            {sections.length > 1 && (
              <FilterGroup
                label={t('production.filter.section')}
                value={section}
                onChange={setSection}
                options={[
                  { value: 'all', label: t('production.filter.all') },
                  ...sections.map((s) => ({ value: s, label: s })),
                ]}
              />
            )}
          </div>
        </div>
      )}

      {isLoading && <ListSkeleton />}

      {recipes && visible.length === 0 && (
        <EmptyState
          icon="production"
          title={recipes.length === 0 ? t('production.emptyAll') : t('production.empty')}
          action={
            canEdit
              ? {
                  label: t('action.newProduction'),
                  icon: 'plus',
                  onClick: () => navigate('/recipes/production/new'),
                }
              : undefined
          }
        />
      )}

      {recipes && visible.length > 0 && (
        <>
          {/* desktop table */}
          <Card elevated rail="idle" className="hidden overflow-hidden md:block">
            <div className="scroll-x">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-[11px] uppercase tracking-[0.06em] text-ink-subtle">
                    <th className="px-4 py-2.5 text-start font-semibold">
                      {t('production.col.name')}
                    </th>
                    <th className="px-3 py-2.5 text-start font-semibold">
                      {t('production.col.code')}
                    </th>
                    <th className="px-3 py-2.5 text-start font-semibold">
                      {t('production.col.kitchen')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('production.col.output')}
                    </th>
                    <th className="px-3 py-2.5 text-end font-semibold">
                      {t('production.col.cost')}
                    </th>
                    <th className="px-4 py-2.5 text-end font-semibold">
                      {t('production.col.perUnit')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/recipes/production/${r.id}`)}
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
                      <td className="px-3 py-2.5 text-ink-muted">{r.prep_kitchen_name || '—'}</td>
                      <td className="tnum px-3 py-2.5 text-end font-mono text-ink-muted">
                        {r.output_qty} {r.output_unit_code ?? ''}
                      </td>
                      <td className="tnum px-3 py-2.5 text-end font-mono text-ink">
                        {kwd(r.cost)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-end font-mono text-ink">
                        {kwd(perUnit(r))}
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
                  to={`/recipes/production/${r.id}`}
                  className="block rounded-card border border-hairline bg-surface p-3.5 transition-colors active:bg-surface-sunken"
                >
                  <div className="flex items-start justify-between gap-2">
                    <BiName en={r.name_en} ar={r.name_ar} className="font-medium" />
                    <span className="tnum flex-none font-mono text-sm text-ink">{kwd(r.cost)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[13px]">
                    <span className="text-ink-subtle">
                      {r.prep_kitchen_name || '—'} · #{r.recipe_code}
                    </span>
                    <span className="tnum text-ink-subtle">
                      {r.output_qty} {r.output_unit_code ?? ''}
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
        <div
          key={i}
          className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-0"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ms-auto h-4 w-12" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </Card>
  )
}
