import { useEffect, useState } from 'react'
import { fetchReferenceData, fetchInventoryItems, dishRecipes } from './lib/cookbookApi'
import { Field, inputClass, IngredientRows, StepRows } from './RecipeFormFields'

const emptyStandard = {
  service_style: '', portion_weight_g: '', portion_tolerance_g: '', serving_temp_c: '', temp_tolerance_c: '',
  holding_time_minutes: '', appearance: '', color: '', aroma: '', texture: '', presentation: '',
  sweetness_target: '', sweetness_tolerance: '', saltiness_target: '', saltiness_tolerance: '',
  sourness_target: '', sourness_tolerance: '', bitterness_target: '', bitterness_tolerance: '',
  umami_target: '', umami_tolerance: '', spice_target: '', spice_tolerance: '',
  richness_target: '', richness_tolerance: '', smokiness_target: '', smokiness_tolerance: '',
  primary_flavor: '', secondary_flavor: '', aftertaste: '', mouthfeel: '',
  freshness_standard: '', critical_defects_not_allowed: '',
}

export default function DishRecipeForm({ recipeId, onDone, onCancel }) {
  const [ref, setRef] = useState(null)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name_en: '', name_ar: '', branch: '', pos_item_name: '',
    category: '', section: '', service_style: '',
    selling_price: '', rating: '', taste_profile: '',
    prep_time_minutes: '', expected_waste_pct: '0', include_labor_cost: true, labor_cost: '0',
    approved_by: '', qa_approved_by: '', approved_at: '', notes: '',
    allergens: [],
  })
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])
  const [standard, setStandard] = useState(emptyStandard)
  const [showStandard, setShowStandard] = useState(false)

  useEffect(() => {
    fetchReferenceData().then(setRef)
    fetchInventoryItems().then(setItems)
  }, [])

  useEffect(() => {
    if (!recipeId) return
    dishRecipes.get(recipeId).then((r) => {
      setForm({
        name_en: r.name_en, name_ar: r.name_ar, branch: r.branch, pos_item_name: r.pos_item_name,
        category: r.category?.id ?? '', section: r.section?.id ?? '', service_style: r.service_style?.id ?? '',
        selling_price: r.selling_price ?? '', rating: r.rating ?? '', taste_profile: r.taste_profile,
        prep_time_minutes: r.prep_time_minutes ?? '', expected_waste_pct: r.expected_waste_pct,
        include_labor_cost: r.include_labor_cost, labor_cost: r.labor_cost,
        approved_by: r.approved_by?.id ?? '', qa_approved_by: r.qa_approved_by?.id ?? '',
        approved_at: r.approved_at ?? '', notes: r.notes, allergens: r.allergens.map((a) => a.id),
      })
      setIngredients(r.ingredients.map((i) => ({ ...i, unit: i.unit })))
      setSteps(r.steps)
      if (r.standard) {
        setStandard({ ...emptyStandard, ...r.standard })
        setShowStandard(true)
      }
    })
  }, [recipeId])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleAllergen(id) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(id) ? f.allergens.filter((a) => a !== id) : [...f.allergens, id],
    }))
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
        category: form.category || null,
        section: form.section || null,
        service_style: form.service_style || null,
        approved_by: form.approved_by || null,
        qa_approved_by: form.qa_approved_by || null,
        approved_at: form.approved_at || null,
        selling_price: form.selling_price || null,
        rating: form.rating || null,
        prep_time_minutes: form.prep_time_minutes || null,
        ingredients: ingredients.map((i, idx) => ({ ...i, order: idx + 1 })),
        steps,
        standard: showStandard ? standard : null,
      }
      if (recipeId) {
        await dishRecipes.update(recipeId, payload)
      } else {
        await dishRecipes.create(payload)
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
          <h1 className="text-2xl font-semibold text-stone-900">{recipeId ? 'Edit Recipe' : 'New Recipe'}</h1>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
            <button type="submit" disabled={saving} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-md hover:bg-stone-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Recipe'}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 break-all">{error}</p>}

        {/* Basic info */}
        <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-2 gap-4">
          <Field label="Name (English)"><input className={inputClass} required value={form.name_en} onChange={(e) => setField('name_en', e.target.value)} /></Field>
          <Field label="Name (Arabic)"><input className={inputClass} dir="rtl" value={form.name_ar} onChange={(e) => setField('name_ar', e.target.value)} /></Field>
          <Field label="Branch"><input className={inputClass} placeholder="Dine" value={form.branch} onChange={(e) => setField('branch', e.target.value)} /></Field>
          <Field label="POS item name"><input className={inputClass} value={form.pos_item_name} onChange={(e) => setField('pos_item_name', e.target.value)} /></Field>
          <Field label="Category">
            <select className={inputClass} value={form.category} onChange={(e) => setField('category', e.target.value)}>
              <option value="">—</option>
              {ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Section (kitchen station)">
            <select className={inputClass} value={form.section} onChange={(e) => setField('section', e.target.value)}>
              <option value="">—</option>
              {ref.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Service style">
            <select className={inputClass} value={form.service_style} onChange={(e) => setField('service_style', e.target.value)}>
              <option value="">—</option>
              {ref.serviceStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Rating (0-10)"><input type="number" step="0.1" min="0" max="10" className={inputClass} value={form.rating} onChange={(e) => setField('rating', e.target.value)} /></Field>
        </section>

        {/* Costing */}
        <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
          <Field label="Selling price (KWD)"><input type="number" step="0.001" className={inputClass} value={form.selling_price} onChange={(e) => setField('selling_price', e.target.value)} /></Field>
          <Field label="Prep time (minutes)"><input type="number" className={inputClass} value={form.prep_time_minutes} onChange={(e) => setField('prep_time_minutes', e.target.value)} /></Field>
          <Field label="Expected waste %"><input type="number" step="0.01" className={inputClass} value={form.expected_waste_pct} onChange={(e) => setField('expected_waste_pct', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={form.include_labor_cost} onChange={(e) => setField('include_labor_cost', e.target.checked)} />
            Include labor cost
          </label>
          <Field label="Labor cost (KWD)"><input type="number" step="0.001" className={inputClass} value={form.labor_cost} onChange={(e) => setField('labor_cost', e.target.value)} /></Field>
        </section>

        {/* Taste profile + allergens */}
        <section className="bg-white rounded-lg border border-stone-200 p-4 space-y-4">
          <Field label="Taste profile"><input className={inputClass} placeholder="Fresh, Tangy, Sour, Light." value={form.taste_profile} onChange={(e) => setField('taste_profile', e.target.value)} /></Field>
          <div>
            <span className="block text-xs font-medium text-stone-500 mb-2">Allergens</span>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {ref.allergens.map((a) => (
                <label key={a.id} className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${form.allergens.includes(a.id) ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300 text-stone-600'}`}>
                  <input type="checkbox" className="hidden" checked={form.allergens.includes(a.id)} onChange={() => toggleAllergen(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
        </section>

        <IngredientRows ingredients={ingredients} units={ref.units} items={items}
          onChange={updateIngredient} onAdd={addIngredient} onRemove={removeIngredient} />

        <StepRows steps={steps} onChange={updateStep} onAdd={addStep} onRemove={removeStep} />

        {/* Approval */}
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

        {/* QA Standard */}
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-3">
            <input type="checkbox" checked={showStandard} onChange={(e) => setShowStandard(e.target.checked)} />
            Include QA/QC Dish Standard
          </label>
          {showStandard && (
            <div className="grid grid-cols-4 gap-3">
              <Field label="Portion weight (g)"><input type="number" step="0.01" className={inputClass} value={standard.portion_weight_g} onChange={(e) => setStandard((s) => ({ ...s, portion_weight_g: e.target.value }))} /></Field>
              <Field label="Portion tolerance (g)"><input type="number" step="0.01" className={inputClass} value={standard.portion_tolerance_g} onChange={(e) => setStandard((s) => ({ ...s, portion_tolerance_g: e.target.value }))} /></Field>
              <Field label="Serving temp (°C)"><input type="number" step="0.1" className={inputClass} value={standard.serving_temp_c} onChange={(e) => setStandard((s) => ({ ...s, serving_temp_c: e.target.value }))} /></Field>
              <Field label="Temp tolerance (°C)"><input type="number" step="0.1" className={inputClass} value={standard.temp_tolerance_c} onChange={(e) => setStandard((s) => ({ ...s, temp_tolerance_c: e.target.value }))} /></Field>
              <Field label="Holding time (min)"><input type="number" className={inputClass} value={standard.holding_time_minutes} onChange={(e) => setStandard((s) => ({ ...s, holding_time_minutes: e.target.value }))} /></Field>
              <Field label="Appearance"><input className={inputClass} value={standard.appearance} onChange={(e) => setStandard((s) => ({ ...s, appearance: e.target.value }))} /></Field>
              <Field label="Color"><input className={inputClass} value={standard.color} onChange={(e) => setStandard((s) => ({ ...s, color: e.target.value }))} /></Field>
              <Field label="Aroma"><input className={inputClass} value={standard.aroma} onChange={(e) => setStandard((s) => ({ ...s, aroma: e.target.value }))} /></Field>
              <Field label="Texture"><input className={inputClass} value={standard.texture} onChange={(e) => setStandard((s) => ({ ...s, texture: e.target.value }))} /></Field>
              <Field label="Presentation"><input className={inputClass} value={standard.presentation} onChange={(e) => setStandard((s) => ({ ...s, presentation: e.target.value }))} /></Field>

              {[
                ['sweetness', 'Sweetness'], ['saltiness', 'Saltiness'], ['sourness', 'Sourness'],
                ['bitterness', 'Bitterness'], ['umami', 'Umami'], ['spice', 'Spice'],
                ['richness', 'Richness'], ['smokiness', 'Smokiness'],
              ].map(([key, label]) => (
                <div key={key} className="col-span-2 grid grid-cols-2 gap-2">
                  <Field label={`${label} target (0-10)`}><input type="number" step="0.1" min="0" max="10" className={inputClass} value={standard[`${key}_target`]} onChange={(e) => setStandard((s) => ({ ...s, [`${key}_target`]: e.target.value }))} /></Field>
                  <Field label={`${label} tolerance (±)`}><input type="number" step="0.1" className={inputClass} value={standard[`${key}_tolerance`]} onChange={(e) => setStandard((s) => ({ ...s, [`${key}_tolerance`]: e.target.value }))} /></Field>
                </div>
              ))}

              <Field label="Primary flavor"><input className={inputClass} value={standard.primary_flavor} onChange={(e) => setStandard((s) => ({ ...s, primary_flavor: e.target.value }))} /></Field>
              <Field label="Secondary flavor"><input className={inputClass} value={standard.secondary_flavor} onChange={(e) => setStandard((s) => ({ ...s, secondary_flavor: e.target.value }))} /></Field>
              <Field label="Aftertaste"><input className={inputClass} value={standard.aftertaste} onChange={(e) => setStandard((s) => ({ ...s, aftertaste: e.target.value }))} /></Field>
              <Field label="Mouthfeel"><input className={inputClass} value={standard.mouthfeel} onChange={(e) => setStandard((s) => ({ ...s, mouthfeel: e.target.value }))} /></Field>
              <div className="col-span-2"><Field label="Freshness standard"><textarea className={inputClass} rows={2} value={standard.freshness_standard} onChange={(e) => setStandard((s) => ({ ...s, freshness_standard: e.target.value }))} /></Field></div>
              <div className="col-span-2"><Field label="Critical defects not allowed"><textarea className={inputClass} rows={2} value={standard.critical_defects_not_allowed} onChange={(e) => setStandard((s) => ({ ...s, critical_defects_not_allowed: e.target.value }))} /></Field></div>
            </div>
          )}
        </section>
      </form>
  )
}
