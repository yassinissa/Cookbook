/* One row of recipe change history: what kind of change (new version vs
 * adjustment), on which recipe, by whom, when — and the itemised detail
 * behind a disclosure. */
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '@/components/Icon'
import { Pill } from '@/components/Pill'
import { dateTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type { RecipeChangeEntry } from '@/types/api'
import { ChangeDetail, fieldLabel, hasChangeDetail } from './ChangeDetail'

function Badge({ e, t }: { e: RecipeChangeEntry; t: TFunc }) {
  const v = e.version ? ` · ${t('version.v', { n: e.version })}` : ''
  if (e.action === 'created') return <Pill tone="success">{t('change.badge.created')}{v}</Pill>
  if (e.is_new_version) return <Pill tone="accent">{t('change.badge.version')}{v}</Pill>
  if (e.action === 'updated') return <Pill>{t('change.badge.adjustment')}</Pill>
  return <Pill>{e.action_display}</Pill>
}

/** "Ingredients: 1 added, 2 changed · Method: 1 changed · Selling price, Notes" */
function summaryLine(e: RecipeChangeEntry, t: TFunc): string {
  const s = e.summary
  const parts: string[] = []
  const ing = [
    s.ingredients_added && t('change.sum.added', { n: s.ingredients_added }),
    s.ingredients_changed && t('change.sum.changed', { n: s.ingredients_changed }),
    s.ingredients_removed && t('change.sum.removed', { n: s.ingredients_removed }),
  ].filter(Boolean)
  if (ing.length) parts.push(`${t('change.sum.ingredients')}: ${ing.join(', ')}`)
  const steps = [
    s.steps_added && t('change.sum.added', { n: s.steps_added }),
    s.steps_changed && t('change.sum.changed', { n: s.steps_changed }),
    s.steps_removed && t('change.sum.removed', { n: s.steps_removed }),
  ].filter(Boolean)
  if (steps.length) parts.push(`${t('change.sum.method')}: ${steps.join(', ')}`)
  // on a creation every field is "new" — the list would be noise
  if (e.action !== 'created' && s.fields_changed.length) {
    const shown = s.fields_changed.slice(0, 3).map((f) => fieldLabel(f, t))
    const more = s.fields_changed.length - shown.length
    parts.push(shown.join(', ') + (more > 0 ? ` ${t('change.sum.more', { n: more })}` : ''))
  }
  return parts.join(' · ')
}

export function ChangeEntry({
  e,
  showRecipe = true,
  defaultOpen = false,
}: {
  e: RecipeChangeEntry
  /** false inside a single recipe's history, where the name is redundant */
  showRecipe?: boolean
  defaultOpen?: boolean
}) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const detail = hasChangeDetail(e.changes) ? e.changes : null
  const who = e.changed_by_name || e.changed_by || t('change.system')
  const summary = summaryLine(e, t) || e.description

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-2xs font-semibold uppercase',
            e.is_new_version ? 'bg-accent-subtle text-accent-ink' : 'bg-surface-sunken text-ink-muted',
          )}
        >
          {who.slice(0, 1)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge e={e} t={t} />
            {showRecipe && (
              <>
                <Link to={e.recipe_path} className="text-sm font-semibold text-ink hover:text-accent-ink hover:underline">
                  {locale === 'ar' && e.recipe_name_ar ? e.recipe_name_ar : e.recipe_name}
                </Link>
                {e.recipe_code && <span className="font-mono text-2xs text-ink-subtle">#{e.recipe_code}</span>}
              </>
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
            <span className="font-medium text-ink-muted">{who}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()}>
              {dateTime(e.created_at, locale)} ({relativeTime(e.created_at, locale)})
            </time>
            {showRecipe && e.scope_name && (
              <>
                <span aria-hidden="true">·</span>
                <span>{e.scope_name}</span>
              </>
            )}
          </p>

          {summary && <p className="mt-1 text-[13px] text-ink-muted">{summary}</p>}
        </div>

        {detail && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'flex h-8 flex-none items-center gap-1 rounded-md px-2 text-2xs font-semibold uppercase tracking-wide',
              'text-accent-ink transition-colors duration-150 hover:bg-accent-subtle',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
            )}
          >
            <span className="hidden sm:inline">{open ? t('change.hide') : t('change.show')}</span>
            <span className="sr-only sm:hidden">{open ? t('change.hide') : t('change.show')}</span>
            <Icon name="chevronDown" size={14} className={cn('transition-transform duration-150', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {detail && open && (
        <div id={panelId} className="mt-3 sm:ps-10">
          {e.changes_reconstructed && (
            <p className="mb-2 text-xs text-ink-subtle">{t('change.reconstructed')}</p>
          )}
          <ChangeDetail changes={detail} />
        </div>
      )}
    </li>
  )
}
