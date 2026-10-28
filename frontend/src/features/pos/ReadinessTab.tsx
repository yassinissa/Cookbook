import { useMemo, useState } from 'react'

import { Card } from '@/components/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { Pill } from '@/components/Pill'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'
import { useModifierReadiness, useModifierGroups } from '@/lib/queries'
import type { DeductionStatus, ModifierGroup, ModifierReadinessRow } from '@/types/api'
import { Icon } from '@/components/Icon'
import { ModifierGroupEditor } from './ModifierGroupEditor'
import { issueText, ruleSummary } from './modifierRules'

const STATUS_TONE: Record<DeductionStatus, 'success' | 'warning' | 'neutral'> = {
  ready: 'success',
  needs_data: 'warning',
  no_impact: 'neutral',
}
type Filter = DeductionStatus | 'no_key' | 'all'
const FILTERS: Filter[] = ['needs_data', 'no_key', 'ready', 'no_impact', 'all']

/** used on a dish and moves stock, but the sales report can't be matched to it */
const lacksKey = (r: ModifierReadinessRow) =>
  r.status !== 'no_impact' && !r.has_match_key && r.used_by.length > 0

export function ReadinessTab() {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useModifierReadiness()
  const { data: groups } = useModifierGroups()
  const [filter, setFilter] = useState<Filter>('needs_data')
  const [editing, setEditing] = useState<ModifierGroup | null>(null)

  const rows = useMemo(
    () => (data?.options ?? []).filter((r) =>
      filter === 'all' || (filter === 'no_key' ? lacksKey(r) : r.status === filter)),
    [data, filter],
  )

  if (isLoading) return <Skeleton className="h-72" />
  if (isError) return <ErrorState title={t('mods.readiness.title')} onRetry={() => refetch()} />

  const s = data!.summary
  const ruleGroups = data!.rule_issues ?? []
  const openGroup = (id: string) => {
    const g = (groups ?? []).find((x) => x.id === id)
    if (g) setEditing(g)
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ink-subtle">{t('mods.readiness.subtitle')}</p>

      {ruleGroups.length > 0 && (
        <Card className="border-warning-subtle p-4">
          <div className="flex items-start gap-2">
            <Icon name="warning" size={16} className="mt-0.5 flex-none text-warning-ink" />
            <div>
              <p className="text-sm font-semibold text-ink">
                {t('mods.readiness.rulesTitle')} <span className="tnum text-ink-subtle">· {ruleGroups.length}</span>
              </p>
              <p className="text-xs text-ink-subtle">{t('mods.readiness.rulesHint')}</p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-hairline">
            {ruleGroups.map((g) => (
              <li key={g.group_id}>
                <button
                  type="button"
                  onClick={() => openGroup(g.group_id)}
                  className="-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-2.5 text-start transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-ink">{g.group}</span>
                    <span className="tnum text-xs text-ink-subtle">{ruleSummary(g.min_select, g.max_select, t)}</span>
                  </span>
                  {g.issues.map((iss) => (
                    <span key={iss.code} className="mt-0.5 block text-xs text-warning-ink">{issueText(iss, t)}</span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = {
            all: s.total, needs_data: s.needs_data, no_key: s.needs_match_key,
            ready: s.ready, no_impact: s.no_impact,
          }[f]
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                filter === f
                  ? 'border-accent bg-accent-subtle text-accent-ink'
                  : 'border-hairline text-ink-subtle hover:text-ink',
              )}
            >
              {f === 'all' ? t('mods.readiness.filter.all')
                : f === 'no_key' ? t('mods.readiness.filter.noKey') : t(`mods.status.${f}`)}
              <span className="tnum text-ink-subtle">{count}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="check" title={t('mods.readiness.empty')} />
      ) : (
        <Card elevated className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-start font-medium">{t('mods.col.group')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('mods.opt.kind')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('mods.col.status')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('mods.readiness.usedBy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((r) => (
                  <ReadinessRow
                    key={r.option_id}
                    r={r}
                    onOpen={() => openGroup(r.group_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <ModifierGroupEditor group={editing} open onClose={() => setEditing(null)} />}
    </div>
  )
}

function ReadinessRow({ r, onOpen }: { r: ModifierReadinessRow; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <tr onClick={onOpen} className="cursor-pointer align-top hover:bg-surface-sunken">
      <td className="px-4 py-2.5">
        <div className="font-medium text-ink">{r.name_en}</div>
        <div className="text-xs text-ink-subtle">{r.group}</div>
      </td>
      <td className="px-3 py-2.5 text-ink-muted">{t(`mods.kind.${r.kind}`)}</td>
      <td className="px-3 py-2.5">
        <Pill tone={STATUS_TONE[r.status]}>{t(`mods.status.${r.status}`)}</Pill>
        {r.status === 'needs_data' && r.missing[0] && (
          <div className="mt-1 max-w-xs text-2xs text-ink-subtle">{r.missing[0]}</div>
        )}
        {lacksKey(r) && (
          <div className="mt-1 text-2xs text-warning-ink">{t('mods.readiness.noKey')}</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-ink-muted">
        {r.used_by.length === 0 ? (
          <span className="text-ink-subtle">{t('mods.readiness.unused')}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.used_by.slice(0, 4).map((u) => (
              <span key={u.dish_id} className="rounded bg-surface-sunken px-1.5 py-0.5">
                {u.dish}
                {u.branch ? ` · ${u.branch}` : ''}
              </span>
            ))}
            {r.used_by.length > 4 && <span>+{r.used_by.length - 4}</span>}
          </div>
        )}
      </td>
    </tr>
  )
}
