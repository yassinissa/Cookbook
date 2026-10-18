import { useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Combobox } from '@/components/Combobox'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { Input, Select } from '@/components/Input'
import { LineCostChip } from './CostPanel'
import { useI18n } from '@/i18n'
import { USE_SEED } from '@/lib/http'
import { kwd } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useCostPreview } from '@/lib/queries'
import type { CostLine, CostPreviewLine, IngredientLine, InventoryItem, UnitScale } from '@/types/api'

export interface EditableIngredient {
  item_sku: string
  item_name_snapshot: string
  prep_note: string
  quantity: string
  unit: string
  // A fallback SKU the stock-deduction pipeline falls back to when item_sku
  // is out of stock — a POS sale for dish recipes, a batch confirmation for
  // production recipes. See IngredientEditor's `showAlternate` prop.
  alt_item_sku?: string
  alt_item_name_snapshot?: string
}

export function toEditable(i: IngredientLine): EditableIngredient {
  return {
    item_sku: i.item_sku,
    item_name_snapshot: i.item_name_snapshot,
    prep_note: i.prep_note,
    quantity: String(i.quantity ?? ''),
    unit: i.unit ? String(i.unit) : '',
    alt_item_sku: i.alt_item_sku ?? '',
    alt_item_name_snapshot: i.alt_item_name_snapshot ?? '',
  }
}

export const EMPTY_INGREDIENT: EditableIngredient = {
  item_sku: '',
  item_name_snapshot: '',
  prep_note: '',
  quantity: '',
  unit: '',
  alt_item_sku: '',
  alt_item_name_snapshot: '',
}

export function IngredientEditor({
  ingredients,
  units,
  items,
  costLines,
  errors,
  onChange,
  onAdd,
  onRemove,
  showAlternate,
  wastePct,
}: {
  ingredients: EditableIngredient[]
  units: UnitScale[]
  items: InventoryItem[]
  costLines?: CostLine[]
  errors?: Record<number, string>
  onChange: (index: number, key: keyof EditableIngredient, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
  /** Shows a fallback-ingredient picker per row — used automatically when
   * the primary is 86'd (a POS sale for dish recipes, a batch confirmation
   * for production recipes). */
  showAlternate?: boolean
  /** Expected waste %, so the live total matches what a save will store. */
  wastePct?: string
}) {
  const { t } = useI18n()
  const { can } = useAuth()
  // Live cost of the rows as typed (server-side maths, nothing saved). The
  // saved breakdown in `costLines` is only the fallback — it goes stale the
  // moment a row changes and doesn't cover rows added since the last save.
  const liveEnabled = !USE_SEED && can('costing.view')
  const { query: live, pending } = useCostPreview(
    {
      lines: ingredients.map((r) => ({
        item_sku: r.item_sku,
        quantity: r.quantity.trim() === '' ? null : r.quantity,
        unit: r.unit,
      })),
      expected_waste_pct: wastePct || '0',
    },
    liveEnabled,
  )
  const liveLines = liveEnabled ? live.data?.lines : undefined
  const showCosts = !!liveLines || (Array.isArray(costLines) && costLines.length > 0)
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set())
  const toggleRow = (i: number) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div>
      {ingredients.length === 0 && (
        <p className="mb-3 text-sm text-ink-subtle">{t('editor.ing.none')}</p>
      )}

      {ingredients.length > 0 && (
        <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_5rem_4rem_auto] gap-2 px-1 pb-1 text-2xs uppercase tracking-wide text-ink-subtle md:grid">
          <span>{t('editor.ing.item')}</span>
          <span>{t('editor.ing.display')}</span>
          <span>{t('editor.ing.prep')}</span>
          <span className="text-end">{t('editor.ing.qty')}</span>
          <span>{t('editor.ing.unit')}</span>
          <span className="text-end">{showCosts ? t('editor.ing.cost') : ''}</span>
        </div>
      )}

      <div className="space-y-3 md:space-y-2">
        {ingredients.map((ing, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 rounded-lg border border-hairline p-2 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_5rem_4rem_auto] md:items-center md:border-0 md:p-0"
          >
            <div className="col-span-2 md:col-span-1">
              <Combobox
                value={ing.item_sku}
                items={items}
                invalid={!!errors?.[i]}
                placeholder={t('editor.ing.item')}
                onSelect={(sku, item) => {
                  onChange(i, 'item_sku', sku)
                  // Re-sync the display name whenever the underlying item actually
                  // changes — otherwise swapping to a different ingredient on an
                  // already-filled row leaves the old item's name snapshotted
                  // against the new SKU (shows up as a wrong version-diff label).
                  if (item && sku !== ing.item_sku) onChange(i, 'item_name_snapshot', item.name_en)
                }}
              />
            </div>
            <Input
              className="h-9 text-[13px]"
              placeholder={t('editor.ing.display')}
              value={ing.item_name_snapshot}
              onChange={(e) => onChange(i, 'item_name_snapshot', e.target.value)}
            />
            <Input
              className="h-9 text-[13px]"
              placeholder={t('editor.ing.prep')}
              value={ing.prep_note}
              onChange={(e) => onChange(i, 'prep_note', e.target.value)}
            />
            <Input
              type="number"
              step="0.001"
              className="h-9 text-[13px]"
              placeholder={t('editor.ing.qty')}
              value={ing.quantity}
              onChange={(e) => onChange(i, 'quantity', e.target.value)}
            />
            <Select
              className="h-9 text-[13px]"
              value={ing.unit}
              onChange={(e) => onChange(i, 'unit', e.target.value)}
              aria-label={t('editor.ing.unit')}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </Select>
            <div className="col-span-2 flex items-center justify-between gap-1 md:col-span-1 md:justify-end">
              {showCosts &&
                (liveLines?.[i] ? (
                  <button
                    type="button"
                    onClick={() => toggleRow(i)}
                    aria-expanded={openRows.has(i)}
                    aria-label={`${t('cost.live.showWorking')} — ${i + 1}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors duration-150 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                      pending && 'opacity-50',
                    )}
                  >
                    <LineCostChip line={liveLines[i]} />
                    <Icon name="info" size={12} className="text-ink-subtle" />
                  </button>
                ) : (
                  <LineCostChip line={liveLines ? undefined : costLines?.[i]} />
                ))}
              <IconButton
                label={`${t('menus.line.remove')} ${i + 1}`}
                icon="close"
                tone="danger"
                size={15}
                // full 44px target on the stacked mobile card; matched to the
                // row's h-9 inputs on the desktop grid row.
                className="md:h-9 md:w-9"
                onClick={() => onRemove(i)}
              />
            </div>
            {liveLines?.[i] && openRows.has(i) && (
              <LineWorking line={liveLines[i]} className="col-span-2 md:col-span-full" />
            )}
            {showAlternate && (
              <div className="col-span-2 md:col-span-full">
                <Combobox
                  value={ing.alt_item_sku ?? ''}
                  items={items}
                  placeholder={t('editor.ing.altItem')}
                  onSelect={(sku, item) => {
                    onChange(i, 'alt_item_sku', sku)
                    if (item && sku !== ing.alt_item_sku) {
                      onChange(i, 'alt_item_name_snapshot', item.name_en)
                    }
                  }}
                />
                <p className="mt-1 text-2xs text-ink-subtle">{t('editor.ing.altItemHint')}</p>
              </div>
            )}
            {errors?.[i] && (
              <p className="col-span-2 text-xs text-danger-ink md:col-span-full">{errors[i]}</p>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <Icon name="plus" size={14} />
        {t('action.addIngredient')}
      </button>

      {liveEnabled && ingredients.length > 0 && (live.data || live.isError) && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface-sunken px-3 py-2.5" aria-live="polite">
          {live.isError && !pending ? (
            <p className="flex items-start gap-1.5 text-xs text-warning-ink">
              <Icon name="warning" size={13} className="mt-px flex-none" />
              {t('cost.live.failed')}
            </p>
          ) : live.data ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-2xs uppercase tracking-wide text-ink-subtle">
                  {pending ? t('cost.live.updating') : t('cost.live.title')}
                </span>
                <dl className={cn('flex flex-wrap items-baseline gap-x-4 text-xs', pending && 'opacity-50')}>
                  <LiveFigure label={t('cost.live.items')} value={live.data.items} />
                  <LiveFigure label={t('cost.live.waste')} value={live.data.waste} />
                  <LiveFigure label={t('cost.live.perServing')} value={live.data.per_serving} strong />
                </dl>
              </div>
              <p className="mt-1 text-2xs text-ink-subtle">{t('cost.live.labourNote')}</p>
              {!live.data.inventory_reachable && (
                <p className="mt-1.5 text-2xs text-warning-ink">{t('cost.live.inventoryDown')}</p>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function LiveFigure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className={cn('tnum font-mono', strong ? 'text-sm font-semibold text-accent-ink' : 'text-ink')}>
        {kwd(value)}
        <span className="ms-1 text-[10px] font-normal text-ink-subtle">KWD</span>
      </dd>
    </div>
  )
}

/** Plain numbers for the working ("1 Tbs = 0.015 Kg") — no grouping, no trailing zeros. */
function num(v: string | null | undefined, max = 6) {
  const n = Number(v)
  if (v == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: max, useGrouping: false })
}

/** How one line's cost was reached — price, conversion, the sum, and what
 * inventory-platform will deduct per serving (or why publishing refuses it). */
function LineWorking({ line, className }: { line: CostPreviewLine; className?: string }) {
  const { t } = useI18n()
  const p = line.price
  const rows: { k: string; v: ReactNode; warn?: boolean }[] = []
  if (p) {
    rows.push({
      k: t('cost.work.price'),
      v: (
        <>
          <span className="tnum font-mono">{num(p.per_unit)} KWD</span> / {p.unit}
          <span className="text-ink-subtle"> · {t(`cost.work.priceSource.${p.source}`)}</span>
        </>
      ),
    })
  }
  if (line.status === 'ok' && p) {
    const conv = line.conversion
    rows.push({
      k: t('cost.work.conversion'),
      v: conv ? (
        <>
          <span className="tnum font-mono">{conv.text}</span>
          <span className={conv.source === 'standard' ? 'text-warning-ink' : 'text-ink-subtle'}>
            {' · '}
            {conv.source === 'item' ? t('cost.work.convItem') : t('cost.work.convStandard')}
          </span>
        </>
      ) : (
        <span className="text-ink-subtle">{t('cost.work.sameUnit')}</span>
      ),
    })
    rows.push({
      k: t('cost.work.calc'),
      v: (
        <span className="tnum font-mono">
          {num(line.quantity)} {line.unit}
          {conv && ` = ${num(line.base_qty)} ${p.unit}`} × {num(p.per_unit)} ={' '}
          <span className="font-semibold">{num(line.amount, 4)} KWD</span>
        </span>
      ),
    })
  } else {
    rows.push({ k: t('cost.work.calc'), v: line.detail || line.status.replace(/_/g, ' '), warn: true })
  }
  if (line.stock?.qty) {
    rows.push({
      k: t('cost.work.stock'),
      v: (
        <>
          <span className="tnum font-mono">
            {num(line.stock.qty)} {line.stock.unit.toUpperCase()}
          </span>
          <span className="text-ink-subtle"> {t('cost.work.stockPerServing')}</span>
        </>
      ),
    })
  } else if (line.stock?.problem) {
    rows.push({ k: t('cost.work.stock'), v: `${t('cost.work.publishBlocked')} ${line.stock.problem}`, warn: true })
  }
  return (
    <dl
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-hairline bg-surface-sunken px-3 py-2 text-xs',
        className,
      )}
    >
      {rows.map((r) => (
        <div key={r.k} className="contents">
          <dt className="text-ink-subtle">{r.k}</dt>
          <dd className={cn('min-w-0 break-words', r.warn ? 'text-warning-ink' : 'text-ink')}>{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function StepEditor({
  steps,
  onChange,
  onAdd,
  onRemove,
}: {
  steps: { step_number: number; instruction: string }[]
  onChange: (index: number, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const { t } = useI18n()
  return (
    <div>
      {steps.length === 0 && <p className="mb-3 text-sm text-ink-subtle">{t('editor.step.none')}</p>}
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="tnum mt-2 w-5 flex-none text-sm text-ink-subtle">{s.step_number}</span>
            <textarea
              rows={1}
              className="min-h-[38px] w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
              value={s.instruction}
              onChange={(e) => onChange(i, e.target.value)}
            />
            <IconButton
              label={`${t('menus.line.remove')} ${s.step_number}`}
              icon="close"
              tone="danger"
              size={15}
              className="mt-0.5 flex-none"
              onClick={() => onRemove(i)}
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <Icon name="plus" size={14} />
        {t('action.addStep')}
      </button>
    </div>
  )
}
