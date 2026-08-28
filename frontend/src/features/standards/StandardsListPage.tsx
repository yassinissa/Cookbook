import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { Page, PageHeader, SegmentedButtons, BiName } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { Stat } from '@/components/Stat'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useDishStandards } from '@/lib/queries'
import { shortDate } from '@/lib/format'
import { useI18n } from '@/i18n'
import type { DishStandardListItem } from '@/types/api'

type StatusKey = 'all' | 'approved' | 'review' | 'missing'

function statusOf(r: DishStandardListItem): Exclude<StatusKey, 'all'> {
  if (!r.has_standard) return 'missing'
  if (r.needs_review) return 'review'
  return 'approved'
}

function StatusPill({ r }: { r: DishStandardListItem }) {
  const { t } = useI18n()
  const s = statusOf(r)
  if (s === 'missing') return <Pill tone="neutral">{t('standards.status.missing')}</Pill>
  if (s === 'review')
    return (
      <Pill tone="warning" icon="warning">
        {t('standards.status.review')}
      </Pill>
    )
  return (
    <Pill tone="success" icon="check">
      {t('standards.status.approved')}
    </Pill>
  )
}

export function StandardsListPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { data: rows, isLoading, isError, refetch } = useDishStandards()

  const [q, setQ] = useState('')
  const [branch, setBranch] = useState('all')
  const [status, setStatus] = useState<StatusKey>('all')

  const branches = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.branch).filter(Boolean))).sort(),
    [rows],
  )

  const summary = useMemo(() => {
    const list = rows ?? []
    const withStd = list.filter((r) => r.has_standard).length
    const review = list.filter((r) => r.has_standard && r.needs_review).length
    const missing = list.length - withStd
    return { total: list.length, withStd, review, missing }
  }, [rows])

  const missingDishes = useMemo(
    () => (rows ?? []).filter((r) => !r.has_standard),
    [rows],
  )

  const visible = useMemo(() => {
    let list = rows ?? []
    const query = q.trim().toLowerCase()
    if (query)
      list = list.filter(
        (r) =>
          r.name_en.toLowerCase().includes(query) ||
          r.name_ar.includes(q) ||
          r.recipe_code.toLowerCase().includes(query),
      )
    if (branch !== 'all') list = list.filter((r) => r.branch === branch)
    if (status !== 'all') list = list.filter((r) => statusOf(r) === status)
    return list
  }, [rows, q, branch, status])

  const coveragePct = summary.total ? Math.round((summary.withStd / summary.total) * 100) : 0

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('standards.title')}
        subtitle={rows ? t('standards.count', { n: rows.length }) : t('standards.subtitle')}
      />

      {isError && <ErrorState body={t('state.retryHint')} onRetry={() => refetch()} />}
      {isLoading && <ListSkeleton />}

      {rows && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label={t('standards.kpi.coverage')}
              value={summary.withStd}
              suffix={`/${summary.total}`}
              note={t('standards.kpi.coverageNote', { total: summary.total })}
              tone={coveragePct >= 80 ? 'good' : coveragePct >= 50 ? 'neutral' : 'warn'}
            />
            <Stat
              label={t('standards.kpi.review')}
              value={summary.review}
              note={t('standards.kpi.reviewNote')}
              tone={summary.review > 0 ? 'warn' : 'good'}
            />
            <Stat
              label={t('standards.kpi.missing')}
              value={summary.missing}
              note={t('standards.kpi.missingNote')}
              tone={summary.missing > 0 ? 'warn' : 'good'}
            />
          </div>

          {missingDishes.length > 0 && (
            <Card elevated rail="alert" className="mb-5">
              <div className="p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Icon name="warning" size={14} className="text-warning-ink" />
                  {t('standards.gap.title')}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {t('standards.gap.body', { n: missingDishes.length })}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {missingDishes.slice(0, 12).map((d) => (
                    <Link
                      key={d.id}
                      to={`/standards/${d.id}`}
                      className="rounded-full border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken"
                    >
                      {d.name_en}
                    </Link>
                  ))}
                  {missingDishes.length > 12 && (
                    <span className="px-1 py-1 text-xs text-ink-subtle">
                      +{missingDishes.length - 12}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          )}

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
              {branches.length > 1 && (
                <FilterGroup
                  label={t('standards.filter.branch')}
                  value={branch}
                  onChange={setBranch}
                  options={[
                    { value: 'all', label: t('standards.filter.all') },
                    ...branches.map((b) => ({ value: b, label: b })),
                  ]}
                />
              )}
              <FilterGroup
                label={t('standards.filter.status')}
                value={status}
                onChange={(v) => setStatus(v as StatusKey)}
                options={[
                  { value: 'all', label: t('standards.filter.all') },
                  { value: 'approved', label: t('standards.filter.approved') },
                  { value: 'review', label: t('standards.filter.review') },
                  { value: 'missing', label: t('standards.filter.missing') },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon="standards"
              title={rows.length === 0 ? t('standards.emptyAll') : t('standards.empty')}
            />
          ) : (
            <>
              {/* desktop table */}
              <Card elevated rail="idle" className="hidden overflow-hidden md:block">
                <div className="scroll-x">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-sunken text-[11px] uppercase tracking-[0.06em] text-ink-subtle">
                        <th className="px-4 py-2.5 text-start font-semibold">
                          {t('standards.col.dish')}
                        </th>
                        <th className="px-3 py-2.5 text-start font-semibold">
                          {t('standards.col.branch')}
                        </th>
                        <th className="px-3 py-2.5 text-start font-semibold">
                          {t('standards.col.coverage')}
                        </th>
                        <th className="px-3 py-2.5 text-end font-semibold">
                          {t('standards.col.portion')}
                        </th>
                        <th className="px-3 py-2.5 text-end font-semibold">
                          {t('standards.col.temp')}
                        </th>
                        <th className="px-3 py-2.5 text-end font-semibold">
                          {t('standards.col.taste')}
                        </th>
                        <th className="px-4 py-2.5 text-end font-semibold">
                          {t('standards.col.status')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {visible.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => navigate(`/standards/${r.id}`)}
                          className="cursor-pointer transition-colors hover:bg-surface-sunken"
                        >
                          <td className="px-4 py-2.5">
                            <BiName en={r.name_en} ar={r.name_ar} className="font-medium" />
                            <span className="ms-2 font-mono text-2xs text-ink-subtle">
                              {r.recipe_code}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink-muted">{r.branch || '—'}</td>
                          <td className="px-3 py-2.5">
                            <CoverageBar filled={r.spec_coverage.filled} total={r.spec_coverage.total} />
                          </td>
                          <td className="tnum px-3 py-2.5 text-end font-mono text-ink-muted">
                            {r.portion_weight_g ? `${r.portion_weight_g} g` : '—'}
                          </td>
                          <td className="tnum px-3 py-2.5 text-end font-mono text-ink-muted">
                            {r.serving_temp_c ? `${r.serving_temp_c} °C` : '—'}
                          </td>
                          <td className="tnum px-3 py-2.5 text-end font-mono text-ink-muted">
                            {r.has_standard ? `${r.taste_axis_count}/8` : '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col items-end gap-0.5">
                              <StatusPill r={r} />
                              {r.is_approved && r.approval_date && (
                                <span className="text-2xs text-ink-subtle">
                                  {shortDate(r.approval_date, locale)}
                                </span>
                              )}
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
                      to={`/standards/${r.id}`}
                      className="block rounded-card border border-hairline bg-surface p-3.5 transition-colors active:bg-surface-sunken"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <BiName en={r.name_en} ar={r.name_ar} className="font-medium" />
                        <StatusPill r={r} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[13px]">
                        <span className="text-ink-subtle">
                          {r.branch} · #{r.recipe_code}
                        </span>
                        <CoverageBar
                          filled={r.spec_coverage.filled}
                          total={r.spec_coverage.total}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Page>
  )
}

function CoverageBar({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={
              'h-1.5 w-4 rounded-full ' + (i < filled ? 'bg-accent' : 'bg-surface-sunken')
            }
          />
        ))}
      </span>
      <span className="tnum text-2xs text-ink-subtle">
        {filled}/{total}
      </span>
    </span>
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
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Card className="overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="ms-auto h-4 w-20" />
          </div>
        ))}
      </Card>
    </>
  )
}
