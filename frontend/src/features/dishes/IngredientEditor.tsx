import { Combobox } from '@/components/Combobox'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { Input, Select } from '@/components/Input'
import { LineCostChip } from './CostPanel'
import { useI18n } from '@/i18n'
import type { CostLine, IngredientLine, InventoryItem, UnitScale } from '@/types/api'

export interface EditableIngredient {
  item_sku: string
  item_name_snapshot: string
  prep_note: string
  quantity: string
  unit: string
  // Production-recipe only (see IngredientEditor's `showAlternate` prop) — a
  // fallback SKU a prep kitchen's batch confirmation can fall back to when
  // item_sku is out of stock. Dish recipes never set or send this.
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
}: {
  ingredients: EditableIngredient[]
  units: UnitScale[]
  items: InventoryItem[]
  costLines?: CostLine[]
  errors?: Record<number, string>
  onChange: (index: number, key: keyof EditableIngredient, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
  /** Production recipes only — shows a fallback-ingredient picker per row,
   * used by a prep kitchen's batch confirmation when the primary is 86'd. */
  showAlternate?: boolean
}) {
  const { t } = useI18n()
  const showCosts = Array.isArray(costLines) && costLines.length > 0

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
                  if (item && !ing.item_name_snapshot) onChange(i, 'item_name_snapshot', item.name_en)
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
              {showCosts && <LineCostChip line={costLines?.[i]} />}
              <IconButton
                label={`${t('menus.line.remove')} ${i + 1}`}
                icon="close"
                tone="danger"
                size={15}
                className="h-8 w-8"
                onClick={() => onRemove(i)}
              />
            </div>
            {showAlternate && (
              <div className="col-span-2 md:col-span-full">
                <Combobox
                  value={ing.alt_item_sku ?? ''}
                  items={items}
                  placeholder={t('editor.ing.altItem')}
                  onSelect={(sku, item) => {
                    onChange(i, 'alt_item_sku', sku)
                    if (item && !ing.alt_item_name_snapshot) {
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
    </div>
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
              className="mt-0.5 h-8 w-8 flex-none"
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
