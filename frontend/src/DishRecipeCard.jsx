import { useEffect, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { primaryButtonClass, secondaryButtonClass, ErrorState, Spinner } from './RecipeFormFields'

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex justify-between py-1 text-sm border-b border-stone-100 last:border-0">
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-900 text-right tabular-nums">{value}</span>
    </div>
  )
}

export default function DishRecipeCard({ recipeId, onBack, onEdit }) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    dishRecipes.get(recipeId).then(setR).catch(() => setError('Could not load recipe.'))
  }

  useEffect(load, [recipeId])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!r) return <Spinner />

  const s = r.standard

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className={`${secondaryButtonClass} mb-1`}>← Back</button>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">{r.name_en}</h1>
          {r.name_ar && <p className="text-stone-500" dir="rtl">{r.name_ar}</p>}
        </div>
        <button onClick={() => onEdit(r.id)} className={primaryButtonClass}>
          Edit Recipe
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Dish data</h2>
          <Row label="Branch" value={r.branch} />
          <Row label="Category" value={r.category?.name} />
          <Row label="Section" value={r.section?.name} />
          <Row label="Service style" value={r.service_style?.name} />
          <Row label="POS name" value={r.pos_item_name} />
          <Row label="Rating" value={r.rating != null ? `${r.rating}/10` : null} />
          <Row label="Version" value={`v${r.version}${r.is_current ? ' (current)' : ''}`} />
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Cost</h2>
          <Row label="Selling price (KWD)" value={r.selling_price} />
          <Row label="Cost (KWD)" value={r.cost} />
          <Row label="Food cost %" value={r.food_cost_pct != null ? `${r.food_cost_pct}%` : null} />
          <Row label="Labor cost (KWD)" value={r.include_labor_cost ? r.labor_cost : 'excluded'} />
          <Row label="Expected waste %" value={r.expected_waste_pct} />
          <Row label="Prep time (min)" value={r.prep_time_minutes} />
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Approval</h2>
          <Row label="Approved by" value={r.approved_by?.name} />
          <Row label="QA approved by" value={r.qa_approved_by?.name} />
          <Row label="Approved at" value={r.approved_at} />
          <Row label="Taste profile" value={r.taste_profile} />
          <Row label="Allergens" value={r.allergens.length ? r.allergens.map((a) => a.name).join(', ') : 'None listed'} />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Ingredients</h2>
          <ul className="text-sm space-y-1">
            {r.ingredients.map((i) => (
              <li key={i.id} className="text-stone-900">
                {i.quantity} {i.unit_detail?.code} — {i.item_name_snapshot || i.item_sku}
                {i.prep_note && <span className="text-stone-400"> ({i.prep_note})</span>}
              </li>
            ))}
            {r.ingredients.length === 0 && <li className="text-stone-400">No ingredients listed.</li>}
          </ul>
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Steps</h2>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            {r.steps.map((step) => <li key={step.id} className="text-stone-900">{step.instruction}</li>)}
            {r.steps.length === 0 && <li className="text-stone-400 list-none">No steps listed.</li>}
          </ol>
        </section>
      </div>

      {s && (
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">QA / QC Dish Standard</h2>
          <div className="grid grid-cols-3 gap-x-6">
            <div>
              <Row label="Portion weight (g)" value={s.portion_weight_g} />
              <Row label="Serving temp (°C)" value={s.serving_temp_c} />
              <Row label="Holding time (min)" value={s.holding_time_minutes} />
              <Row label="Appearance" value={s.appearance} />
              <Row label="Color" value={s.color} />
            </div>
            <div>
              <Row label="Aroma" value={s.aroma} />
              <Row label="Texture" value={s.texture} />
              <Row label="Presentation" value={s.presentation} />
              <Row label="Primary flavor" value={s.primary_flavor} />
              <Row label="Secondary flavor" value={s.secondary_flavor} />
            </div>
            <div>
              {['sweetness', 'saltiness', 'sourness', 'bitterness', 'umami', 'spice', 'richness', 'smokiness'].map((k) => (
                s[`${k}_target`] != null && (
                  <Row key={k} label={k[0].toUpperCase() + k.slice(1)} value={`${s[`${k}_target`]} ±${s[`${k}_tolerance`] ?? 0}`} />
                )
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
