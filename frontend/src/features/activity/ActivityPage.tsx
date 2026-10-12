import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Card } from '@/components/Card'
import { Icon, type IconName } from '@/components/Icon'
import { Input, Select } from '@/components/Input'
import { Page, PageHeader, SegmentedButtons, FilterTrigger, FilterSheet } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState } from '@/components/States'
import { useActivity } from '@/lib/queries'
import { dateTime, relativeTime } from '@/lib/format'
import { useI18n, type TFunc } from '@/i18n'
import type { ActivityEntry } from '@/types/api'
import { FeedPager, FeedSkeleton, FilterField, groupByDay, useSearchParamInput } from './feedParts'

const ACTION_ICON: Record<string, IconName> = {
  created: 'plus',
  updated: 'edit',
  recalculated: 'refresh',
  deleted: 'trash',
  standard_updated: 'shield',
  standard_approved: 'check',
  published: 'external',
}

export function ActivityPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()

  const query = {
    page: Number(params.get('page') || 1),
    kind: params.get('kind') || undefined,
    action: params.get('action') || undefined,
    actor: params.get('actor') || undefined,
    recipe: params.get('recipe') || undefined,
    q: params.get('q') || undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
  }

  const { data, isLoading, isError, isFetching, refetch } = useActivity(query)

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
      for (const k of ['kind', 'action', 'actor', 'date_from', 'date_to']) next.delete(k)
      next.delete('page')
      return next
    })
  }
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount = [
    query.kind,
    query.action,
    query.actor,
    query.date_from,
    query.date_to,
  ].filter(Boolean).length

  const activeFilters = activeFilterCount > 0 || !!query.recipe || !!query.q

  const groups = useMemo(() => groupByDay(data?.results ?? [], locale), [data, locale])

  const filterFields = (
    <>
      <FilterField label={t('activity.filter.kind')}>
        <SegmentedButtons
          label={t('activity.filter.kind')}
          value={query.kind ?? 'all'}
          onChange={(v) => set('kind', v === 'all' ? '' : v)}
          options={[
            { value: 'all', label: t('activity.filter.all') },
            { value: 'dish', label: t('activity.filter.dishes') },
            { value: 'production', label: t('activity.filter.production') },
          ]}
        />
      </FilterField>

      <FilterField label={t('activity.filter.action')}>
        <Select
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.action ?? ''}
          onChange={(e) => set('action', e.target.value)}
        >
          <option value="">{t('activity.filter.all')}</option>
          {(data?.action_types ?? []).map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label={t('activity.filter.actor')}>
        <Select
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.actor ?? ''}
          onChange={(e) => set('actor', e.target.value)}
        >
          <option value="">{t('activity.filter.anyone')}</option>
          {(data?.actors ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label={t('activity.filter.from')}>
        <Input
          type="date"
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.date_from ?? ''}
          onChange={(e) => set('date_from', e.target.value)}
        />
      </FilterField>
      <FilterField label={t('activity.filter.to')}>
        <Input
          type="date"
          className="h-8 w-full text-[13px] lg:w-auto"
          value={query.date_to ?? ''}
          onChange={(e) => set('date_to', e.target.value)}
        />
      </FilterField>
    </>
  )

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('activity.title')}
        subtitle={data ? t('activity.count', { n: data.count }) : t('activity.subtitle')}
      />

      {isError && <ErrorState body={t('state.retryHint')} onRetry={() => refetch()} />}

      {(data || isLoading) && (
        <Card className="mb-5 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-3">
            <div className="flex items-center gap-2">
              <div className="relative max-w-xs flex-1 lg:flex-none">
                <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
                  <Icon name="search" size={14} />
                </span>
                <Input
                  className="h-8 ps-8 text-[13px]"
                  placeholder={t('activity.filter.search')}
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
          icon="activity"
          title={activeFilters ? t('activity.empty') : t('activity.emptyAll')}
          action={
            activeFilters
              ? { label: t('activity.filter.clear'), onClick: clearAll }
              : undefined
          }
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
                    <EntryRow key={e.id} e={e} locale={locale} t={t} />
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

function EntryRow({
  e,
  locale,
  t,
}: {
  e: ActivityEntry
  locale: 'en' | 'ar'
  t: TFunc
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
        <Icon name={ACTION_ICON[e.action] ?? 'activity'} size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          {e.changed_by && <span className="font-medium">{e.changed_by} </span>}
          <span className="text-ink-muted">{e.action_display.toLowerCase()} </span>
          <Link
            to={e.recipe_path}
            className="font-medium text-accent-ink hover:underline"
          >
            {e.recipe_name}
          </Link>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
          <Pill tone="neutral">
            {e.kind === 'dish' ? t('activity.kind.dish') : t('activity.kind.production')}
          </Pill>
          {e.scope_name && <span>{e.scope_name}</span>}
          {e.recipe_code && <span className="font-mono">#{e.recipe_code}</span>}
          {e.description && <span className="text-ink-muted">· {e.description}</span>}
        </div>
      </div>
      <time
        className="flex-none text-2xs text-ink-subtle"
        title={dateTime(e.created_at, locale)}
        dateTime={e.created_at}
      >
        {relativeTime(e.created_at, locale)}
      </time>
    </li>
  )
}
