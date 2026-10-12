import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Input, Select } from '@/components/Input'
import { FilterSheet, FilterTrigger, Page, PageHeader, SegmentedButtons } from '@/components/Page'
import { EmptyState, ErrorState } from '@/components/States'
import {
  FeedPager,
  FeedSkeleton,
  FilterField,
  groupByDay,
  useSearchParamInput,
} from '@/features/activity/feedParts'
import { useAuth } from '@/auth/AuthProvider'
import { useRecipeChanges } from '@/lib/queries'
import { useI18n } from '@/i18n'
import { ChangeEntry } from './ChangeEntry'

const FILTER_KEYS = ['type', 'kind', 'actor', 'date_from', 'date_to']

/** The audit trail for the recipes themselves — every create, edit and cost
 *  recalculation, itemised, filterable by recipe, person, date and whether
 *  the change made a new version. */
export function RecipeChangesPage() {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const query = {
    page: Number(params.get('page') || 1),
    type: params.get('type') || undefined,
    kind: params.get('kind') || undefined,
    actor: params.get('actor') || undefined,
    recipe: params.get('recipe') || undefined,
    q: params.get('q') || undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
  }
  const { data, isLoading, isError, isFetching, refetch } = useRecipeChanges(query)

  const set = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })
  }
  const clearAll = () => setParams(new URLSearchParams())
  const [search, setSearch] = useSearchParamInput(query.q ?? '', (v) => set('q', v))
  const clearFilterFields = () => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const k of [...FILTER_KEYS, 'page']) next.delete(k)
      return next
    })
  }

  const activeFilterCount = [query.type, query.kind, query.actor, query.date_from, query.date_to].filter(Boolean).length
  const activeFilters = activeFilterCount > 0 || !!query.recipe || !!query.q
  const groups = useMemo(() => groupByDay(data?.results ?? [], locale), [data, locale])
  const bothKinds = can('dish.view') && can('production.view')
  // filtered to one recipe (arrived from a recipe's history drawer)
  const oneRecipe = query.recipe ? data?.results[0]?.recipe_name : undefined

  const filterFields = (
    <>
      <FilterField label={t('change.type.label')}>
        <SegmentedButtons
          label={t('change.type.label')}
          value={query.type ?? 'all'}
          onChange={(v) => set('type', v === 'all' ? '' : v)}
          options={[
            { value: 'all', label: t('change.type.all') },
            { value: 'version', label: t('change.type.version') },
            { value: 'adjustment', label: t('change.type.adjustment') },
          ]}
        />
      </FilterField>

      {bothKinds && (
        <FilterField label={t('activity.filter.kind')}>
          <Select
            className="h-8 w-full text-[13px] lg:w-auto"
            value={query.kind ?? ''}
            onChange={(e) => set('kind', e.target.value)}
          >
            <option value="">{t('activity.filter.all')}</option>
            <option value="dish">{t('activity.filter.dishes')}</option>
            <option value="production">{t('activity.filter.production')}</option>
          </Select>
        </FilterField>
      )}

      <FilterField label={t('activity.filter.actor')}>
        <Select
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.actor ?? ''}
          onChange={(e) => set('actor', e.target.value)}
        >
          <option value="">{t('activity.filter.anyone')}</option>
          {(data?.actors ?? []).map((a) => (
            <option key={a.username} value={a.username}>
              {a.name}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label={t('activity.filter.from')}>
        <Input
          type="date"
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.date_from ?? ''}
          max={query.date_to}
          onChange={(e) => set('date_from', e.target.value)}
        />
      </FilterField>
      <FilterField label={t('activity.filter.to')}>
        <Input
          type="date"
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.date_to ?? ''}
          min={query.date_from}
          onChange={(e) => set('date_to', e.target.value)}
        />
      </FilterField>
    </>
  )

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('change.title')}
        subtitle={data ? t('change.count', { n: data.count, v: data.versions }) : t('change.subtitle')}
      />

      <p className="mb-5 flex max-w-3xl items-start gap-2 text-[13px] text-ink-muted">
        <Icon name="info" size={15} className="mt-0.5 flex-none text-ink-subtle" />
        {t('change.legend')}
      </p>

      {isError && <ErrorState body={t('state.retryHint')} onRetry={() => refetch()} />}

      {(data || isLoading) && (
        <Card className="mb-5 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:w-64 lg:flex-none">
                <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
                  <Icon name="search" size={14} />
                </span>
                <Input
                  className="h-8 ps-8 text-[13px]"
                  aria-label={t('change.filter.search')}
                  placeholder={t('change.filter.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <FilterTrigger onClick={() => setFiltersOpen(true)} activeCount={activeFilterCount} />
            </div>

            <div className="hidden flex-wrap items-center gap-x-4 gap-y-3 lg:flex">{filterFields}</div>

            {activeFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="hidden text-2xs font-semibold uppercase tracking-wide text-accent-ink hover:underline lg:inline"
              >
                {t('activity.filter.clear')}
              </button>
            )}
          </div>

          {query.recipe && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-[13px] text-ink-muted">
              <Icon name="filter" size={13} className="text-ink-subtle" />
              <span>
                {t('change.oneRecipe')}
                {oneRecipe && <span className="font-semibold text-ink"> — {oneRecipe}</span>}
              </span>
              <button
                type="button"
                onClick={() => set('recipe', '')}
                className="text-2xs font-semibold uppercase tracking-wide text-accent-ink hover:underline"
              >
                {t('activity.filter.clear')}
              </button>
            </div>
          )}
        </Card>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onClear={clearFilterFields}
        activeCount={activeFilterCount}
      >
        {filterFields}
      </FilterSheet>

      {isLoading && <FeedSkeleton />}

      {data && data.results.length === 0 && (
        <EmptyState
          icon="history"
          title={activeFilters ? t('change.empty') : t('change.emptyAll')}
          body={activeFilters ? undefined : t('change.emptyAllHint')}
          action={activeFilters ? { label: t('activity.filter.clear'), onClick: clearAll } : undefined}
        />
      )}

      {data && data.results.length > 0 && (
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {groups.map((g) => (
            <section key={g.key} className="mb-6">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {g.label}
              </h2>
              <Card elevated rail="idle" className="overflow-hidden">
                <ol className="divide-y divide-hairline">
                  {g.entries.map((e) => (
                    <ChangeEntry key={e.id} e={e} />
                  ))}
                </ol>
              </Card>
            </section>
          ))}

          <FeedPager
            page={data.page}
            numPages={data.num_pages}
            pageSize={data.page_size}
            count={data.count}
            onPage={(n) => set('page', String(n))}
          />
        </div>
      )}
    </Page>
  )
}
