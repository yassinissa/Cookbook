import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Icon, type IconName } from '@/components/Icon'
import { Input, Select } from '@/components/Input'
import { Page, PageHeader, SegmentedButtons } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useActivity } from '@/lib/queries'
import { dateTime, relativeTime } from '@/lib/format'
import { useI18n, type TFunc } from '@/i18n'
import type { ActivityEntry } from '@/types/api'

const ACTION_ICON: Record<string, IconName> = {
  created: 'plus',
  updated: 'edit',
  recalculated: 'refresh',
  deleted: 'trash',
  standard_updated: 'shield',
  standard_approved: 'check',
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

  const activeFilters =
    !!query.kind ||
    !!query.action ||
    !!query.actor ||
    !!query.recipe ||
    !!query.q ||
    !!query.date_from ||
    !!query.date_to

  const groups = useMemo(() => groupByDay(data?.results ?? [], locale), [data, locale])

  const from = data && data.count ? (data.page - 1) * data.page_size + 1 : 0
  const to = data ? Math.min(data.page * data.page_size, data.count) : 0

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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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
                className="h-8 text-[13px]"
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
                className="h-8 text-[13px]"
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
                className="h-8 text-[13px]"
                value={query.date_from ?? ''}
                onChange={(e) => set('date_from', e.target.value)}
              />
            </FilterField>
            <FilterField label={t('activity.filter.to')}>
              <Input
                type="date"
                className="h-8 text-[13px]"
                value={query.date_to ?? ''}
                onChange={(e) => set('date_to', e.target.value)}
              />
            </FilterField>

            <div className="relative">
              <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
                <Icon name="search" size={14} />
              </span>
              <Input
                className="h-8 ps-8 text-[13px]"
                placeholder={t('activity.filter.search')}
                value={query.q ?? ''}
                onChange={(e) => set('q', e.target.value)}
              />
            </div>

            {activeFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="text-2xs font-semibold uppercase tracking-wide text-accent-ink hover:underline"
              >
                {t('activity.filter.clear')}
              </button>
            )}
          </div>
        </Card>
      )}

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

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-ink-subtle">
              {t('activity.range', { from, to, total: data.count })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="chevronLeft"
                disabled={data.page <= 1}
                onClick={() => set('page', String(data.page - 1))}
              >
                {t('activity.prev')}
              </Button>
              <span className="tnum text-xs text-ink-subtle">
                {data.page} / {data.num_pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.page >= data.num_pages}
                onClick={() => set('page', String(data.page + 1))}
              >
                {t('activity.next')}
                <Icon name="chevronRight" size={14} className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</span>
      {children}
    </label>
  )
}

interface DayGroup {
  key: string
  label: string
  entries: ActivityEntry[]
}

function groupByDay(entries: ActivityEntry[], locale: 'en' | 'ar'): DayGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const out: DayGroup[] = []
  for (const e of entries) {
    const d = new Date(e.created_at)
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    const key = String(dayStart.getTime())
    let group = out.find((g) => g.key === key)
    if (!group) {
      const label =
        dayStart.getTime() === today.getTime()
          ? locale === 'ar'
            ? 'اليوم'
            : 'Today'
          : dayStart.getTime() === yesterday.getTime()
            ? locale === 'ar'
              ? 'أمس'
              : 'Yesterday'
            : d.toLocaleDateString(locale === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
      group = { key, label, entries: [] }
      out.push(group)
    }
    group.entries.push(e)
  }
  return out
}

function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Card className="overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-hairline px-4 py-3.5 last:border-0">
                <Skeleton className="h-7 w-7 flex-none rounded-full" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="ms-auto h-3 w-10" />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}
