import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Input, Select, Textarea } from '@/components/Input'
import { Pill } from '@/components/Pill'
import { useToast } from '@/components/Toast'
import { useI18n, type TFunc } from '@/i18n'
import { cn } from '@/lib/cn'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import {
  useItemConversion,
  useItemNutrition,
  useItemStorage,
  useReference,
} from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import {
  NUTRIENT_KEYS,
  type ItemConversion,
  type ItemConversionLine,
  type ItemNutrition,
  type ItemStorage,
  type NutrientKey,
  type StorageBand,
} from '@/types/api'

/* nutrient key -> [EN label, AR label, unit] */
const NUTRIENTS: Record<NutrientKey, [string, string, string]> = {
  calories: ['Calories', 'السعرات', 'kcal'],
  fat_g: ['Fat', 'الدهون', 'g'],
  saturated_fat_g: ['Saturated fat', 'الدهون المشبعة', 'g'],
  trans_fat_g: ['Trans fat', 'الدهون المتحولة', 'g'],
  cholesterol_mg: ['Cholesterol', 'الكوليسترول', 'mg'],
  sodium_mg: ['Sodium', 'الصوديوم', 'mg'],
  carbs_g: ['Carbohydrate', 'الكربوهيدرات', 'g'],
  fibers_g: ['Fibre', 'الألياف', 'g'],
  sugars_g: ['Sugars', 'السكريات', 'g'],
  added_sugars_g: ['Added sugars', 'السكر المضاف', 'g'],
  protein_g: ['Protein', 'البروتين', 'g'],
}

/** trim "12.500" -> "12.5", "0.000" -> "0" for display / editing */
function tidy(v: string | number | undefined | null): string {
  if (v === undefined || v === null || v === '') return '0'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '0'
}

function SectionShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-card border border-hairline">
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-subtle">{subtitle}</p>
        </div>
        {action && <div className="flex-none">{action}</div>}
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  )
}

/* ── Nutrition facts ─────────────────────────────────────────────────── */
export function ItemNutritionSection({ sku }: { sku: string }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useItemNutrition(sku)
  const { data: ref } = useReference()
  const [editing, setEditing] = useState(false)

  const portionUnits = useMemo(
    () => (ref?.units ?? []).filter((u) => ['mass', 'volume', 'count'].includes(u.dimension)),
    [ref],
  )
  const defaultUnitId =
    portionUnits.find((u) => u.code === 'g')?.id ?? portionUnits[0]?.id ?? ''

  const mutation = useMutation({
    mutationFn: (payload: Partial<ItemNutrition>) =>
      api.saveItemNutrition(sku, payload, !!data),
    onSuccess: (saved) => {
      qc.setQueryData(qk.itemNutrition(sku), saved)
      qc.invalidateQueries({ queryKey: qk.dishes })
      setEditing(false)
      toast.success(t('inv.supp.nutrition.saved'))
    },
    onError: (err) =>
      toast.error(t('inv.supp.saveFailed', { detail: parseApiError(err).message })),
  })

  if (isLoading) return <SectionSkeleton />
  if (isError)
    return (
      <SectionShell
        title={t('inv.supp.nutrition.title')}
        subtitle={t('inv.supp.nutrition.subtitle')}
      >
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[13px] text-accent-ink hover:underline"
        >
          {t('inv.supp.loadError')}
        </button>
      </SectionShell>
    )

  if (editing) {
    return (
      <NutritionForm
        initial={data ?? null}
        defaultUnitId={defaultUnitId}
        units={portionUnits}
        saving={mutation.isPending}
        onCancel={() => setEditing(false)}
        onSave={(payload) => mutation.mutate(payload)}
      />
    )
  }

  const unitLabel =
    data?.unit_scale_detail?.description ?? data?.unit_scale_detail?.code ?? ''

  return (
    <SectionShell
      title={t('inv.supp.nutrition.title')}
      subtitle={
        data ? t('inv.supp.nutrition.per', { unit: unitLabel }) : t('inv.supp.nutrition.subtitle')
      }
      action={
        <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>
          {data ? t('inv.supp.edit') : t('inv.supp.nutrition.add')}
        </Button>
      }
    >
      {!data ? (
        <p className="text-[13px] text-ink-subtle">{t('inv.supp.nutrition.empty')}</p>
      ) : (
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-hairline">
            {NUTRIENT_KEYS.map((k) => {
              const [en, ar, unit] = NUTRIENTS[k]
              return (
                <tr key={k}>
                  <td className="py-1.5 pe-3 text-ink-muted">
                    {locale === 'ar' ? ar : en}
                  </td>
                  <td className="tnum py-1.5 ps-3 text-end font-mono text-ink">
                    {tidy(data[k])} <span className="text-xs text-ink-subtle">{unit}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-2xs text-ink-subtle">{t('inv.supp.localNote')}</p>
    </SectionShell>
  )
}

function NutritionForm({
  initial,
  defaultUnitId,
  units,
  saving,
  onCancel,
  onSave,
}: {
  initial: ItemNutrition | null
  defaultUnitId: string
  units: { id: string; code: string; description: string }[]
  saving: boolean
  onCancel: () => void
  onSave: (payload: Partial<ItemNutrition>) => void
}) {
  const { t, locale } = useI18n()
  const [unitId, setUnitId] = useState(initial?.unit_scale ?? defaultUnitId)
  const [values, setValues] = useState<Record<NutrientKey, string>>(() => {
    const seed = {} as Record<NutrientKey, string>
    for (const k of NUTRIENT_KEYS) seed[k] = tidy(initial?.[k])
    return seed
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const payload: Partial<ItemNutrition> = { unit_scale: unitId }
    for (const k of NUTRIENT_KEYS) payload[k] = tidy(values[k])
    onSave(payload)
  }

  return (
    <SectionShell
      title={t('inv.supp.nutrition.title')}
      subtitle={t('inv.supp.nutrition.subtitle')}
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-ink-muted">
            {t('inv.supp.portionUnit')}
          </span>
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.description} ({u.code})
              </option>
            ))}
          </Select>
          <span className="text-xs text-ink-subtle">{t('inv.supp.portionUnit.help')}</span>
        </label>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {NUTRIENT_KEYS.map((k) => {
            const [en, ar, unit] = NUTRIENTS[k]
            return (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">
                  {locale === 'ar' ? ar : en}{' '}
                  <span className="text-ink-subtle">({unit})</span>
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={values[k]}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                />
              </label>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('inv.supp.cancel')}
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={saving}>
            {t('inv.supp.save')}
          </Button>
        </div>
      </form>
    </SectionShell>
  )
}

/* ── Allergens ───────────────────────────────────────────────────────── */
export function ItemAllergenSection({ sku }: { sku: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useItemConversion(sku)
  const { data: ref } = useReference()
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const allergens = useMemo(() => ref?.allergens ?? [], [ref])
  const current = data?.allergens ?? []
  const currentNames = data?.allergens_detail ?? allergens.filter((a) => current.includes(a.id))

  const mutation = useMutation({
    mutationFn: (ids: string[]) => api.saveItemAllergens(sku, ids, !!data),
    onSuccess: (saved) => {
      qc.setQueryData(qk.itemConversion(sku), saved)
      qc.invalidateQueries({ queryKey: qk.dishes })
      setEditing(false)
      toast.success(t('inv.supp.allergens.saved'))
    },
    onError: (err) =>
      toast.error(t('inv.supp.saveFailed', { detail: parseApiError(err).message })),
  })

  function startEditing() {
    setSelected(current)
    setQuery('')
    setEditing(true)
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? allergens.filter((a) => a.name.toLowerCase().includes(q)) : allergens
    return base.slice(0, 60)
  }, [allergens, query])

  if (isLoading) return <SectionSkeleton />
  if (isError)
    return (
      <SectionShell
        title={t('inv.supp.allergens.title')}
        subtitle={t('inv.supp.allergens.subtitle')}
      >
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[13px] text-accent-ink hover:underline"
        >
          {t('inv.supp.loadError')}
        </button>
      </SectionShell>
    )

  if (editing) {
    return (
      <SectionShell
        title={t('inv.supp.allergens.title')}
        subtitle={t('inv.supp.allergens.subtitle')}
      >
        <div className="space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
              <Icon name="search" size={14} />
            </span>
            <Input
              className="ps-8"
              placeholder={t('inv.supp.allergens.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('inv.supp.allergens.search')}
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-hairline p-2">
            {matches.length === 0 ? (
              <p className="px-1 py-1.5 text-[13px] text-ink-subtle">
                {t('inv.supp.allergens.noMatch', { q: query })}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {matches.map((a) => {
                  const on = selected.includes(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelected((s) =>
                          on ? s.filter((x) => x !== a.id) : [...s, a.id],
                        )
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        on
                          ? 'border-accent bg-accent text-accent-on'
                          : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken',
                      )}
                    >
                      {a.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-ink-subtle">{selected.length}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={mutation.isPending}
              >
                {t('inv.supp.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={mutation.isPending}
                onClick={() => mutation.mutate(selected)}
              >
                {t('inv.supp.save')}
              </Button>
            </div>
          </div>
        </div>
      </SectionShell>
    )
  }

  return (
    <SectionShell
      title={t('inv.supp.allergens.title')}
      subtitle={t('inv.supp.allergens.subtitle')}
      action={
        <Button size="sm" variant="secondary" icon="edit" onClick={startEditing}>
          {currentNames.length ? t('inv.supp.edit') : t('inv.supp.allergens.add')}
        </Button>
      }
    >
      {currentNames.length === 0 ? (
        <p className="text-[13px] text-ink-subtle">{t('inv.supp.allergens.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {currentNames.map((a) => (
            <Pill key={a.id} tone="danger" icon="alert">
              {a.name}
            </Pill>
          ))}
        </div>
      )}
      <p className="mt-3 text-2xs text-ink-subtle">{t('inv.supp.localNote')}</p>
    </SectionShell>
  )
}

/* ── Measurement conversions ─────────────────────────────────────────── */

/* The 5 per-item figures the source "Store Items" sheet holds — "Grams In 1
   Tbs / 1 Piece", "Pieces In 1 Pkt / 1 Kg", "Pieces or Pkt In Box". Only the
   tablespoon weight is a cooking-measure conversion; the sheet derives the
   whole tsp/cup ladder from it (1 Tbs = 3 Ts, 1 Cup = 16 Tbs), and so do we —
   costing needs just one volume→mass line per SKU. The other four map to
   scalar fields on ItemConversion. */
const TBS_LADDER: [string, number][] = [
  ['1 Tbs', 1],
  ['1 Ts', 1 / 3],
  ['1/2 Ts', 1 / 6],
  ['1/4 Ts', 1 / 12],
  ['1/8 Ts', 1 / 24],
  ['1 Cup', 16],
  ['3/4 Cup', 12],
  ['2/3 Cup', 32 / 3],
  ['1/2 Cup', 8],
  ['1/3 Cup', 16 / 3],
  ['1/4 Cup', 4],
  ['1/8 Cup', 2],
]

/** leading word of a label like "1 Tbs" / "1/4 Cup" -> "tbs" / "cup" */
function labelWord(label: string): string {
  const m = label.trim().match(/^(?:\d+(?:\.\d+)?|\d+\/\d+)\s+(.+?)\s*$/)
  return (m?.[1] ?? '').toLowerCase()
}

/** grams-per-tablespoon read back from an existing "1 Tbs = x g" line */
function gramsPerTbsOf(conv: ItemConversion | null): string {
  const line = conv?.lines?.find((l) => ['tbs', 'tbsp'].includes(labelWord(l.label)))
  return line ? tidy(line.quantity) : ''
}

function ladderLines(gramsPerTbs: number, gramUnitId: string): ItemConversionLine[] {
  return TBS_LADDER.map(([label, mult]) => ({
    label,
    quantity: String(Math.round(gramsPerTbs * mult * 1000) / 1000),
    unit: gramUnitId,
    gram_equivalent: null,
  }))
}

type MeasureField =
  | 'grams_per_tbs'
  | 'grams_per_piece'
  | 'pieces_per_pack'
  | 'pieces_per_kg'
  | 'pieces_or_pack_per_box'

export function ItemMeasuresSection({ sku }: { sku: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useItemConversion(sku)
  const { data: ref } = useReference()
  const [editing, setEditing] = useState(false)

  const gramUnitId = useMemo(
    () => (ref?.units ?? []).find((u) => u.code === 'g')?.id ?? '',
    [ref],
  )

  const mutation = useMutation({
    mutationFn: (payload: Partial<ItemConversion>) => api.saveItemConversion(sku, payload, !!data),
    onSuccess: (saved) => {
      qc.setQueryData(qk.itemConversion(sku), saved)
      qc.invalidateQueries({ queryKey: qk.dishes })
      setEditing(false)
      toast.success(t('inv.supp.measures.saved'))
    },
    onError: (err) =>
      toast.error(t('inv.supp.saveFailed', { detail: parseApiError(err).message })),
  })

  if (isLoading) return <SectionSkeleton />
  if (isError)
    return (
      <SectionShell
        title={t('inv.supp.measures.title')}
        subtitle={t('inv.supp.measures.subtitle')}
      >
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[13px] text-accent-ink hover:underline"
        >
          {t('inv.supp.loadError')}
        </button>
      </SectionShell>
    )

  if (editing) {
    return (
      <MeasuresForm
        initial={data ?? null}
        gramUnitId={gramUnitId}
        saving={mutation.isPending}
        onCancel={() => setEditing(false)}
        onSave={(payload) => mutation.mutate(payload)}
      />
    )
  }

  const rows: [string, string | null | undefined][] = [
    [t('inv.supp.measures.gramsPerTbs'), gramsPerTbsOf(data ?? null) || null],
    [t('inv.supp.measures.gramsPerPiece'), data?.grams_per_piece],
    [t('inv.supp.measures.perPack'), data?.pieces_per_pack],
    [t('inv.supp.measures.perKg'), data?.pieces_per_kg],
    [t('inv.supp.measures.perBox'), data?.pieces_or_pack_per_box],
  ]
  const shown = rows.filter(
    (r): r is [string, string] =>
      r[1] != null && String(r[1]).trim() !== '' && Number(r[1]) > 0,
  )

  return (
    <SectionShell
      title={t('inv.supp.measures.title')}
      subtitle={t('inv.supp.measures.subtitle')}
      action={
        <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>
          {shown.length === 0 ? t('inv.supp.measures.add') : t('inv.supp.edit')}
        </Button>
      }
    >
      {shown.length === 0 ? (
        <p className="text-[13px] text-ink-subtle">{t('inv.supp.measures.empty')}</p>
      ) : (
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-hairline">
            {shown.map(([label, v]) => (
              <tr key={label}>
                <td className="py-1.5 pe-3 text-ink-muted">{label}</td>
                <td className="tnum py-1.5 ps-3 text-end font-mono text-ink">{tidy(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-2xs text-ink-subtle">{t('inv.supp.localNote')}</p>
    </SectionShell>
  )
}

function MeasuresForm({
  initial,
  gramUnitId,
  saving,
  onCancel,
  onSave,
}: {
  initial: ItemConversion | null
  gramUnitId: string
  saving: boolean
  onCancel: () => void
  onSave: (payload: Partial<ItemConversion>) => void
}) {
  const { t } = useI18n()

  const [v, setV] = useState<Record<MeasureField, string>>(() => ({
    grams_per_tbs: gramsPerTbsOf(initial),
    grams_per_piece: initial?.grams_per_piece ? tidy(initial.grams_per_piece) : '',
    pieces_per_pack: initial?.pieces_per_pack ? tidy(initial.pieces_per_pack) : '',
    pieces_per_kg: initial?.pieces_per_kg ? tidy(initial.pieces_per_kg) : '',
    pieces_or_pack_per_box: initial?.pieces_or_pack_per_box
      ? tidy(initial.pieces_or_pack_per_box)
      : '',
  }))

  function num(s: string): string | null {
    const trimmed = s.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? String(n) : null
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const tbs = num(v.grams_per_tbs)
    onSave({
      grams_per_piece: num(v.grams_per_piece),
      pieces_per_pack: num(v.pieces_per_pack),
      pieces_per_kg: num(v.pieces_per_kg),
      pieces_or_pack_per_box: num(v.pieces_or_pack_per_box),
      lines: tbs != null && Number(tbs) > 0 ? ladderLines(Number(tbs), gramUnitId) : [],
    })
  }

  const fields: [MeasureField, string, string?][] = [
    ['grams_per_tbs', t('inv.supp.measures.gramsPerTbs'), t('inv.supp.measures.gramsPerTbs.help')],
    ['grams_per_piece', t('inv.supp.measures.gramsPerPiece')],
    ['pieces_per_pack', t('inv.supp.measures.perPack')],
    ['pieces_per_kg', t('inv.supp.measures.perKg')],
    ['pieces_or_pack_per_box', t('inv.supp.measures.perBox')],
  ]

  return (
    <SectionShell
      title={t('inv.supp.measures.title')}
      subtitle={t('inv.supp.measures.subtitle')}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(([key, label, help]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">{label}</span>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={v[key]}
                onChange={(e) => setV((s) => ({ ...s, [key]: e.target.value }))}
              />
              {help && <span className="text-2xs text-ink-subtle">{help}</span>}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('inv.supp.cancel')}
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={saving}>
            {t('inv.supp.save')}
          </Button>
        </div>
      </form>
    </SectionShell>
  )
}

function SectionSkeleton() {
  return (
    <div className="rounded-card border border-hairline p-3.5">
      <div className="h-3.5 w-32 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-surface-sunken" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-sunken" />
    </div>
  )
}

/* ── Storage & shelf life ────────────────────────────────────────────── */

const STORAGE_BANDS: StorageBand[] = ['', 'dry', 'chilled', 'frozen']

/** "72" -> "72 h · 3 days" ; "18" -> "18 h" */
function hoursLabel(hours: number | null | undefined, t: TFunc): string | null {
  if (hours == null || hours <= 0) return null
  if (hours % 24 === 0 && hours >= 24) {
    return t('inv.supp.storage.hoursDays', { h: hours, d: hours / 24 })
  }
  return t('inv.supp.storage.hoursOnly', { h: hours })
}

export function ItemStorageSection({ sku, itemId }: { sku: string; itemId: string }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useItemStorage(sku)
  const [editing, setEditing] = useState(false)

  const mutation = useMutation({
    mutationFn: (payload: Partial<ItemStorage>) => api.saveItemStorage(sku, payload, !!data),
    onSuccess: (saved) => {
      qc.setQueryData(qk.itemStorage(sku), saved)
      setEditing(false)
      toast.success(t('inv.supp.storage.saved'))
    },
    onError: (err) =>
      toast.error(t('inv.supp.saveFailed', { detail: parseApiError(err).message })),
  })

  if (isLoading) return <SectionSkeleton />
  if (isError)
    return (
      <SectionShell title={t('inv.supp.storage.title')} subtitle={t('inv.supp.storage.subtitle')}>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[13px] text-accent-ink hover:underline"
        >
          {t('inv.supp.loadError')}
        </button>
      </SectionShell>
    )

  if (editing) {
    return (
      <StorageForm
        initial={data ?? null}
        saving={mutation.isPending}
        onCancel={() => setEditing(false)}
        onSave={(payload) => mutation.mutate(payload)}
      />
    )
  }

  const bandLabel = data?.storage_band ? data.storage_band_display : null
  const primary = hoursLabel(data?.shelf_life_hours, t)
  const opened = hoursLabel(data?.opened_shelf_life_hours, t)
  const instructions =
    locale === 'ar'
      ? data?.storage_instructions_ar || data?.storage_instructions_en
      : data?.storage_instructions_en || data?.storage_instructions_ar
  const canPrint = !!data?.shelf_life_hours

  return (
    <SectionShell
      title={t('inv.supp.storage.title')}
      subtitle={t('inv.supp.storage.subtitle')}
      action={
        <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(true)}>
          {data ? t('inv.supp.edit') : t('inv.supp.storage.add')}
        </Button>
      }
    >
      {!data || (!bandLabel && !primary && !instructions) ? (
        <p className="text-[13px] text-ink-subtle">{t('inv.supp.storage.empty')}</p>
      ) : (
        <div className="space-y-2.5 text-[13px]">
          {bandLabel && (
            <div>
              <Pill tone="neutral">{bandLabel}</Pill>
            </div>
          )}
          <table className="w-full">
            <tbody className="divide-y divide-hairline">
              {primary && (
                <tr>
                  <td className="py-1.5 pe-3 text-ink-muted">{t('inv.supp.storage.shelfLife')}</td>
                  <td className="py-1.5 ps-3 text-end font-mono text-ink">{primary}</td>
                </tr>
              )}
              {opened && (
                <tr>
                  <td className="py-1.5 pe-3 text-ink-muted">{t('inv.supp.storage.opened')}</td>
                  <td className="py-1.5 ps-3 text-end font-mono text-ink">{opened}</td>
                </tr>
              )}
            </tbody>
          </table>
          {instructions && (
            <p className="whitespace-pre-line leading-relaxed text-ink">{instructions}</p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-2xs text-ink-subtle">{t('inv.supp.localNote')}</p>
        <Button
          size="sm"
          variant="secondary"
          icon="documents"
          disabled={!canPrint}
          onClick={() => navigate(`/labels/${itemId}`)}
        >
          {t('inv.supp.storage.printLabels')}
        </Button>
      </div>
      {!canPrint && (
        <p className="mt-1 text-2xs text-ink-subtle">{t('inv.supp.storage.printHint')}</p>
      )}
    </SectionShell>
  )
}

function StorageForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: ItemStorage | null
  saving: boolean
  onCancel: () => void
  onSave: (payload: Partial<ItemStorage>) => void
}) {
  const { t } = useI18n()
  const [band, setBand] = useState<StorageBand>(initial?.storage_band ?? '')
  const [shelf, setShelf] = useState(initial?.shelf_life_hours ? String(initial.shelf_life_hours) : '')
  const [opened, setOpened] = useState(
    initial?.opened_shelf_life_hours ? String(initial.opened_shelf_life_hours) : '',
  )
  const [insEn, setInsEn] = useState(initial?.storage_instructions_en ?? '')
  const [insAr, setInsAr] = useState(initial?.storage_instructions_ar ?? '')
  const [noteEn, setNoteEn] = useState(initial?.label_notes_en ?? '')
  const [noteAr, setNoteAr] = useState(initial?.label_notes_ar ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSave({
      storage_band: band,
      shelf_life_hours: shelf.trim() === '' ? null : (Number(shelf) as unknown as number),
      opened_shelf_life_hours: opened.trim() === '' ? null : (Number(opened) as unknown as number),
      storage_instructions_en: insEn,
      storage_instructions_ar: insAr,
      label_notes_en: noteEn,
      label_notes_ar: noteAr,
    })
  }

  return (
    <SectionShell title={t('inv.supp.storage.title')} subtitle={t('inv.supp.storage.subtitle')}>
      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-ink-muted">{t('inv.supp.storage.band')}</span>
          <Select value={band} onChange={(e) => setBand(e.target.value as StorageBand)}>
            {STORAGE_BANDS.map((b) => (
              <option key={b || 'none'} value={b}>
                {b ? t(`inv.supp.storage.band.${b}`) : t('inv.supp.storage.band.none')}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">
              {t('inv.supp.storage.shelfLife')} ({t('inv.supp.storage.hoursUnit')})
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">
              {t('inv.supp.storage.opened')} ({t('inv.supp.storage.hoursUnit')})
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={opened}
              onChange={(e) => setOpened(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink-muted">
            {t('inv.supp.storage.instructions')}
          </legend>
          <Textarea
            rows={2}
            value={insEn}
            onChange={(e) => setInsEn(e.target.value)}
            placeholder={t('lang.en')}
          />
          <Textarea
            rows={2}
            dir="rtl"
            value={insAr}
            onChange={(e) => setInsAr(e.target.value)}
            placeholder={t('lang.ar')}
          />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ink-muted">
            {t('inv.supp.storage.labelNote')}
          </legend>
          <Input value={noteEn} onChange={(e) => setNoteEn(e.target.value)} placeholder={t('lang.en')} />
          <Input
            value={noteAr}
            dir="rtl"
            onChange={(e) => setNoteAr(e.target.value)}
            placeholder={t('lang.ar')}
          />
        </fieldset>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('inv.supp.cancel')}
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={saving}>
            {t('inv.supp.save')}
          </Button>
        </div>
      </form>
    </SectionShell>
  )
}
