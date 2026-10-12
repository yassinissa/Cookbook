import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { SegmentedButtons } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, LoadingRow } from '@/components/States'
import { ChangeDetail, hasChangeDetail } from '@/features/changes/ChangeDetail'
import { ChangeEntry } from '@/features/changes/ChangeEntry'
import {
  useDishDiff,
  useDishVersions,
  useProductionDiff,
  useProductionVersions,
  useRecipeChanges,
} from '@/lib/queries'
import { dateTime, kwd, shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type { RecipeChangeEntry, VersionRow } from '@/types/api'

type RecipeKind = 'dish' | 'production'
type Tab = 'changes' | 'versions'
type ChangeFilter = 'all' | 'version' | 'adjustment'

function useVersions(kind: RecipeKind, id: string, enabled: boolean) {
  const dish = useDishVersions(id, enabled && kind === 'dish')
  const prod = useProductionVersions(id, enabled && kind === 'production')
  return kind === 'dish' ? dish : prod
}
function useDiff(kind: RecipeKind, id: string, versionId: string) {
  const dish = useDishDiff(id, versionId, undefined, kind === 'dish')
  const prod = useProductionDiff(id, versionId, undefined, kind === 'production')
  return kind === 'dish' ? dish : prod
}

/**
 * A recipe's full history, in two views:
 *  - **Change history** — every save, recalculation, publish and QA event:
 *    who, when, and the itemised before → after. New versions and plain
 *    adjustments are told apart.
 *  - **Versions** — the numbered revisions of the recipe itself, each
 *    comparable to the current one.
 */
export function VersionDrawer({
  recipeId,
  kind = 'dish',
  open,
  onClose,
}: {
  recipeId: string
  kind?: RecipeKind
  open: boolean
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<Tab>('changes')
  const versions = useVersions(kind, recipeId, open)
  // the change log hangs off the live row, even when an archived version is on screen
  const liveId = versions.data?.find((v) => v.is_current)?.id ?? recipeId

  return (
    <Drawer open={open} onClose={onClose} title={t('version.title')} width="lg">
      <div className="mb-4">
        <SegmentedButtons
          label={t('version.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'changes', label: t('change.tab.changes') },
            { value: 'versions', label: t('change.tab.versions') },
          ]}
        />
      </div>

      {tab === 'changes' && (
        <ChangesTab recipeId={liveId} enabled={open && !versions.isLoading} onNavigate={onClose} />
      )}

      {tab === 'versions' && (
        <>
          {versions.isLoading && <LoadingRow />}
          {versions.isError && <ErrorState onRetry={() => versions.refetch()} />}
          {versions.data && (
            <VersionsTab kind={kind} recipeId={recipeId} versions={versions.data} locale={locale} t={t} />
          )}
        </>
      )}
    </Drawer>
  )
}

/* ── change history ───────────────────────────────────────────────── */

function matches(e: RecipeChangeEntry, f: ChangeFilter) {
  if (f === 'version') return e.is_new_version
  if (f === 'adjustment') return !e.is_new_version && (e.action === 'updated' || e.action === 'recalculated')
  return true
}

function ChangesTab({
  recipeId,
  enabled,
  onNavigate,
}: {
  recipeId: string
  enabled: boolean
  onNavigate: () => void
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<ChangeFilter>('all')
  const { data, isLoading, isError, refetch } = useRecipeChanges(
    { recipe: recipeId, all: '1', page_size: 100 },
    enabled,
  )

  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (isLoading || !data) return <LoadingRow />
  if (data.results.length === 0) return <EmptyState icon="history" title={t('change.emptyRecipe')} />

  const rows = data.results.filter((e) => matches(e, filter))
  // open the newest entry that has something to show
  const firstDetailed = rows.find((e) => hasChangeDetail(e.changes) && e.action !== 'created')?.id

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-subtle">{t('change.legend')}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedButtons
          label={t('change.type.label')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('change.type.all') },
            { value: 'version', label: t('change.type.version') },
            { value: 'adjustment', label: t('change.type.adjustment') },
          ]}
        />
        <Link
          to={`/recipe-changes?recipe=${recipeId}`}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-accent-ink hover:underline"
        >
          {t('change.openAll')}
          <Icon name="arrowRight" size={12} className="rtl:rotate-180" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-surface-sunken p-4 text-sm text-ink-subtle">{t('change.empty')}</p>
      ) : (
        <ol className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline">
          {rows.map((e) => (
            <ChangeEntry key={`${filter}${e.id}`} e={e} showRecipe={false} defaultOpen={e.id === firstDetailed} />
          ))}
        </ol>
      )}
    </div>
  )
}

/* ── versions ─────────────────────────────────────────────────────── */

function VersionsTab({
  kind,
  recipeId,
  versions,
  locale,
  t,
}: {
  kind: RecipeKind
  recipeId: string
  versions: VersionRow[]
  locale: 'en' | 'ar'
  t: TFunc
}) {
  const [compare, setCompare] = useState<string | null>(null)

  if (versions.length <= 1) {
    return <p className="rounded-lg bg-surface-sunken p-4 text-sm text-ink-subtle">{t('version.single')}</p>
  }

  return (
    <div className="space-y-4">
      <ol className="relative space-y-3 ps-5">
        <span className="absolute inset-y-1 start-[7px] w-px bg-hairline" aria-hidden="true" />
        {[...versions].reverse().map((v) => (
          <VersionItem
            key={v.id}
            v={v}
            locale={locale}
            t={t}
            onCompare={() => setCompare(v.id)}
            comparing={compare === v.id}
          />
        ))}
      </ol>

      {compare && (
        <DiffView kind={kind} recipeId={recipeId} versionId={compare} onClear={() => setCompare(null)} />
      )}
    </div>
  )
}

function VersionItem({
  v,
  locale,
  t,
  onCompare,
  comparing,
}: {
  v: VersionRow
  locale: 'en' | 'ar'
  t: TFunc
  onCompare: () => void
  comparing: boolean
}) {
  const s = v.changes_from_previous
  const ingredients =
    s &&
    [
      s.ingredients_added && t('change.sum.added', { n: s.ingredients_added }),
      s.ingredients_changed && t('change.sum.changed', { n: s.ingredients_changed }),
      s.ingredients_removed && t('change.sum.removed', { n: s.ingredients_removed }),
    ].filter(Boolean)
  const steps =
    s &&
    [
      s.steps_added && t('change.sum.added', { n: s.steps_added }),
      s.steps_changed && t('change.sum.changed', { n: s.steps_changed }),
      s.steps_removed && t('change.sum.removed', { n: s.steps_removed }),
    ].filter(Boolean)

  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -start-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-surface',
          v.is_current ? 'bg-accent' : 'bg-hairline-strong',
        )}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-ink">v{v.version}</span>
            {v.revision && <span className="font-mono text-xs text-ink-subtle">{v.revision}</span>}
            {v.is_current && <Pill tone="accent">{t('version.current')}</Pill>}
            {v.is_viewed && !v.is_current && <Pill>{t('version.viewing')}</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {v.changed_by && (
              <span className="font-medium text-ink-muted">{t('change.madeBy', { name: v.changed_by })} · </span>
            )}
            {v.changed_at ? dateTime(v.changed_at, locale) : shortDate(v.created_at, locale)}
            {v.cost !== null && <span className="font-mono tnum"> · {kwd(v.cost)} KWD</span>}
          </p>
          {ingredients && ingredients.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {t('change.sum.ingredients')}: {ingredients.join(', ')}
            </p>
          )}
          {steps && steps.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {t('change.sum.method')}: {steps.join(', ')}
            </p>
          )}
        </div>
        {!v.is_current && (
          <button
            type="button"
            aria-pressed={comparing}
            onClick={onCompare}
            className={cn(
              'flex-none rounded-md px-2 py-1 text-2xs font-semibold uppercase tracking-wide',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
              comparing ? 'bg-accent text-white' : 'text-accent-ink hover:bg-accent-subtle',
            )}
          >
            {t('version.compare')}
          </button>
        )}
      </div>
    </li>
  )
}

function DiffView({
  kind,
  recipeId,
  versionId,
  onClear,
}: {
  kind: RecipeKind
  recipeId: string
  versionId: string
  onClear: () => void
}) {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useDiff(kind, recipeId, versionId)

  return (
    <div className="rounded-card border border-hairline bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[13px] font-semibold text-ink">
          {data ? `v${data.from.version} → v${data.to.version}` : t('version.title')}
        </h3>
        <IconButton label={t('action.close')} icon="close" size={15} className="-me-2" onClick={onClear} />
      </div>
      {isLoading && <LoadingRow />}
      {isError && <ErrorState onRetry={() => refetch()} />}
      {data &&
        (hasChangeDetail(data) ? (
          <ChangeDetail changes={data} />
        ) : (
          <p className="text-sm text-ink-subtle">{t('version.noChanges')}</p>
        ))}
    </div>
  )
}
