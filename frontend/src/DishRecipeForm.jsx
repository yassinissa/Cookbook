import { useEffect, useState } from 'react'
import { fetchReferenceData, fetchInventoryItems, dishRecipes } from './lib/cookbookApi'
import { parseApiError } from './lib/parseApiError'
import { useToast } from './Toast'
import {
  Field, inputClass, IngredientRows, StepRows, HistoryPanel,
  primaryButtonClass, secondaryButtonClass, Spinner,
} from './RecipeFormFields'
import CostBreakdown from './CostBreakdown'

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
  const toast = useToast()
  const [ref, setRef] = useState(null)
  const [items, setItems] = useState([])
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const [id, setId] = useState(recipeId)
  const [form, setForm] = useState({
    name_en: '', name_ar: '', recipe_code: '', revision: '', branch: '', pos_item_name: '',
    category: '', section: '', service_style: '',
    selling_price: '', rating: '', rating_status: '', rating_date: '', taste_profile: '',
    prep_time_minutes: '', expected_waste_pct: '0', include_labor_cost: true,
    approved_by: '', qa_approved_by: '', approved_at: '', notes: '',
    allergens: [],
  })
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])
  const [standard, setStandard] = useState(emptyStandard)
  const [showStandard, setShowStandard] = useState(false)
  const [breakdown, setBreakdown] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [activityLog, setActivityLog] = useState([])

  useEffect(() => {
    fetchReferenceData().then(setRef)
    fetchInventoryItems().then(setItems).catch(() => setItems([]))
  }, [])

  useEffect(() => {
    if (!recipeId) return
    dishRecipes.get(recipeId).then(hydrate)
  }, [recipeId])

  function hydrate(r) {
    setId(r.id)
    setForm({
      name_en: r.name_en, name_ar: r.name_ar, recipe_code: r.recipe_code || '', revision: r.revision || '',
      branch: r.branch, pos_item_name: r.pos_item_name,
      category: r.category?.id ?? '', section: r.section?.id ?? '', service_style: r.service_style?.id ?? '',
      selling_price: r.selling_price ?? '', rating: r.rating ?? '',
      rating_status: r.rating_status || '', rating_date: r.rating_date ?? '',
      taste_profile: r.taste_profile,
      prep_time_minutes: r.prep_time_minutes ?? '', expected_waste_pct: r.expected_waste_pct,
      include_labor_cost: r.include_labor_cost,
      approved_by: r.approved_by?.id ?? '', qa_approved_by: r.qa_approved_by?.id ?? '',
      approved_at: r.approved_at ?? '', notes: r.notes, allergens: r.allergens.map((a) => a.id),
    })
    setIngredients(r.ingredients.map((i) => ({
      item_sku: i.item_sku, item_name_snapshot: i.item_name_snapshot, prep_note: i.prep_note,
      quantity: i.quantity, unit: i.unit,
    })))
    setSteps(r.steps)
    if (r.standard) {
      // only the fields this form manages; nulls -> '' so inputs stay controlled
      const clean = {}
      for (const k of Object.keys(emptyStandard)) clean[k] = r.standard[k] ?? ''
      setStandard(clean)
      setShowStandard(true)
    }
    setBreakdown(r.cost_breakdown && Object.keys(r.cost_breakdown).length ? r.cost_breakdown : null)
    setPriceHistory(r.price_history || [])
    setActivityLog(r.activity_log || [])
  }

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const errFor = (key) => fieldErrors[key]

  function toggleAllergen(aid) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(aid) ? f.allergens.filter((a) => a !== aid) : [...f.allergens, aid],
    }))
  }

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
        category: form.category || null, section: form.section || null, service_style: form.service_style || null,
        approved_by: form.approved_by || null, qa_approved_by: form.qa_approved_by || null,
        approved_at: form.approved_at || null, rating_date: form.rating_date || null,
        selling_price: form.selling_price || null, rating: form.rating || null,
        prep_time_minutes: form.prep_time_minutes || null,
        ingredients: ingredients.map((i, idx) => ({ ...i, order: idx + 1, unit: i.unit || null })),
        steps,
        standard: showStandard ? standard : null,
      }
      const saved = id ? await dishRecipes.update(id, payload) : await dishRecipes.create(payload)
      hydrate(saved)
      const warns = saved._warnings || []
      toast.success(id ? 'Recipe updated.' : 'Recipe created.')
      if (warns.length) toast.info(`${warns.length} ingredient ${warns.length === 1 ? 'line' : 'lines'} could not be costed — see the cost panel.`)
    } catch (err) {
      const { fields, message } = parseApiError(err)
      setFieldErrors(fields)
      setFormError(message)
      toast.error(message || 'Could not save the recipe.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRecalculate() {
    if (!id) return
    setRecalculating(true)
    try {
      const r = await dishRecipes.recalculate(id)
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
          {id ? form.name_en || 'Edit Recipe' : 'New Recipe'}
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

      {/* Basic info */}
      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-2 gap-4">
        <Field label="Name (English)" required error={errFor('name_en')}>
          <input className={inputClass} required value={form.name_en} onChange={(e) => setField('name_en', e.target.value)} />
        </Field>
        <Field label="Name (Arabic)" error={errFor('name_ar')}>
          <input className={inputClass} dir="rtl" value={form.name_ar} onChange={(e) => setField('name_ar', e.target.value)} />
        </Field>
        <Field label="Recipe code" help="The cook book's dish code, e.g. 1076.9" error={errFor('recipe_code')}>
          <input className={inputClass} value={form.recipe_code} onChange={(e) => setField('recipe_code', e.target.value)} />
        </Field>
        <Field label="Revision" help='e.g. "Rev.01" or "Fix"' error={errFor('revision')}>
          <input className={inputClass} value={form.revision} onChange={(e) => setField('revision', e.target.value)} />
        </Field>
        <Field label="Branch" error={errFor('branch')}>
          <input className={inputClass} placeholder="Dine" value={form.branch} onChange={(e) => setField('branch', e.target.value)} />
        </Field>
        <Field label="POS item name" error={errFor('pos_item_name')}>
          <input className={inputClass} value={form.pos_item_name} onChange={(e) => setField('pos_item_name', e.target.value)} />
        </Field>
        <Field label="Category" error={errFor('category')}>
          <select className={inputClass} value={form.category} onChange={(e) => setField('category', e.target.value)}>
            <option value="">—</option>
            {ref.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Section (kitchen station)" help="Drives the labour cost" error={errFor('section')}>
          <select className={inputClass} value={form.section} onChange={(e) => setField('section', e.target.value)}>
            <option value="">—</option>
            {ref.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Service style" error={errFor('service_style')}>
          <select className={inputClass} value={form.service_style} onChange={(e) => setField('service_style', e.target.value)}>
            <option value="">—</option>
            {ref.serviceStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Rating" error={errFor('rating')}>
            <input type="number" step="0.1" min="0" max="10" className={inputClass} value={form.rating} onChange={(e) => setField('rating', e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.rating_status} onChange={(e) => setField('rating_status', e.target.value)}>
              <option value="">—</option>
              <option value="ok">OK</option>
              <option value="attention">Attention</option>
              <option value="fix">Fix</option>
            </select>
          </Field>
          <Field label="Rated on">
            <input type="date" className={inputClass} value={form.rating_date} onChange={(e) => setField('rating_date', e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Costing inputs */}
      <section className="bg-white rounded-lg border border-stone-200 p-4 grid grid-cols-3 gap-4">
        <Field label="Selling price (KWD)" error={errFor('selling_price')}>
          <input type="number" step="0.001" className={`${inputClass} tabular-nums`} value={form.selling_price} onChange={(e) => setField('selling_price', e.target.value)} />
        </Field>
        <Field label="Prep time (minutes)" help="Labour = section salary ÷ 208 h/month × this" error={errFor('prep_time_minutes')}>
          <input type="number" className={`${inputClass} tabular-nums`} value={form.prep_time_minutes} onChange={(e) => setField('prep_time_minutes', e.target.value)} />
        </Field>
        <Field label="Expected waste %" help="A number, not a fraction — 1 = 1%" error={errFor('expected_waste_pct')}>
          <input type="number" step="0.01" className={`${inputClass} tabular-nums`} value={form.expected_waste_pct} onChange={(e) => setField('expected_waste_pct', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 col-span-3">
          <input type="checkbox" checked={form.include_labor_cost} onChange={(e) => setField('include_labor_cost', e.target.checked)} />
          Include labour cost in the per-serving total
        </label>
      </section>

      {/* Taste + allergens */}
      <section className="bg-white rounded-lg border border-stone-200 p-4 space-y-4">
        <Field label="Taste profile" error={errFor('taste_profile')}>
          <input className={inputClass} placeholder="Fresh, Tangy, Sour, Light." value={form.taste_profile} onChange={(e) => setField('taste_profile', e.target.value)} />
        </Field>
        <div>
          <span className="block text-xs font-medium text-stone-500 mb-2">Allergens</span>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {ref.allergens.map((a) => (
              <label key={a.id} className={`text-xs px-2 py-1 rounded-full border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500 ${form.allergens.includes(a.id) ? 'bg-accent-600 text-white border-accent-600' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}>
                <input type="checkbox" className="sr-only" checked={form.allergens.includes(a.id)} onChange={() => toggleAllergen(a.id)} />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      </section>

      <IngredientRows
        ingredients={ingredients} units={ref.units} items={items}
        costLines={breakdown?.lines}
        onChange={updateIngredient} onAdd={addIngredient} onRemove={removeIngredient}
      />

      <CostBreakdown
        breakdown={breakdown}
        sellingPrice={form.selling_price}
        onRecalculate={id ? handleRecalculate : null}
        recalculating={recalculating}
      />

      <StepRows steps={steps} onChange={updateStep} onAdd={addStep} onRemove={removeStep} />

      {/* Approval */}
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

      {id && <HistoryPanel costHistory={priceHistory} priceLabel="price" activityLog={activityLog} />}
    </form>
  )
}
