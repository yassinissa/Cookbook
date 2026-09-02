import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Input, Select, Textarea } from '@/components/Input'
import { useToast } from '@/components/Toast'
import { useDishRecipes, useReference } from '@/lib/queries'
import * as api from '@/lib/api'
import type { ModifierGroupWrite } from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type { ModifierGroup, ModifierOption, ModifierOptionKind, ModifierSelection } from '@/types/api'

const KINDS: ModifierOptionKind[] = ['choice', 'type', 'addon', 'instruction']
const SELECTIONS: ModifierSelection[] = ['single', 'multi']

interface DraftOption {
  key: string
  id?: string
  name_en: string
  name_ar: string
  price_delta: string
  kind: ModifierOptionKind
  pos_mods_string: string
  variant_recipe: string
  item_sku: string
  quantity: string
  unit: string
}

function blank(): DraftOption {
  return {
    key: crypto.randomUUID(), name_en: '', name_ar: '', price_delta: '0', kind: 'choice',
    pos_mods_string: '', variant_recipe: '', item_sku: '', quantity: '', unit: '',
  }
}

function fromOption(o: ModifierOption): DraftOption {
  return {
    key: o.id ?? crypto.randomUUID(), id: o.id,
    name_en: o.name_en, name_ar: o.name_ar, price_delta: o.price_delta, kind: o.kind,
    pos_mods_string: o.pos_mods_string, variant_recipe: o.variant_recipe ?? '',
    item_sku: o.item_sku, quantity: o.quantity ?? '', unit: o.unit ?? '',
  }
}

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

  const save = useMutation({
    mutationFn: (body: ModifierGroupWrite) => api.saveModifierGroup(group?.id ?? null, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.modifierGroups })
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
      if (o.kind === 'addon' && !o.item_sku.trim()) errs[`opt${i}`] = t('mods.opt.sku')
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
          item_sku: o.kind === 'addon' ? o.item_sku.trim() : '',
          quantity: o.kind === 'addon' && o.quantity ? o.quantity : null,
          unit: o.kind === 'addon' && o.unit ? o.unit : null,
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
                    dishes={dishOpts}
                    units={units}
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
  dishes,
  units,
  t,
  onChange,
  onRemove,
}: {
  o: DraftOption
  invalid: boolean
  dishes: { id: string; name_en: string }[]
  units: { id: string; code: string; description: string }[]
  t: TFunc
  onChange: (p: Partial<DraftOption>) => void
  onRemove: () => void
}) {
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
            className="w-24"
            value={o.price_delta}
            onChange={(e) => onChange({ price_delta: e.target.value })}
          />
        </div>
        <button type="button" onClick={onRemove} aria-label={t('action.delete')} className="mt-1 text-ink-subtle hover:text-danger-ink">
          <Icon name="trash" size={15} />
        </button>
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
      {o.kind === 'addon' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Input placeholder={t('mods.opt.sku')} value={o.item_sku} onChange={(e) => onChange({ item_sku: e.target.value })} />
          <Input type="number" step="0.001" placeholder={t('mods.opt.qty')} value={o.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
          <Select value={o.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label="unit">
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.code}</option>
            ))}
          </Select>
        </div>
      )}
    </li>
  )
}
