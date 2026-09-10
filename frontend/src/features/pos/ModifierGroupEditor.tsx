import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Combobox } from '@/components/Combobox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { Input, Select, Textarea } from '@/components/Input'
import { Pill } from '@/components/Pill'
import { useToast } from '@/components/Toast'
import { useDishRecipes, useInventoryItems, useReference } from '@/lib/queries'
import * as api from '@/lib/api'
import type { ModifierGroupWrite } from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { localId } from '@/lib/id'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type {
  DeductionStatus, InventoryItem, ModifierDeltaDirection, ModifierGroup, ModifierOption,
  ModifierOptionKind, ModifierSelection,
} from '@/types/api'

const KINDS: ModifierOptionKind[] = ['choice', 'type', 'addon', 'instruction']
const SELECTIONS: ModifierSelection[] = ['single', 'multi']

const STATUS_TONE: Record<DeductionStatus, 'success' | 'warning' | 'neutral'> = {
  ready: 'success', needs_data: 'warning', no_impact: 'neutral',
}

interface DraftDelta {
  key: string
  id?: string
  item_sku: string
  item_name_snapshot: string
  quantity: string
  unit: string
  direction: ModifierDeltaDirection
}

interface DraftOption {
  key: string
  id?: string
  name_en: string
  name_ar: string
  price_delta: string
  kind: ModifierOptionKind
  pos_mods_string: string
  variant_recipe: string
  no_consumption_impact: boolean
  deltas: DraftDelta[]
  deduction_status?: DeductionStatus
}

function blankDelta(direction: ModifierDeltaDirection = 'add'): DraftDelta {
  return { key: localId(), item_sku: '', item_name_snapshot: '', quantity: '', unit: '', direction }
}

function blank(): DraftOption {
  return {
    key: localId(), name_en: '', name_ar: '', price_delta: '0', kind: 'choice',
    pos_mods_string: '', variant_recipe: '', no_consumption_impact: false, deltas: [],
  }
}

function fromOption(o: ModifierOption): DraftOption {
  return {
    key: o.id ?? localId(), id: o.id,
    name_en: o.name_en, name_ar: o.name_ar, price_delta: o.price_delta, kind: o.kind,
    pos_mods_string: o.pos_mods_string, variant_recipe: o.variant_recipe ?? '',
    no_consumption_impact: o.no_consumption_impact,
    deduction_status: o.deduction_status,
    deltas: (o.deltas ?? []).map((d) => ({
      key: d.id ?? localId(), id: d.id, item_sku: d.item_sku,
      item_name_snapshot: d.item_name_snapshot, quantity: d.quantity,
      unit: d.unit ?? '', direction: d.direction,
    })),
  }
}

/** the option kinds whose consumption effect is expressed as +/- deltas */
const DELTA_KINDS: ModifierOptionKind[] = ['addon', 'instruction', 'choice', 'type']

export function ModifierGroupEditor({
  group,
  open,
  onClose,
}: {
  group: ModifierGroup | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: ref } = useReference()
  const { data: dishes } = useDishRecipes(open)
  const { data: items } = useInventoryItems()

  const [nameEn, setNameEn] = useState(group?.name_en ?? '')
  const [nameAr, setNameAr] = useState(group?.name_ar ?? '')
  const [selection, setSelection] = useState<ModifierSelection>(group?.selection ?? 'single')
  const [minSelect, setMinSelect] = useState(String(group?.min_select ?? (group ? 0 : 1)))
  const [maxSelect, setMaxSelect] = useState(group?.max_select == null ? '' : String(group.max_select))
  const [notes, setNotes] = useState(group?.notes ?? '')
  const [opts, setOpts] = useState<DraftOption[]>(group ? group.options.map(fromOption) : [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState(false)

  const dishOpts = useMemo(
    () => (dishes ?? []).slice().sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [dishes],
  )
  const units = ref?.units ?? []
  const itemList = items ?? []

  const save = useMutation({
    mutationFn: (body: ModifierGroupWrite) => api.saveModifierGroup(group?.id ?? null, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.modifierGroups })
      qc.invalidateQueries({ queryKey: qk.modifierReadiness })
      qc.invalidateQueries({ queryKey: qk.dishModifiers })
      toast.success(t('toast.modSaved'))
      onClose()
    },
    onError: (e) => {
      const p = parseApiError(e)
      setErrors(p.fields ?? {})
      toast.error(p.message || t('state.errorGeneric'))
    },
  })

  const del = useMutation({
    mutationFn: () => api.deleteModifierGroup(group!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.modifierGroups })
      qc.invalidateQueries({ queryKey: qk.modifierReadiness })
      qc.invalidateQueries({ queryKey: qk.dishModifiers })
      toast.success(t('toast.modDeleted'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message || t('state.errorGeneric')),
  })

  function patchOpt(i: number, p: Partial<DraftOption>) {
    setOpts((all) => all.map((o, j) => (j === i ? { ...o, ...p } : o)))
  }

  function submit() {
    const errs: Record<string, string> = {}
    if (!nameEn.trim()) errs.name_en = t('form.required')
    opts.forEach((o, i) => {
      if (!o.name_en.trim()) errs[`opt${i}`] = t('form.required')
      const usable = o.deltas.filter((d) => d.item_sku.trim() && d.quantity)
      if (o.kind === 'addon' && !o.no_consumption_impact && usable.length === 0)
        errs[`opt${i}`] = t('mods.opt.deltas.none')
    })
    setErrors(errs)
    if (Object.keys(errs).length) return

    save.mutate({
      name_en: nameEn.trim(),
      name_ar: nameAr.trim(),
      selection,
      min_select: Number(minSelect) || 0,
      max_select: maxSelect === '' ? null : Number(maxSelect),
      notes: notes.trim(),
      options: opts
        .filter((o) => o.name_en.trim())
        .map((o, i) => ({
          ...(o.id ? { id: o.id } : {}),
          name_en: o.name_en.trim(),
          name_ar: o.name_ar.trim(),
          price_delta: o.price_delta || '0',
          kind: o.kind,
          pos_mods_string: o.pos_mods_string.trim(),
          variant_recipe: o.kind === 'type' && o.variant_recipe ? o.variant_recipe : null,
          no_consumption_impact: o.no_consumption_impact,
          deltas: o.no_consumption_impact
            ? []
            : o.deltas
                .filter((d) => d.item_sku.trim() && d.quantity)
                .map((d, k) => ({
                  ...(d.id ? { id: d.id } : {}),
                  item_sku: d.item_sku.trim(),
                  item_name_snapshot: d.item_name_snapshot.trim(),
                  quantity: d.quantity,
                  unit: d.unit || null,
                  direction: d.direction,
                  sort_order: k,
                })),
          sort_order: i,
        })),
    })
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="lg"
        title={group ? t('mods.edit') : t('mods.new')}
        footer={
          <div className="flex items-center justify-between gap-2">
            {group ? (
              <Button variant="ghost" icon="trash" className="text-danger-ink" onClick={() => setConfirmDel(true)}>
                {t('action.delete')}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
              <Button variant="primary" icon="check" loading={save.isPending} onClick={submit}>
                {t('action.save')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('mods.field.name')} required error={errors.name_en}>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </Field>
            <Field label={`${t('mods.field.name')} · العربية`}>
              <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} />
            </Field>
            <Field label={t('mods.field.selection')}>
              <Select value={selection} onChange={(e) => setSelection(e.target.value as ModifierSelection)}>
                {SELECTIONS.map((s) => (
                  <option key={s} value={s}>{t(`mods.selection.${s}`)}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('mods.field.min')}>
                <Input type="number" min={0} value={minSelect} onChange={(e) => setMinSelect(e.target.value)} />
              </Field>
              <Field label={t('mods.field.max')} help={t('mods.field.maxNone')}>
                <Input type="number" min={0} value={maxSelect} placeholder="∞"
                  onChange={(e) => setMaxSelect(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="space-y-2 border-t border-hairline pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">{t('mods.options')}</p>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setOpts((o) => [...o, blank()])}>
                {t('mods.addOption')}
              </Button>
            </div>
            {opts.length === 0 ? (
              <p className="text-xs text-ink-subtle">{t('mods.options.none')}</p>
            ) : (
              <ul className="space-y-3">
                {opts.map((o, i) => (
                  <OptionRow
                    key={o.key}
                    o={o}
                    invalid={!!errors[`opt${i}`]}
                    invalidMsg={errors[`opt${i}`]}
                    dishes={dishOpts}
                    units={units}
                    items={itemList}
                    t={t}
                    onChange={(p) => patchOpt(i, p)}
                    onRemove={() => setOpts((all) => all.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
            )}
          </div>

          <Field label={t('mods.field.notes')}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Drawer>

      {group && (
        <ConfirmDialog
          open={confirmDel}
          title={t('mods.confirmDelete')}
          body={t('mods.confirmDelete.body', { n: group.dish_count })}
          confirmLabel={t('action.delete')}
          danger
          busy={del.isPending}
          onConfirm={() => del.mutate()}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  )
}

function OptionRow({
  o,
  invalid,
  invalidMsg,
  dishes,
  units,
  items,
  t,
  onChange,
  onRemove,
}: {
  o: DraftOption
  invalid: boolean
  invalidMsg?: string
  dishes: { id: string; name_en: string }[]
  units: { id: string; code: string; description: string }[]
  items: InventoryItem[]
  t: TFunc
  onChange: (p: Partial<DraftOption>) => void
  onRemove: () => void
}) {
  const showDeltas = !o.no_consumption_impact && DELTA_KINDS.includes(o.kind)
  const variantChosen = o.kind === 'type' && !!o.variant_recipe

  function patchDelta(k: number, p: Partial<DraftDelta>) {
    onChange({ deltas: o.deltas.map((d, j) => (j === k ? { ...d, ...p } : d)) })
  }

  return (
    <li className={cn('rounded-lg border bg-surface-sunken p-3', invalid ? 'border-danger' : 'border-hairline')}>
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="EN" value={o.name_en} onChange={(e) => onChange({ name_en: e.target.value })} />
          <Input placeholder="AR" dir="rtl" value={o.name_ar} onChange={(e) => onChange({ name_ar: e.target.value })} />
          <Input
            type="number"
            step="0.001"
            aria-label={t('mods.opt.price')}
            className="w-24 tnum"
            value={o.price_delta}
            onChange={(e) => onChange({ price_delta: e.target.value })}
          />
        </div>
        <IconButton
          label={t('action.delete')}
          icon="trash"
          tone="danger"
          size={15}
          className="flex-none"
          onClick={onRemove}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {o.deduction_status && (
          <Pill tone={STATUS_TONE[o.deduction_status]}>{t(`mods.status.${o.deduction_status}`)}</Pill>
        )}
        <label className="ms-auto inline-flex items-center gap-1.5 text-2xs text-ink-muted">
          <input
            type="checkbox"
            checked={o.no_consumption_impact}
            onChange={(e) => onChange({ no_consumption_impact: e.target.checked })}
          />
          {t('mods.opt.noImpact')}
        </label>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Select value={o.kind} onChange={(e) => onChange({ kind: e.target.value as ModifierOptionKind })} aria-label={t('mods.opt.kind')}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{t(`mods.kind.${k}`)}</option>
          ))}
        </Select>
        <Input
          placeholder={t('mods.opt.pos')}
          value={o.pos_mods_string}
          onChange={(e) => onChange({ pos_mods_string: e.target.value })}
        />
      </div>
      <p className="mt-1 text-2xs text-ink-subtle">{t('mods.opt.posHelp')}</p>

      {o.kind === 'type' && (
        <Select
          className="mt-2"
          value={o.variant_recipe}
          onChange={(e) => onChange({ variant_recipe: e.target.value })}
          aria-label={t('mods.opt.variant')}
        >
          <option value="">{t('mods.opt.variant')}…</option>
          {dishes.map((d) => (
            <option key={d.id} value={d.id}>{d.name_en}</option>
          ))}
        </Select>
      )}

      {showDeltas && !variantChosen && (
        <div className="mt-3 space-y-2 rounded-md border border-hairline bg-surface p-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t('mods.opt.deltas')}
            </span>
            <button
              type="button"
              onClick={() => onChange({ deltas: [...o.deltas, blankDelta(o.kind === 'instruction' ? 'remove' : 'add')] })}
              className="inline-flex items-center gap-1 text-2xs font-medium text-accent-ink hover:underline"
            >
              <Icon name="plus" size={12} /> {t('mods.opt.addDelta')}
            </button>
          </div>
          {o.deltas.length === 0 ? (
            <p className="text-2xs text-ink-subtle">{t('mods.opt.deltas.none')}</p>
          ) : (
            o.deltas.map((d, k) => (
              <div key={d.key} className="grid gap-1.5 sm:grid-cols-[6rem_2fr_4rem_3.5rem_auto] sm:items-center">
                <Select
                  className="h-9 text-2xs"
                  value={d.direction}
                  onChange={(e) => patchDelta(k, { direction: e.target.value as ModifierDeltaDirection })}
                  aria-label={t('mods.opt.deltas')}
                >
                  <option value="add">{t('mods.opt.deltas.add')}</option>
                  <option value="remove">{t('mods.opt.deltas.remove')}</option>
                </Select>
                <Combobox
                  value={d.item_sku}
                  items={items}
                  placeholder={t('mods.opt.sku')}
                  onSelect={(sku, item) =>
                    patchDelta(k, {
                      item_sku: sku,
                      item_name_snapshot: item && !d.item_name_snapshot ? item.name_en : d.item_name_snapshot,
                    })
                  }
                />
                <Input
                  type="number"
                  step="0.001"
                  className="h-9 tnum text-[13px]"
                  placeholder={t('mods.opt.qty')}
                  value={d.quantity}
                  onChange={(e) => patchDelta(k, { quantity: e.target.value })}
                />
                <Select
                  className="h-9 text-2xs"
                  value={d.unit}
                  onChange={(e) => patchDelta(k, { unit: e.target.value })}
                  aria-label="unit"
                >
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.code}</option>
                  ))}
                </Select>
                <IconButton
                  label={t('action.delete')}
                  icon="trash"
                  tone="danger"
                  size={13}
                  className="sm:h-9 sm:w-9"
                  onClick={() => onChange({ deltas: o.deltas.filter((_, j) => j !== k) })}
                />
              </div>
            ))
          )}
          <p className="text-2xs text-ink-subtle">{t('mods.opt.deltasHint')}</p>
        </div>
      )}
      {o.no_consumption_impact && (
        <p className="mt-2 text-2xs text-ink-subtle">{t('mods.opt.noImpactHint')}</p>
      )}
      {invalidMsg && <p className="mt-1 text-2xs text-danger-ink">{invalidMsg}</p>}
    </li>
  )
}
