import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Combobox } from '@/components/Combobox'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Input, Select, Textarea } from '@/components/Input'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { CostPanel } from '@/features/dishes/CostPanel'
import { NutritionPanel } from '@/features/dishes/NutritionPanel'
import {
  EMPTY_INGREDIENT,
  IngredientEditor,
  StepEditor,
  toEditable,
  type EditableIngredient,
} from '@/features/dishes/IngredientEditor'
import { VersionDrawer } from '@/features/dishes/VersionDrawer'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useInventoryItems, useProductionRecipe, useReference } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/parseApiError'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/i18n'
import type { CostBreakdown, NutritionRollup, ProductionRecipeDetail } from '@/types/api'

interface FormState {
  name_en: string
  name_ar: string
  recipe_code: string
  revision: string
  prep_kitchen: string
  prep_kitchen_ref: string
  section: string
  output_item_sku: string
  output_qty: string
  output_unit: string
  prep_time_minutes: string
  expected_waste_pct: string
  approved_by: string
  qa_approved_by: string
  approved_at: string
  notes: string
}

const BLANK: FormState = {
  name_en: '',
  name_ar: '',
  recipe_code: '',
  revision: '',
  prep_kitchen: '',
  prep_kitchen_ref: '',
  section: '',
  output_item_sku: '',
  output_qty: '',
  output_unit: '',
  prep_time_minutes: '',
  expected_waste_pct: '0',
  approved_by: '',
  qa_approved_by: '',
  approved_at: '',
  notes: '',
}

export function ProductionEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  const qc = useQueryClient()

  const { data: ref, isLoading: refLoading, isError: refError, refetch: refRefetch } = useReference()
  const { data: items = [] } = useInventoryItems()
  const { data: existing, isLoading: recipeLoading, isError: recipeError } = useProductionRecipe(id)

  const [form, setForm] = useState<FormState>(BLANK)
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([])
  const [steps, setSteps] = useState<{ step_number: number; instruction: string }[]>([])
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null)
  const [nutrition, setNutrition] = useState<NutritionRollup | null>(null)

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

  function hydrate(r: ProductionRecipeDetail) {
    setSavedId(r.id)
    setForm({
      name_en: r.name_en,
      name_ar: r.name_ar,
      recipe_code: r.recipe_code,
      revision: r.revision,
      prep_kitchen: r.prep_kitchen,
      prep_kitchen_ref: r.prep_kitchen_ref ?? '',
      section: r.section?.id ?? '',
      output_item_sku: r.output_item_sku,
      output_qty: r.output_qty ?? '',
      output_unit: r.output_unit?.id ?? '',
      prep_time_minutes: r.prep_time_minutes != null ? String(r.prep_time_minutes) : '',
      expected_waste_pct: r.expected_waste_pct,
      approved_by: r.approved_by?.id ?? '',
      qa_approved_by: r.qa_approved_by?.id ?? '',
      approved_at: r.approved_at ?? '',
      notes: r.notes,
    })
    setIngredients(r.ingredients.map(toEditable))
    setSteps(r.steps.map((s) => ({ step_number: s.step_number, instruction: s.instruction })))
    setBreakdown(isBreakdown(r.cost_breakdown) ? r.cost_breakdown : null)
    setNutrition(isNutrition(r.nutrition) ? r.nutrition : null)
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))
  const err = (k: string) => fieldErrors[k]

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
      name_en: form.name_en,
      name_ar: form.name_ar,
      recipe_code: form.recipe_code,
      revision: form.revision,
      prep_kitchen: form.prep_kitchen,
      prep_kitchen_ref: form.prep_kitchen_ref || null,
      section: form.section || null,
      output_item_sku: form.output_item_sku,
      output_qty: form.output_qty || null,
      output_unit: form.output_unit || null,
      prep_time_minutes: form.prep_time_minutes || null,
      expected_waste_pct: form.expected_waste_pct || '0',
      include_labor_cost: false,
      approved_by: form.approved_by || null,
      qa_approved_by: form.qa_approved_by || null,
      approved_at: form.approved_at || null,
      notes: form.notes,
      ingredients: ingredients.map((ing, i) => ({
        item_sku: ing.item_sku,
        item_name_snapshot: ing.item_name_snapshot,
        prep_note: ing.prep_note,
        quantity: ing.quantity,
        unit: ing.unit || null,
        order: i + 1,
      })),
      steps: steps.map((s, i) => ({ instruction: s.instruction, step_number: i + 1 })),
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
        ? await api.updateProductionRecipe(savedId, payload)
        : await api.createProductionRecipe(payload)
      hydrate(saved)
      qc.invalidateQueries({ queryKey: qk.production })
      qc.invalidateQueries({ queryKey: qk.dashboard })
      if (saved.id) qc.setQueryData(qk.productionRecipe(saved.id), saved)
      toast.success(savedId ? t('toast.recipeUpdated') : t('toast.recipeCreated'))
      const warnings = saved._warnings ?? []
      if (warnings.length) {
        toast.info(
          warnings.length === 1
            ? t('cost.notCostedOne')
            : t('cost.notCosted', { n: warnings.length }),
        )
      }
      if (isNew && saved.id) navigate(`/recipes/production/${saved.id}/edit`, { replace: true })
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
      const r = await api.recalcProductionRecipe(savedId)
      setBreakdown(isBreakdown(r.cost_breakdown) ? r.cost_breakdown : null)
      setNutrition(isNutrition(r.nutrition) ? r.nutrition : null)
      qc.setQueryData(qk.productionRecipe(savedId), r)
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
  if (refLoading || (id && recipeLoading)) return <EditorSkeleton />
  if (id && recipeError) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} body={t('state.retryHint')} />
      </Page>
    )
  }
  if (!ref) return <EditorSkeleton />

  const title = isNew ? t('production.newTitle') : form.name_en || t('action.edit')

  return (
    <form onSubmit={onSubmit}>
      <Page stagger className="pb-28 lg:pb-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="arrowLeft"
              onClick={() =>
                navigate(savedId ? `/recipes/production/${savedId}` : '/recipes/production')
              }
            >
              {t('action.back')}
            </Button>
            <h1 className="font-display text-[1.5rem] font-medium tracking-tight text-ink">
              {title}
            </h1>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {savedId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="history"
                onClick={() => setVersionsOpen(true)}
              >
                {t('action.versionHistory')}
              </Button>
            )}
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {saving
                ? t('action.saving')
                : savedId
                  ? t('action.saveChanges')
                  : t('action.create')}
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
                  <Input
                    value={form.name_en}
                    onChange={(e) => set('name_en', e.target.value)}
                    required
                  />
                </Field>
                <Field label={t('editor.field.nameAr')} error={err('name_ar')}>
                  <Input
                    dir="rtl"
                    value={form.name_ar}
                    onChange={(e) => set('name_ar', e.target.value)}
                  />
                </Field>
                <Field
                  label={t('editor.field.code')}
                  help={t('editor.help.code')}
                  error={err('recipe_code')}
                >
                  <Input
                    value={form.recipe_code}
                    onChange={(e) => set('recipe_code', e.target.value)}
                  />
                </Field>
                <Field label={t('editor.field.revision')} error={err('revision')}>
                  <Input
                    value={form.revision}
                    onChange={(e) => set('revision', e.target.value)}
                  />
                </Field>
                <Field
                  label={t('production.field.kitchen')}
                  help={t('production.help.kitchen')}
                  error={err('prep_kitchen_ref')}
                >
                  <Select
                    value={form.prep_kitchen_ref}
                    onChange={(e) => set('prep_kitchen_ref', e.target.value)}
                  >
                    <option value="">—</option>
                    {ref.prepKitchens.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name_en}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={t('editor.field.station')}
                  error={err('section')}
                >
                  <Select value={form.section} onChange={(e) => set('section', e.target.value)}>
                    <option value="">—</option>
                    {ref.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('production.section.output')} />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('production.field.outputSku')}
                  help={t('production.help.outputSku')}
                  required
                  error={err('output_item_sku')}
                  className="sm:col-span-2"
                >
                  <Combobox
                    value={form.output_item_sku}
                    items={items}
                    invalid={!!err('output_item_sku')}
                    placeholder={t('production.field.outputSku')}
                    onSelect={(sku) => set('output_item_sku', sku)}
                  />
                </Field>
                <Field
                  label={t('production.field.outputQty')}
                  required
                  error={err('output_qty')}
                >
                  <Input
                    type="number"
                    step="0.001"
                    value={form.output_qty}
                    onChange={(e) => set('output_qty', e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label={t('production.field.outputUnit')}
                  required
                  error={err('output_unit')}
                >
                  <Select
                    value={form.output_unit}
                    onChange={(e) => set('output_unit', e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {ref.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={t('editor.field.prepTime')}
                  error={err('prep_time_minutes')}
                >
                  <Input
                    type="number"
                    value={form.prep_time_minutes}
                    onChange={(e) => set('prep_time_minutes', e.target.value)}
                  />
                </Field>
                <Field
                  label={t('editor.field.waste')}
                  help={t('editor.help.waste')}
                  error={err('expected_waste_pct')}
                >
                  <Input
                    type="number"
                    step="0.01"
                    value={form.expected_waste_pct}
                    onChange={(e) => set('expected_waste_pct', e.target.value)}
                  />
                </Field>
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
                    setIngredients((rows) =>
                      rows.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)),
                    )
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
                  onAdd={() =>
                    setSteps((s) => [...s, { step_number: s.length + 1, instruction: '' }])
                  }
                  onRemove={(i) =>
                    setSteps((s) =>
                      s
                        .filter((_, idx) => idx !== i)
                        .map((row, idx) => ({ ...row, step_number: idx + 1 })),
                    )
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('editor.section.approvals')} />
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Field label={t('editor.field.approvedBy')} error={err('approved_by')}>
                  <Select
                    value={form.approved_by}
                    onChange={(e) => set('approved_by', e.target.value)}
                  >
                    <option value="">—</option>
                    {ref.approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.qaApprovedBy')} error={err('qa_approved_by')}>
                  <Select
                    value={form.qa_approved_by}
                    onChange={(e) => set('qa_approved_by', e.target.value)}
                  >
                    <option value="">—</option>
                    {ref.approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('editor.field.approvedAt')} error={err('approved_at')}>
                  <Input
                    type="date"
                    value={form.approved_at}
                    onChange={(e) => set('approved_at', e.target.value)}
                  />
                </Field>
                <Field
                  label={t('editor.field.notes')}
                  className="col-span-full"
                  error={err('notes')}
                >
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </Field>
              </CardBody>
            </Card>
          </div>

          {/* ── right: live panels ── */}
          <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <CostPanel
              breakdown={breakdown}
              hideLabour
              perServingLabel={t('production.cost.perBatch')}
              onRecalculate={savedId ? onRecalculate : undefined}
              recalculating={recalculating}
            />
            <NutritionPanel nutrition={nutrition} />
          </div>
        </div>
      </Page>

      {/* mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-2 border-t border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
        {savedId && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon="history"
            onClick={() => setVersionsOpen(true)}
          >
            <Icon name="history" size={15} />
          </Button>
        )}
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>
          {saving ? t('action.saving') : savedId ? t('action.saveChanges') : t('action.create')}
        </Button>
      </div>

      {savedId && (
        <VersionDrawer
          recipeId={savedId}
          kind="production"
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
        />
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
