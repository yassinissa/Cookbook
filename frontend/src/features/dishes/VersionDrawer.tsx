import { useState } from 'react'

import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { Pill } from '@/components/Pill'
import { ErrorState, LoadingRow } from '@/components/States'
import { useDishDiff, useDishVersions } from '@/lib/queries'
import { kwd, shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type { VersionDiff, VersionRow } from '@/types/api'

export function VersionDrawer({
  dishId,
  open,
  onClose,
}: {
  dishId: string
  open: boolean
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const { data: versions, isLoading, isError, refetch } = useDishVersions(dishId, open)
  const [compare, setCompare] = useState<string | null>(null)

  return (
    <Drawer open={open} onClose={onClose} title={t('version.title')} width="lg">
      {isLoading && <LoadingRow />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {versions && versions.length <= 1 && (
        <p className="rounded-lg bg-surface-sunken p-4 text-sm text-ink-subtle">
          {t('version.single')}
        </p>
      )}

      {versions && versions.length > 1 && (
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

          {compare && <DiffView dishId={dishId} versionId={compare} onClear={() => setCompare(null)} />}
        </div>
      )}
    </Drawer>
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
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink">v{v.version}</span>
            {v.is_current && <Pill tone="accent">{t('version.current')}</Pill>}
            {v.is_viewed && !v.is_current && <Pill>{t('version.viewing')}</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {shortDate(v.updated_at, locale)} · {kwd(v.cost)} KWD
          </p>
          {s && (
            <p className="mt-1 text-xs text-ink-muted">
              {[
                s.fields_changed.length && `${s.fields_changed.length} fields`,
                s.ingredients_added && `+${s.ingredients_added} ing`,
                s.ingredients_removed && `−${s.ingredients_removed} ing`,
                s.ingredients_changed && `${s.ingredients_changed} ing changed`,
                s.steps_added && `+${s.steps_added} step`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {!v.is_current && (
          <button
            type="button"
            onClick={onCompare}
            className={cn(
              'flex-none rounded-md px-2 py-1 text-2xs font-semibold uppercase tracking-wide',
              comparing
                ? 'bg-accent text-white'
                : 'text-accent-ink hover:bg-accent-subtle',
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
  dishId,
  versionId,
  onClear,
}: {
  dishId: string
  versionId: string
  onClear: () => void
}) {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useDishDiff(dishId, versionId, undefined, true)

  return (
    <div className="rounded-card border border-hairline bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink">
          {data ? `v${data.from.version} → v${data.to.version}` : t('version.title')}
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-ink-subtle hover:text-ink"
          aria-label={t('action.close')}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      {isLoading && <LoadingRow />}
      {isError && <ErrorState onRetry={() => refetch()} />}
      {data && <DiffBody diff={data} t={t} />}
    </div>
  )
}

function DiffBody({ diff, t }: { diff: VersionDiff; t: TFunc }) {
  const empty =
    diff.fields.length === 0 &&
    diff.ingredients.added.length === 0 &&
    diff.ingredients.removed.length === 0 &&
    diff.ingredients.changed.length === 0 &&
    diff.steps.added.length === 0 &&
    diff.steps.removed.length === 0

  if (empty) return <p className="text-sm text-ink-subtle">{t('version.noChanges')}</p>

  return (
    <div className="space-y-4 text-[13px]">
      {diff.fields.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('version.fields')}
          </h4>
          <ul className="space-y-1">
            {diff.fields.map((f) => (
              <li key={f.field} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{f.field.replace(/_/g, ' ')}</span>
                <span className="text-danger-ink line-through">{f.from ?? '—'}</span>
                <Icon name="arrowRight" size={12} className="text-ink-subtle rtl:rotate-180" />
                <span className="text-success-ink">{f.to ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(diff.ingredients.added.length > 0 ||
        diff.ingredients.removed.length > 0 ||
        diff.ingredients.changed.length > 0) && (
        <div>
          <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('version.ingredients')}
          </h4>
          <ul className="space-y-1">
            {diff.ingredients.added.map((i) => (
              <li key={`a${i.item_sku}`} className="text-success-ink">
                + {i.item_name_snapshot} — {i.quantity} {i.unit}
              </li>
            ))}
            {diff.ingredients.removed.map((i) => (
              <li key={`r${i.item_sku}`} className="text-danger-ink">
                − {i.item_name_snapshot} — {i.quantity} {i.unit}
              </li>
            ))}
            {diff.ingredients.changed.map((c) => (
              <li key={`c${c.label}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{c.to.item_name_snapshot}</span>
                <span className="text-danger-ink line-through">
                  {c.from.quantity} {c.from.unit} {c.from.prep_note}
                </span>
                <Icon name="arrowRight" size={12} className="text-ink-subtle rtl:rotate-180" />
                <span className="text-success-ink">
                  {c.to.quantity} {c.to.unit} {c.to.prep_note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(diff.steps.added.length > 0 || diff.steps.removed.length > 0) && (
        <div>
          <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('version.steps')} ({diff.steps.count_from} → {diff.steps.count_to})
          </h4>
          <ul className="space-y-1">
            {diff.steps.added.map((s, i) => (
              <li key={`sa${i}`} className="text-success-ink">
                + {s}
              </li>
            ))}
            {diff.steps.removed.map((s, i) => (
              <li key={`sr${i}`} className="text-danger-ink line-through">
                − {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
