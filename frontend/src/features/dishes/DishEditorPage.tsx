import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Input, Select, Textarea } from '@/components/Input'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { CostPanel } from './CostPanel'
import { AllergenPanel, NutritionPanel } from './NutritionPanel'
import {
  EMPTY_INGREDIENT,
  IngredientEditor,
  StepEditor,
  toEditable,
  type EditableIngredient,
} from './IngredientEditor'
import { EMPTY_STANDARD, QaStandardFields, standardToForm } from './QaStandardFields'
import { VersionDrawer } from './VersionDrawer'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDishRecipe, useInventoryItems, useReference } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/parseApiError'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/i18n'
import type { CostBreakdown, DishRecipeDetail, DishStandard, NutritionRollup } from '@/types/api'

interface FormState {
  name_en: string
  name_ar: string
  recipe_code: string
  revision: string
  branch: string
  branch_ref: string
  pos_item_name: string
  image_url: string
  category: string
  section: string
  service_style: string
  selling_price: string
  prep_time_minutes: string
  expected_waste_pct: string
  include_labor_cost: boolean
  rating: string
  rating_status: string
  rating_date: string
  taste_profile: string
  approved_by: string
  qa_approved_by: string
  approved_at: string
  notes: string
  allergens: string[]
}

const BLANK: FormState = {
  name_en: '',
  name_ar: '',
  recipe_code: '',
  revision: '',
  branch: '',
  branch_ref: '',
  pos_item_name: '',
  image_url: '',
  category: '',
  section: '',
  service_style: '',
  selling_price: '',
  prep_time_minutes: '',
  expected_waste_pct: '0',
  include_labor_cost: true,
  rating: '',
  rating_status: '',
  rating_date: '',
  taste_profile: '',
  approved_by: '',
  qa_approved_by: '',
  approved_at: '',
  notes: '',
  allergens: [],
}

export function DishEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  const qc = useQueryClient()

  const { data: ref, isLoading: refLoading, isError: refError, refetch: refRefetch } = useReference()
  const { data: items = [] } = useInventoryItems()
  const { data: existing, isLoading: dishLoading, isError: dishError } = useDishRecipe(id)

  const [form, setForm] = useState<FormState>(BLANK)
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([])
  const [steps, setSteps] = useState<{ step_number: number; instruction: string }[]>([])
  const [standard, setStandard] = useState<DishStandard>(EMPTY_STANDARD)
  const [showStandard, setShowStandard] = useState(false)
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null)
  const [nutrition, setNutrition] = useState<NutritionRollup | null>(null)
  const [allergenRollup, setAllergenRollup] = useState<DishRecipeDetail['allergen_rollup'] | null>(null)

  const [savedId, setSavedId] = useState<string | undefined>(id)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [versionsOpen, setVersionsOpen] = useState(false)

  useEffect(() => {
    if (existing) hydrate(existing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing])

  function hydrate(r: DishRecipeDetail) {
    setSavedId(r.id)
    setForm({
      name_en: r.name_en,
      name_ar: r.name_ar,
      recipe_code: r.recipe_code,
      revision: r.revision,
      branch: r.branch,
      branch_ref: r.branch_ref ?? '',
      pos_item_name: r.pos_item_name,
      image_url: r.image_url,
      category: r.category?.id ?? '',
      section: r.section?.id ?? '',
      service_style: r.service_style?.id ?? '',
      selling_price: r.selling_price ?? '',
      prep_time_minutes: r.prep_time_minutes != null ? String(r.prep_time_minutes) : '',
      expected_waste_pct: r.expected_waste_pct,
      include_labor_cost: r.include_labor_cost,
      rating: r.rating ?? '',
      rating_status: r.rating_status,
      rating_date: r.rating_date ?? '',
      taste_profile: r.taste_profile,
      approved_by: r.approved_by?.id ?? '',
      qa_approved_by: r.qa_approved_by?.id ?? '',
      approved_at: r.approved_at ?? '',
      notes: r.notes,
      allergens: r.allergens.map((a) => a.id),
    })
    setIngredients(r.ingredients.map(toEditable))
    setSteps(r.steps.map((s) => ({ step_number: s.step_number, instruction: s.instruction })))
    if (r.standard) {
      setStandard(standardToForm(r.standard))
      setShowStandard(true)
    }
    setBreakdown(isBreakdown(r.cost_breakdown) ? r.cost_breakdown : null)
    setNutrition(isNutrition(r.nutrition) ? r.nutrition : null)
    setAllergenRollup(r.allergen_rollup)
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setStd = (k: string, v: string) => setStandard((s) => ({ ...s, [k]: v }))
  const err = (k: string) => fieldErrors[k]

  function toggleAllergen(aid: string) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(aid)
        ? f.allergens.filter((x) => x !== aid)
        : [...f.allergens, aid],
    }))
  }

  const ingredientErrors = useMemo(() => {
    const map: Record<number, string> = {}
    Object.entries(fieldErrors).forEach(([k, v]) => {
      const m = k.match(/ingredients?\.?\[?(\d+)\]?/)
      if (m) map[Number(m[1])] = v
    })
    return map
  }, [fieldErrors])

  function buildPayload() {
    return {
      ...form,
      category: form.category || null,
      section: form.section || null,
      service_style: form.service_style || null,
      branch_ref: form.branch_ref || null,
      approved_by: form.approved_by || null,
      qa_approved_by: form.qa_approved_by || null,
      approved_at: form.approved_at || null,
      rating_date: form.rating_date || null,
      selling_price: form.selling_price || null,
      rating: form.rating || null,
      prep_time_minutes: form.prep_time_minutes || null,
      ingredients: ingredients.map((ing, i) => ({
        item_sku: ing.item_sku,
        item_name_snapshot: ing.item_name_snapshot,
        prep_note: ing.prep_note,
        quantity: ing.quantity,
        unit: ing.unit || null,
        order: i + 1,
      })),
      steps: steps.map((s, i) => ({ instruction: s.instruction, step_number: i + 1 })),
      standard: showStandard ? standard : null,
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    try {
      const payload = buildPayload()
      const saved = savedId
        ? await api.updateDishRecipe(savedId, payload)
        : await api.createDishRecipe(payload)
      hydrate(saved)
      qc.invalidateQueries({ queryKey: qk.dishes })
      qc.invalidateQueries({ queryKey: qk.dashboard })
      if (saved.id) qc.setQueryData(qk.dish(saved.id), saved)
      toast.success(savedId ? t('toast.recipeUpdated') : t('toast.recipeCreated'))
      const warnings = saved._warnings ?? []
      if (warnings.length) {
        toast.info(
          warnings.length === 1 ? t('cost.notCostedOne') : t('cost.notCosted', { n: warnings.length }),
        )
      }
      if (isNew && saved.id) navigate(`/recipes/dishes/${saved.id}/edit`, { replace: true })
    } catch (error) {
      const { fields, message } = parseApiError(error)
      setFieldErrors(fields)
      setFormError(message)
      toast.error(t('toast.saveFailed', { detail: message }))
    } finally {
      setSaving(false)
    }
  }

  async function onRecalculate() {
    if (!savedId) return
    setRecalculating(true)
    try {
      const r = await api.recalcDishRecipe(savedId)
      setBreakdown(isBreakdown(r.cost_breakdown) ? r.cost_breakdown : null)
      setNutrition(isNutrition(r.nutrition) ? r.nutrition : null)
      qc.setQueryData(qk.dish(savedId), r)
      toast.success(t('toast.costRecalculated'))
    } catch (error) {
      toast.error(parseApiError(error).message || t('state.errorGeneric'))
    } finally {
      setRecalculating(false)
    }
  }

  if (refError) {
    return (
      <Page>
        <ErrorState onRetry={() => refRefetch()} />
      </Page>
    )
  }
  if (refLoading || (id && dishLoading)) return <EditorSkeleton />
  if (id && dishError) {
    return (
      <Page>
        <ErrorState title="Could not load this recipe" body={t('state.retryHint')} />
      </Page>
    )
  }
  if (!ref) return <EditorSkeleton />

  const title = isNew ? t('editor.newTitle') : form.name_en || t('action.edit')

  return (
    <form onSubmit={onSubmit}>
      <Page className="pb-28 lg:pb-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="arrowLeft"
              onClick={() => navigate(savedId ? `/recipes/dishes/${savedId}` : '/recipes/dishes')}
            >
              {t('action.back')}
            </Button>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {savedId && (
              <Button type="button" variant="secondary" size="sm" icon="history" onClick={() => setVersionsOpen(true)}>
                {t('action.versionHistory')}
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {saving ? t('action.saving') : savedId ? t('action.saveChanges') : t('action.create')}
            </Button>
          </div>
        </header>

        {formError && (
          <div className="mb-5">
            <ErrorState title={t('state.errorGeneric')} body={formError} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* ── left: the form ── */}
          <div className="space-y-6">
            <Card>
              <CardHeader title={t('editor.section.identity')} />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label={t('editor.field.nameEn')} required error={err('name_en')}>
                  <Input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} required />
                </Field>
                <Field label={t('editor.field.nameAr')} error={err('name_ar')}>
                  <Input dir="rtl" value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} />
                </Field>
                <Field label={t('editor.field.code')} help={t('editor.help.code')} error={err('recipe_code')}>
                  <Input value={form.recipe_code} onChange={(e) => set('recipe_code', e.target.value)} />
                </Field>
                <Field label={t('editor.field.revision')} error={err('revision')}>
                  <Input value={form.revision} onChange={(e) => set('revision', e.target.value)} />
                </Field>
                <Field label={t('editor.field.branch')} error={err('branch')}>
                  <Input value={form.branch} onChange={(e) => set('branch', e.target.value)} />
                </Field>
                <Field label={t('editor.field.branchRef')} help={t('editor.help.branchRef')} error={err('branch_ref')}>
                  <Select value={form.branch_ref} onChange={(e) => set('branch_ref', e.target.value)}>
                    <option value="">—</option>
                    {ref.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_en}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.pos')} error={err('pos_item_name')}>
                  <Input value={form.pos_item_name} onChange={(e) => set('pos_item_name', e.target.value)} />
                </Field>
                <Field label={t('editor.field.image')} error={err('image_url')}>
                  <Input type="url" placeholder="https://…" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.classification')} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Field label={t('editor.field.category')} error={err('category')}>
                  <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                    <option value="">—</option>
                    {ref.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.station')} help={t('editor.help.station')} error={err('section')}>
                  <Select value={form.section} onChange={(e) => set('section', e.target.value)}>
                    <option value="">—</option>
                    {ref.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.serviceStyle')} error={err('service_style')}>
                  <Select value={form.service_style} onChange={(e) => set('service_style', e.target.value)}>
                    <option value="">—</option>
                    {ref.serviceStyles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.rating')} error={err('rating')}>
                  <Input type="number" step="0.1" min="0" max="10" value={form.rating} onChange={(e) => set('rating', e.target.value)} />
                </Field>
                <Field label={t('editor.field.ratingStatus')}>
                  <Select value={form.rating_status} onChange={(e) => set('rating_status', e.target.value)}>
                    <option value="">—</option>
                    <option value="ok">OK</option>
                    <option value="attention">Attention</option>
                    <option value="fix">Fix</option>
                  </Select>
                </Field>
                <Field label={t('editor.field.ratingDate')}>
                  <Input type="date" value={form.rating_date} onChange={(e) => set('rating_date', e.target.value)} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.costing')} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Field label={t('editor.field.price')} error={err('selling_price')}>
                  <Input type="number" step="0.001" value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} />
                </Field>
                <Field label={t('editor.field.prepTime')} error={err('prep_time_minutes')}>
                  <Input type="number" value={form.prep_time_minutes} onChange={(e) => set('prep_time_minutes', e.target.value)} />
                </Field>
                <Field label={t('editor.field.waste')} help={t('editor.help.waste')} error={err('expected_waste_pct')}>
                  <Input type="number" step="0.01" value={form.expected_waste_pct} onChange={(e) => set('expected_waste_pct', e.target.value)} />
                </Field>
                <label className="col-span-full flex items-center gap-2 text-[13px] text-ink-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-hairline-strong text-accent focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                    checked={form.include_labor_cost}
                    onChange={(e) => set('include_labor_cost', e.target.checked)}
                  />
                  {t('editor.field.includeLabour')}
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.taste')} />
              <CardBody className="space-y-4">
                <Field label={t('editor.field.tasteProfile')} error={err('taste_profile')}>
                  <Input
                    placeholder="Fresh, tangy, herb-forward, light"
                    value={form.taste_profile}
                    onChange={(e) => set('taste_profile', e.target.value)}
                  />
                </Field>
                <div>
                  <p className="mb-2 text-[13px] font-medium text-ink-muted">{t('editor.field.allergens')}</p>
                  <div className="flex flex-wrap gap-2">
                    {ref.allergens.map((a) => {
                      const on = form.allergens.includes(a.id)
                      return (
                        <label
                          key={a.id}
                          className={
                            'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ' +
                            (on
                              ? 'border-accent bg-accent text-white'
                              : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken')
                          }
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => toggleAllergen(a.id)}
                          />
                          {a.name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.ingredients')} />
              <CardBody>
                <IngredientEditor
                  ingredients={ingredients}
                  units={ref.units}
                  items={items}
                  costLines={breakdown?.lines}
                  errors={ingredientErrors}
                  onChange={(i, k, v) =>
                    setIngredients((rows) => rows.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))
                  }
                  onAdd={() => setIngredients((r) => [...r, { ...EMPTY_INGREDIENT }])}
                  onRemove={(i) => setIngredients((r) => r.filter((_, idx) => idx !== i))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.method')} />
              <CardBody>
                <StepEditor
                  steps={steps}
                  onChange={(i, v) =>
                    setSteps((s) => s.map((row, idx) => (idx === i ? { ...row, instruction: v } : row)))
                  }
                  onAdd={() => setSteps((s) => [...s, { step_number: s.length + 1, instruction: '' }])}
                  onRemove={(i) =>
                    setSteps((s) =>
                      s.filter((_, idx) => idx !== i).map((row, idx) => ({ ...row, step_number: idx + 1 })),
                    )
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.approvals')} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Field label={t('editor.field.approvedBy')} error={err('approved_by')}>
                  <Select value={form.approved_by} onChange={(e) => set('approved_by', e.target.value)}>
                    <option value="">—</option>
                    {ref.approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.qaApprovedBy')} error={err('qa_approved_by')}>
                  <Select value={form.qa_approved_by} onChange={(e) => set('qa_approved_by', e.target.value)}>
                    <option value="">—</option>
                    {ref.approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.approvedAt')} error={err('approved_at')}>
                  <Input type="date" value={form.approved_at} onChange={(e) => set('approved_at', e.target.value)} />
                </Field>
                <Field label={t('editor.field.notes')} className="col-span-full" error={err('notes')}>
                  <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t('editor.section.standard')}
                action={
                  <label className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-hairline-strong text-accent"
                      checked={showStandard}
                      onChange={(e) => setShowStandard(e.target.checked)}
                    />
                    Include
                  </label>
                }
              />
              {showStandard && (
                <CardBody>
                  <QaStandardFields standard={standard} branches={ref.branches} onChange={setStd} />
                </CardBody>
              )}
            </Card>
          </div>

          {/* ── right: live panels ── */}
          <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <CostPanel
              breakdown={breakdown}
              sellingPrice={form.selling_price}
              onRecalculate={savedId ? onRecalculate : undefined}
              recalculating={recalculating}
            />
            <NutritionPanel nutrition={nutrition} />
            <AllergenPanel rollup={allergenRollup} />
          </div>
        </div>
      </Page>

      {/* mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-2 border-t border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
        {savedId && (
          <Button type="button" variant="secondary" size="sm" icon="history" onClick={() => setVersionsOpen(true)}>
            <Icon name="history" size={15} />
          </Button>
        )}
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>
          {saving ? t('action.saving') : savedId ? t('action.saveChanges') : t('action.create')}
        </Button>
      </div>

      {savedId && (
        <VersionDrawer dishId={savedId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      )}
    </form>
  )
}

function isBreakdown(b: unknown): b is CostBreakdown {
  return !!b && typeof b === 'object' && 'per_serving' in (b as object)
}
function isNutrition(n: unknown): n is NutritionRollup {
  return !!n && typeof n === 'object' && Object.keys(n as object).length > 0
}

function EditorSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    </Page>
  )
}
