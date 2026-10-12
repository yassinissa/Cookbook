/* The itemised before → after of one recipe change (or one version step):
 * ingredient lines, method steps, allergens, then every other field. Shared
 * by the Recipe Changes feed, the per-recipe history and the version compare. */
import type { ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { kwd } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import { en, type MessageKey } from '@/i18n/messages'
import type { IngredientSummary, RecipeChangeSet } from '@/types/api'

type Kind = 'added' | 'removed' | 'changed'

const MARK: Record<Kind, { sign: string; cls: string; key: MessageKey }> = {
  added: { sign: '+', cls: 'bg-success-subtle text-success-ink', key: 'version.added' },
  removed: { sign: '−', cls: 'bg-danger-subtle text-danger-ink', key: 'version.removed' },
  changed: { sign: '~', cls: 'bg-warning-subtle text-warning-ink', key: 'version.changed' },
}

const MONEY = new Set(['selling_price', 'cost', 'labor_cost'])

function humanize(name: string) {
  const s = name.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Selling price" / "QA standard · Portion weight" */
export function fieldLabel(field: string, t: TFunc): string {
  const [head, ...rest] = field.split('.')
  if (rest.length) {
    const prefixKey = `change.field.${head}`
    const prefix = prefixKey in en ? t(prefixKey as MessageKey) : humanize(head)
    return `${prefix} · ${humanize(rest.join('.'))}`
  }
  const key = `change.field.${field}`
  return key in en ? t(key as MessageKey) : humanize(field)
}

function fieldValue(field: string, value: string | null): string | null {
  if (value === null || value === '') return null
  if (MONEY.has(field)) return `${kwd(value)} KWD`
  if (field === 'expected_waste_pct') return `${Number(value)}%`
  if (field === 'prep_time_minutes') return `${value} min`
  return value
}

function qty(line: IngredientSummary) {
  const n = Number(line.quantity)
  const q = Number.isNaN(n) ? line.quantity : n.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return `${q}${line.unit ? ` ${line.unit}` : ''}`
}

function lineValue(line: IngredientSummary, attr: string): string | null {
  if (attr === 'quantity' || attr === 'unit') return qty(line)
  if (attr === 'alt_item_sku')
    return line.alt_item_sku ? line.alt_item_name_snapshot || line.alt_item_sku : null
  return (line[attr as keyof IngredientSummary] as string) || null
}

function FromTo({ from, to, mono }: { from: string | null; to: string | null; mono?: boolean }) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', mono && 'font-mono tnum')}>
      <span className={cn('text-ink-subtle', from !== null && 'line-through')}>{from ?? '—'}</span>
      <Icon name="arrowRight" size={12} className="flex-none self-center text-ink-subtle rtl:rotate-180" />
      <span className="font-medium text-ink">{to ?? '—'}</span>
    </span>
  )
}

function Mark({ kind }: { kind: Kind }) {
  const { t } = useI18n()
  const m = MARK[kind]
  return (
    <span
      className={cn(
        'mt-px inline-flex w-[5.25rem] flex-none items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold',
        m.cls,
      )}
    >
      <span aria-hidden="true" className="font-mono">{m.sign}</span>
      {t(m.key)}
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h4>
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface">
        {children}
      </ul>
    </section>
  )
}

function Row({ kind, children }: { kind: Kind; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
      <Mark kind={kind} />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}

function IngredientName({ line, struck }: { line: IngredientSummary; struck?: boolean }) {
  return (
    <span className={cn('font-medium text-ink', struck && 'text-ink-muted line-through')}>
      {line.item_name_snapshot || line.item_sku}
      {line.prep_note && <span className="font-normal text-ink-muted"> · {line.prep_note}</span>}
      <span className="ms-1.5 font-mono text-2xs font-normal text-ink-subtle no-underline">{line.item_sku}</span>
    </span>
  )
}

/** Does this change set carry anything to itemise? */
export function hasChangeDetail(c: RecipeChangeSet | null | undefined): c is RecipeChangeSet {
  if (!c) return false
  const i = c.ingredients
  const s = c.steps
  return !!(
    c.fields?.length ||
    i?.added.length || i?.removed.length || i?.changed.length || i?.reordered ||
    s?.added.length || s?.removed.length || s?.changed?.length ||
    c.allergens?.added.length || c.allergens?.removed.length
  )
}

export function ChangeDetail({ changes }: { changes: RecipeChangeSet }) {
  const { t } = useI18n()
  const ing = changes.ingredients
  const steps = changes.steps
  const alg = changes.allergens
  const hasIng = !!ing && (ing.added.length > 0 || ing.removed.length > 0 || ing.changed.length > 0 || !!ing.reordered)
  const hasSteps = !!steps && (steps.added.length > 0 || steps.removed.length > 0 || (steps.changed?.length ?? 0) > 0)
  const hasAlg = !!alg && (alg.added.length > 0 || alg.removed.length > 0)

  return (
    <div className="space-y-4">
      {hasIng && ing && (
        <Section title={t('version.ingredients')}>
          {ing.added.map((l, i) => (
            <Row key={`a${l.item_sku}${i}`} kind="added">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <IngredientName line={l} />
                <span className="font-mono tnum font-medium text-ink">{qty(l)}</span>
              </div>
            </Row>
          ))}
          {ing.removed.map((l, i) => (
            <Row key={`r${l.item_sku}${i}`} kind="removed">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <IngredientName line={l} struck />
                <span className="font-mono tnum text-ink-subtle line-through">{qty(l)}</span>
              </div>
            </Row>
          ))}
          {ing.changed.map((c, i) => {
            // quantity + unit read as one figure ("75 g → 90 g")
            const attrs = (c.changed ?? ['quantity', 'prep_note']).filter(
              (a, _i, all) => !(a === 'unit' && all.includes('quantity')),
            )
            return (
              <Row key={`c${c.label}${i}`} kind="changed">
                <IngredientName line={c.to} />
                <dl className="mt-1 space-y-0.5">
                  {attrs.map((a) => (
                    <div key={a} className="flex flex-wrap items-baseline gap-x-2">
                      <dt className="w-24 flex-none text-xs text-ink-subtle">
                        {t(`change.line.${a === 'unit' ? 'quantity' : a}` as MessageKey)}
                      </dt>
                      <dd>
                        <FromTo
                          from={lineValue(c.from, a)}
                          to={lineValue(c.to, a)}
                          mono={a === 'quantity' || a === 'unit'}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </Row>
            )
          })}
          {ing.reordered && (
            <Row kind="changed">
              <span className="text-ink-muted">{t('change.reordered')}</span>
            </Row>
          )}
        </Section>
      )}

      {hasSteps && steps && (
        <Section title={`${t('version.steps')} (${steps.count_from} → ${steps.count_to})`}>
          {(steps.changed ?? []).map((s) => (
            <Row key={`sc${s.n}`} kind="changed">
              <p className="text-xs font-semibold text-ink-subtle">{t('change.step', { n: s.n })}</p>
              <p className="text-ink-subtle line-through">{s.from}</p>
              <p className="text-ink">{s.to}</p>
            </Row>
          ))}
          {steps.added.map((s, i) => (
            <Row key={`sa${i}`} kind="added">
              <p className="text-ink">{s}</p>
            </Row>
          ))}
          {steps.removed.map((s, i) => (
            <Row key={`sr${i}`} kind="removed">
              <p className="text-ink-muted line-through">{s}</p>
            </Row>
          ))}
        </Section>
      )}

      {hasAlg && alg && (
        <Section title={t('change.allergens')}>
          {alg.added.map((a) => (
            <Row key={`aa${a}`} kind="added">
              <span className="font-medium text-ink">{a}</span>
            </Row>
          ))}
          {alg.removed.map((a) => (
            <Row key={`ar${a}`} kind="removed">
              <span className="text-ink-muted line-through">{a}</span>
            </Row>
          ))}
        </Section>
      )}

      {changes.fields?.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {t('change.details')}
          </h4>
          <dl className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface">
            {changes.fields.map((f) => (
              <div key={f.field} className="flex flex-col gap-0.5 px-3 py-2 text-[13px] sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="flex-none text-ink-muted sm:w-44">{fieldLabel(f.field, t)}</dt>
                <dd className="min-w-0 break-words">
                  {f.field === 'image' ? (
                    <span className="font-medium text-ink">
                      {t(f.from && f.to ? 'change.photo.replaced' : f.to ? 'change.photo.added' : 'change.photo.removed')}
                    </span>
                  ) : (
                    <FromTo
                      from={fieldValue(f.field, f.from)}
                      to={fieldValue(f.field, f.to)}
                      mono={MONEY.has(f.field)}
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
