import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Pill } from '@/components/Pill'
import { Select } from '@/components/Input'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDeductionIssues } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { number, relativeTime, shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'
import type { DeductionIssue, DeductionSide } from '@/types/api'

const DAYS = [7, 14, 30]
// deduction_issues.py's `status` vocabulary — anything else reads as "unknown"
const STATUSES = [
  'dish_missing', 'dish_unpublished', 'dish_stale', 'published_unmatched', 'no_ingredients',
  'conversion_missing', 'option_missing', 'option_needs_data', 'option_unpublished',
  'marked_no_impact', 'stock_short', 'import_failed', 'brand_unknown', 'unknown',
] as const
type Status = (typeof STATUSES)[number]
const statusOf = (s: string): Status => (STATUSES as readonly string[]).includes(s) ? (s as Status) : 'unknown'
const SIDES: Array<DeductionSide | 'all'> = ['cookbook', 'inventory', 'expected', 'all']

/**
 * What went wrong deducting real sales — inventory-platform's per-line import
 * issues, one card per root cause, each saying where it's fixed in Cookbook.
 */
export function DeductionTab() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const [days, setDays] = useState(14)
  const [side, setSide] = useState<DeductionSide | 'all'>('cookbook')
  const { data, isLoading, isError, error, refetch } = useDeductionIssues(days)

  const refresh = useMutation({
    mutationFn: () => api.fetchDeductionIssues(days, true),
    onSuccess: (fresh) => qc.setQueryData(qk.deductionIssues(days), fresh),
    onError: (e) => toast.error(parseApiError(e).message),
  })

  const issues = (data?.issues ?? []).filter((i) => side === 'all' || i.side === side)

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ink-subtle">{t('ded.subtitle')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-36">
          <Select aria-label={t('ded.period')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAYS.map((d) => (
              <option key={d} value={d}>{t('ded.lastDays', { n: d })}</option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="secondary" icon="refresh" loading={refresh.isPending}
          onClick={() => refresh.mutate()}>
          {t('ded.refresh')}
        </Button>
        {data && (
          <span className="text-xs text-ink-subtle">
            {t('ded.scanned', { n: data.imports_scanned, when: relativeTime(data.checked_at, locale) })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : isError ? (
        <ErrorState title={t('ded.error')} body={parseApiError(error).message} onRetry={() => refetch()} />
      ) : (
        <>
          <div role="tablist" aria-label={t('ded.filter')} className="flex flex-wrap gap-1.5">
            {SIDES.map((s) => {
              const n = s === 'all' ? data!.issues.length : data!.summary[s]
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={side === s}
                  onClick={() => setSide(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                    side === s
                      ? 'border-accent bg-accent-subtle text-accent-ink'
                      : 'border-hairline text-ink-subtle hover:text-ink',
                  )}
                >
                  {t(`ded.side.${s}`)}
                  <span className="tnum text-ink-subtle">{n}</span>
                </button>
              )
            })}
          </div>

          {data!.imports_scanned === 0 ? (
            <EmptyState icon="pos" title={t('ded.noImports', { n: days })} body={t('ded.noImports.hint')} />
          ) : issues.length === 0 ? (
            <EmptyState
              icon="check"
              title={side === 'cookbook' ? t('ded.empty.cookbook') : t('ded.empty')}
              body={t('ded.empty.hint', { n: data!.imports_scanned })}
            />
          ) : (
            <ul className="space-y-3">
              {issues.map((i, k) => <IssueCard key={`${i.code}-${i.pos_item_name}-${i.pos_modifier}-${i.item}-${k}`} i={i} />)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

const SIDE_TONE: Record<DeductionSide, 'warning' | 'neutral' | 'success'> = {
  cookbook: 'warning', inventory: 'neutral', expected: 'success',
}

function IssueCard({ i }: { i: DeductionIssue }) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const title = i.pos_item_name
    ? `${i.pos_item_name}${i.pos_modifier ? ` [${i.pos_modifier}]` : ''}`
    : i.item ?? '—'
  const tone = i.side === 'cookbook' && i.level === 'error' ? 'danger' : SIDE_TONE[i.side]

  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <p className="font-medium text-ink">{title}</p>
            <p className="text-xs text-ink-subtle">
              {[i.brand, i.branches.join(', ')].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Pill tone={tone}>{t(`ded.status.${statusOf(i.status)}`)}</Pill>
        </div>

        <p className="mt-2 text-sm text-ink-muted">{i.message}</p>

        <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg bg-surface-sunken p-3">
          <Icon
            name={i.side === 'expected' ? 'check' : 'info'}
            size={16}
            className={cn('mt-0.5 flex-none', i.side === 'cookbook' ? 'text-accent-ink' : 'text-ink-subtle')}
          />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">
              {i.side === 'inventory' ? t('ded.fixInventory') : i.side === 'expected' ? t('ded.fixNone') : t('ded.fixHere')}
            </span>{' '}
            {i.fix}
          </p>
          {i.target && (
            <Link
              to={i.target.path}
              className="inline-flex flex-none items-center gap-1 rounded-md border border-hairline-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              {t('ded.open', { label: i.target.label })}
              <Icon name="external" size={12} />
            </Link>
          )}
        </div>

        {i.side === 'cookbook' && (
          <p className="mt-2 text-xs text-ink-subtle">
            {i.retryable ? t('ded.afterFix.reapply') : t('ded.afterFix.future')}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          <span className="tnum">{t('ded.meta', { lines: i.occurrences, qty: number(i.qty_sold, Number.isInteger(i.qty_sold) ? 0 : 2) })}</span>
          <span>
            {i.first_date === i.last_date
              ? shortDate(i.last_date, locale)
              : `${shortDate(i.first_date, locale)} – ${shortDate(i.last_date, locale)}`}
          </span>
          {(i.lines.length > 0 || i.imports.length > 0) && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              {open ? t('ded.hide') : t('ded.details')}
            </button>
          )}
        </div>

        {open && (
          <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
            {i.lines.length > 0 && (
              <div>
                <p className="mb-1 font-semibold uppercase tracking-wide text-ink-subtle">{t('ded.lines')}</p>
                <ul className="space-y-0.5 text-ink-muted">
                  {i.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-ink-subtle">{t('ded.imports')}</p>
              <ul className="space-y-0.5 text-ink-muted">
                {i.imports.map((r) => (
                  <li key={r.id}>{shortDate(r.date, locale)} · {r.branch}</li>
                ))}
              </ul>
              {i.inventory_fix && i.side !== 'inventory' && (
                <p className="mt-2 text-ink-subtle">{t('ded.inventorySays')} {i.inventory_fix}</p>
              )}
            </div>
          </div>
        )}
      </Card>
    </li>
  )
}
