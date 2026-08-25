import { useEffect, useState } from 'react'
import { fetchReferenceData, fetchInventoryItems, productionRecipes } from './lib/cookbookApi'
import { Field, inputClass, IngredientRows, StepRows } from './RecipeFormFields'

export default function ProductionRecipeForm({ recipeId, onDone, onCancel }) {
  const [ref, setRef] = useState(null)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name_en: '', name_ar: '', prep_kitchen: '', section: '',
    output_item_sku: '', output_qty: '', output_unit: '',
    prep_time_minutes: '', expected_waste_pct: '0', include_labor_cost: true, labor_cost: '0',
    approved_by: '', qa_approved_by: '', approved_at: '', notes: '',
  })
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])

  useEffect(() => {
    fetchReferenceData().then(setRef)
    fetchInventoryItems().then(setItems)
  }, [])

  useEffect(() => {
    if (!recipeId) return
    productionRecipes.get(recipeId).then((r) => {
      setForm({
        name_en: r.name_en, name_ar: r.name_ar, prep_kitchen: r.prep_kitchen,
        section: r.section?.id ?? '', output_item_sku: r.output_item_sku,
        output_qty: r.output_qty, output_unit: r.output_unit?.id ?? '',
        prep_time_minutes: r.prep_time_minutes ?? '', expected_waste_pct: r.expected_waste_pct,
        include_labor_cost: r.include_labor_cost, labor_cost: r.labor_cost,
        approved_by: r.approved_by?.id ?? '', qa_approved_by: r.qa_approved_by?.id ?? '',
        approved_at: r.approved_at ?? '', notes: r.notes,
      })
      setIngredients(r.ingredients)
      setSteps(r.steps)
    })
  }, [recipeId])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addIngredient() {
    setIngredients((rows) => [...rows, { item_sku: '', item_name_snapshot: '', prep_note: '', quantity: '', unit: '' }])
  }
  function updateIngredient(i, key, value) {
    setIngredients((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }
  function removeIngredient(i) {
    setIngredients((rows) => rows.filter((_, idx) => idx !== i))
  }

  function addStep() {
    setSteps((rows) => [...rows, { step_number: rows.length + 1, instruction: '' }])
  }
  function updateStep(i, value) {
    setSteps((rows) => rows.map((r, idx) => (idx === i ? { ...r, instruction: value } : r)))
  }
  function removeStep(i) {
    setSteps((rows) => rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, step_number: idx + 1 })))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        section: form.section || null,
        output_unit: form.output_unit || null,
        approved_by: form.approved_by || null,
        qa_approved_by: form.qa_approved_by || null,
        approved_at: form.approved_at || null,
        prep_time_minutes: form.prep_time_minutes || null,
        ingredients: ingredients.map((i, idx) => ({ ...i, order: idx + 1 })),
        steps,
      }
      if (recipeId) {
        await productionRecipes.update(recipeId, payload)
      } else {
        await productionRecipes.create(payload)
      }
      onDone()
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!ref) return <div className="p-8 text-stone-500">Loading…</div>

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">{recipeId ? 'Edit Production Recipe' : 'New Production Recipe'}</h1>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
          <button type="submit" disabled={saving} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-md hover:bg-stone-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Recipe'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 break-all">{error}</p>}

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-2 gap-4">
        <Field label="Name (English)"><input className={inputClass} required value={form.name_en} onChange={(e) => setField('name_en', e.target.value)} /></Field>
        <Field label="Name (Arabic)"><input className={inputClass} dir="rtl" value={form.name_ar} onChange={(e) => setField('name_ar', e.target.value)} /></Field>
        <Field label="Prep kitchen"><input className={inputClass} placeholder="Bread & Sauces" value={form.prep_kitchen} onChange={(e) => setField('prep_kitchen', e.target.value)} /></Field>
        <Field label="Section (kitchen station)">
          <select className={inputClass} value={form.section} onChange={(e) => setField('section', e.target.value)}>
            <option value="">—</option>
            {ref.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </section>

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Output item SKU"><input list="item-skus" className={inputClass} value={form.output_item_sku} onChange={(e) => setField('output_item_sku', e.target.value)} /></Field>
        <Field label="Output qty per batch"><input type="number" step="0.001" className={inputClass} value={form.output_qty} onChange={(e) => setField('output_qty', e.target.value)} /></Field>
        <Field label="Output unit">
          <select className={inputClass} value={form.output_unit} onChange={(e) => setField('output_unit', e.target.value)}>
            <option value="">—</option>
            {ref.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </select>
        </Field>
      </section>

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Prep time (minutes)"><input type="number" className={inputClass} value={form.prep_time_minutes} onChange={(e) => setField('prep_time_minutes', e.target.value)} /></Field>
        <Field label="Expected waste %"><input type="number" step="0.01" className={inputClass} value={form.expected_waste_pct} onChange={(e) => setField('expected_waste_pct', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 pt-6">
          <input type="checkbox" checked={form.include_labor_cost} onChange={(e) => setField('include_labor_cost', e.target.checked)} />
          Include labor cost
        </label>
        <Field label="Labor cost (KWD)"><input type="number" step="0.001" className={inputClass} value={form.labor_cost} onChange={(e) => setField('labor_cost', e.target.value)} /></Field>
      </section>

      <IngredientRows ingredients={ingredients} units={ref.units} items={items}
        onChange={updateIngredient} onAdd={addIngredient} onRemove={removeIngredient} />

      <StepRows steps={steps} onChange={updateStep} onAdd={addStep} onRemove={removeStep} />

      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Approved by (chef)">
          <select className={inputClass} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)}>
            <option value="">—</option>
            {ref.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="QA approved by">
          <select className={inputClass} value={form.qa_approved_by} onChange={(e) => setField('qa_approved_by', e.target.value)}>
            <option value="">—</option>
            {ref.approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Approved at"><input type="date" className={inputClass} value={form.approved_at} onChange={(e) => setField('approved_at', e.target.value)} /></Field>
        <div className="col-span-3">
          <Field label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} /></Field>
        </div>
      </section>
    </form>
  )
}
