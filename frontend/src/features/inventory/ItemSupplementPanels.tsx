import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Input, Select } from '@/components/Input'
import { Pill } from '@/components/Pill'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useItemConversion, useItemNutrition, useReference } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { NUTRIENT_KEYS, type ItemNutrition, type NutrientKey } from '@/types/api'

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

function SectionSkeleton() {
  return (
    <div className="rounded-card border border-hairline p-3.5">
      <div className="h-3.5 w-32 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-surface-sunken" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-sunken" />
    </div>
  )
}
