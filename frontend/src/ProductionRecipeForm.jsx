import { useEffect, useState } from 'react'
import { fetchReferenceData, fetchInventoryItems, productionRecipes } from './lib/cookbookApi'
import { parseApiError } from './lib/parseApiError'
import { useToast } from './Toast'
import {
  Field, inputClass, IngredientRows, StepRows, HistoryPanel,
  primaryButtonClass, secondaryButtonClass, Spinner,
} from './RecipeFormFields'
import CostBreakdown from './CostBreakdown'

export default function ProductionRecipeForm({ recipeId, onDone, onCancel }) {
  const toast = useToast()
  const [ref, setRef] = useState(null)
  const [items, setItems] = useState([])
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const [id, setId] = useState(recipeId)
  const [form, setForm] = useState({
    name_en: '', name_ar: '', recipe_code: '', revision: '', prep_kitchen: '', section: '',
    output_item_sku: '', output_qty: '', output_unit: '',
    prep_time_minutes: '', expected_waste_pct: '0', include_labor_cost: true,
    approved_by: '', qa_approved_by: '', approved_at: '', notes: '',
  })
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [costHistory, setCostHistory] = useState([])
  const [activityLog, setActivityLog] = useState([])

  useEffect(() => {
    fetchReferenceData().then(setRef)
    fetchInventoryItems().then(setItems).catch(() => setItems([]))
  }, [])

  useEffect(() => {
    if (!recipeId) return
    productionRecipes.get(recipeId).then(hydrate)
  }, [recipeId])

  function hydrate(r) {
    setId(r.id)
    setForm({
      name_en: r.name_en, name_ar: r.name_ar, recipe_code: r.recipe_code || '', revision: r.revision || '',
      prep_kitchen: r.prep_kitchen, section: r.section?.id ?? '', output_item_sku: r.output_item_sku,
      output_qty: r.output_qty, output_unit: r.output_unit?.id ?? '',
      prep_time_minutes: r.prep_time_minutes ?? '', expected_waste_pct: r.expected_waste_pct,
      include_labor_cost: r.include_labor_cost,
      approved_by: r.approved_by?.id ?? '', qa_approved_by: r.qa_approved_by?.id ?? '',
      approved_at: r.approved_at ?? '', notes: r.notes,
    })
    setIngredients(r.ingredients.map((i) => ({
      item_sku: i.item_sku, item_name_snapshot: i.item_name_snapshot, prep_note: i.prep_note,
      quantity: i.quantity, unit: i.unit,
    })))
    setSteps(r.steps)
    setBreakdown(r.cost_breakdown && Object.keys(r.cost_breakdown).length ? r.cost_breakdown : null)
    setCostHistory(r.cost_history || [])
    setActivityLog(r.activity_log || [])
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const errFor = (key) => fieldErrors[key]

  const addIngredient = () => setIngredients((r) => [...r, { item_sku: '', item_name_snapshot: '', prep_note: '', quantity: '', unit: '' }])
  const updateIngredient = (i, k, v) => setIngredients((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))
  const removeIngredient = (i) => setIngredients((r) => r.filter((_, idx) => idx !== i))
  const addStep = () => setSteps((r) => [...r, { step_number: r.length + 1, instruction: '' }])
  const updateStep = (i, v) => setSteps((r) => r.map((row, idx) => (idx === i ? { ...row, instruction: v } : row)))
  const removeStep = (i) => setSteps((r) => r.filter((_, idx) => idx !== i).map((row, idx) => ({ ...row, step_number: idx + 1 })))

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(''); setFieldErrors({}); setSaving(true)
    try {
      const payload = {
        ...form,
        section: form.section || null, output_unit: form.output_unit || null,
        approved_by: form.approved_by || null, qa_approved_by: form.qa_approved_by || null,
        approved_at: form.approved_at || null, prep_time_minutes: form.prep_time_minutes || null,
        ingredients: ingredients.map((i, idx) => ({ ...i, order: idx + 1, unit: i.unit || null })),
        steps,
      }
      const saved = id ? await productionRecipes.update(id, payload) : await productionRecipes.create(payload)
      hydrate(saved)
      toast.success(id ? 'Production recipe updated.' : 'Production recipe created.')
      if (saved._warnings?.length) toast.info(`${saved._warnings.length} ingredient lines could not be costed — see the cost panel.`)
    } catch (err) {
      const { fields, message } = parseApiError(err)
      setFieldErrors(fields); setFormError(message)
      toast.error(message || 'Could not save the recipe.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRecalculate() {
    if (!id) return
    setRecalculating(true)
    try {
      const r = await productionRecipes.recalculate(id)
      setBreakdown(r.cost_breakdown && Object.keys(r.cost_breakdown).length ? r.cost_breakdown : null)
      toast.success('Cost recalculated.')
    } catch (err) {
      toast.error(parseApiError(err).message || 'Recalculate failed.')
    } finally {
      setRecalculating(false)
    }
  }

  if (!ref) return <Spinner />

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
          {id ? form.name_en || 'Edit Production Recipe' : 'New Production Recipe'}
        </h1>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>← Back to list</button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : id ? 'Save changes' : 'Create recipe'}
          </button>
        </div>
      </div>

      {formError && (
        <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md p-3">{formError}</p>
      )}

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-2 gap-4">
        <Field label="Name (English)" required error={errFor('name_en')}>
          <input className={inputClass} required value={form.name_en} onChange={(e) => setField('name_en', e.target.value)} />
        </Field>
        <Field label="Name (Arabic)" error={errFor('name_ar')}>
          <input className={inputClass} dir="rtl" value={form.name_ar} onChange={(e) => setField('name_ar', e.target.value)} />
        </Field>
        <Field label="Recipe code" error={errFor('recipe_code')}>
          <input className={inputClass} value={form.recipe_code} onChange={(e) => setField('recipe_code', e.target.value)} />
        </Field>
        <Field label="Revision" error={errFor('revision')}>
          <input className={inputClass} value={form.revision} onChange={(e) => setField('revision', e.target.value)} />
        </Field>
        <Field label="Prep kitchen" error={errFor('prep_kitchen')}>
          <input className={inputClass} placeholder="Bread & Sauces" value={form.prep_kitchen} onChange={(e) => setField('prep_kitchen', e.target.value)} />
        </Field>
        <Field label="Section (kitchen station)" help="Drives the labour cost" error={errFor('section')}>
          <select className={inputClass} value={form.section} onChange={(e) => setField('section', e.target.value)}>
            <option value="">—</option>
            {ref.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Output item SKU" error={errFor('output_item_sku')}>
          <input className={inputClass} value={form.output_item_sku} onChange={(e) => setField('output_item_sku', e.target.value)} />
        </Field>
        <Field label="Output qty per batch" error={errFor('output_qty')}>
          <input type="number" step="0.001" className={`${inputClass} tabular-nums`} value={form.output_qty} onChange={(e) => setField('output_qty', e.target.value)} />
        </Field>
        <Field label="Output unit" error={errFor('output_unit')}>
          <select className={inputClass} value={form.output_unit} onChange={(e) => setField('output_unit', e.target.value)}>
            <option value="">—</option>
            {ref.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </select>
        </Field>
        <Field label="Prep time (minutes)" error={errFor('prep_time_minutes')}>
          <input type="number" className={`${inputClass} tabular-nums`} value={form.prep_time_minutes} onChange={(e) => setField('prep_time_minutes', e.target.value)} />
        </Field>
        <Field label="Expected waste %" help="A number, not a fraction — 1 = 1%" error={errFor('expected_waste_pct')}>
          <input type="number" step="0.01" className={`${inputClass} tabular-nums`} value={form.expected_waste_pct} onChange={(e) => setField('expected_waste_pct', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 pt-6">
          <input type="checkbox" checked={form.include_labor_cost} onChange={(e) => setField('include_labor_cost', e.target.checked)} />
          Include labour cost
        </label>
      </section>

      <IngredientRows
        ingredients={ingredients} units={ref.units} items={items}
        costLines={breakdown?.lines}
        onChange={updateIngredient} onAdd={addIngredient} onRemove={removeIngredient}
      />

      <CostBreakdown
        breakdown={breakdown}
        onRecalculate={id ? handleRecalculate : null}
        recalculating={recalculating}
      />

      <StepRows steps={steps} onChange={updateStep} onAdd={addStep} onRemove={removeStep} />

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Approved by (chef)" error={errFor('approved_by')}>
          <select className={inputClass} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)}>
            <option value="">—</option>
            {ref.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="QA approved by" error={errFor('qa_approved_by')}>
          <select className={inputClass} value={form.qa_approved_by} onChange={(e) => setField('qa_approved_by', e.target.value)}>
            <option value="">—</option>
            {ref.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Approved at" error={errFor('approved_at')}>
          <input type="date" className={inputClass} value={form.approved_at} onChange={(e) => setField('approved_at', e.target.value)} />
        </Field>
        <div className="col-span-3">
          <Field label="Notes" error={errFor('notes')}>
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </Field>
        </div>
      </section>

      {id && <HistoryPanel costHistory={costHistory} priceLabel={null} activityLog={activityLog} />}
    </form>
  )
}
