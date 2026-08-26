import { useEffect, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { primaryButtonClass, secondaryButtonClass, ErrorState, RatingPill, Spinner, money } from './RecipeFormFields'
import CostBreakdown, { lineCostIndex } from './CostBreakdown'
import NutritionPanel, { AllergenPanel } from './NutritionPanel'
import { TasteAxisBar, TASTE_AXES } from './TasteAxis'
import { useToast } from './Toast'
import { parseApiError } from './lib/parseApiError'

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
  const toast = useToast()
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [recalculating, setRecalculating] = useState(false)

  function load() {
    setError('')
    dishRecipes.get(recipeId).then(setR).catch(() => setError('Could not load recipe.'))
  }

  useEffect(load, [recipeId])

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const updated = await dishRecipes.recalculate(recipeId)
      setR((cur) => ({ ...cur, ...updated }))
      toast.success('Cost recalculated.')
    } catch (err) {
      toast.error(parseApiError(err).message || 'Recalculate failed.')
    } finally {
      setRecalculating(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!r) return <Spinner />

  const s = r.standard
  const costs = lineCostIndex(r.cost_breakdown)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className={`${secondaryButtonClass} mb-1`}>← Back</button>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">{r.name_en}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {r.name_ar && <p className="text-stone-500" dir="rtl">{r.name_ar}</p>}
            {r.recipe_code && <span className="text-xs text-stone-400 tabular-nums">#{r.recipe_code}</span>}
            <RatingPill status={r.rating_status} rating={r.rating} />
          </div>
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
          <Row label="Revision" value={r.revision} />
          <Row label="Version" value={`v${r.version}${r.is_current ? ' (current)' : ''}`} />
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4 col-span-2">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Approval &amp; taste</h2>
          <Row label="Approved by" value={r.approved_by?.name} />
          <Row label="QA approved by" value={r.qa_approved_by?.name} />
          <Row label="Approved at" value={r.approved_at} />
          <Row label="Taste profile" value={r.taste_profile} />
          <Row label="Allergens" value={r.allergens.length ? r.allergens.map((a) => a.name).join(', ') : 'None listed'} />
        </section>
      </div>

      <CostBreakdown
        breakdown={r.cost_breakdown}
        sellingPrice={r.selling_price}
        onRecalculate={handleRecalculate}
        recalculating={recalculating}
      />

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Ingredients</h2>
          <ul className="text-sm space-y-1">
            {r.ingredients.map((i) => {
              const lc = costs.take(i.item_sku)
              return (
                <li key={i.id} className="flex justify-between gap-2 text-stone-900">
                  <span>
                    {i.quantity} {i.unit_detail?.code} — {i.item_name_snapshot || i.item_sku}
                    {i.prep_note && <span className="text-stone-400"> ({i.prep_note})</span>}
                  </span>
                  {lc && (
                    lc.status === 'ok'
                      ? <span className="text-stone-400 tabular-nums text-xs flex-none">{money(lc.amount)}</span>
                      : <span className="text-warning-700 text-xs flex-none" title={lc.detail}>⚠ {lc.status.replace('_', ' ')}</span>
                  )}
                </li>
              )
            })}
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

      <div className="grid grid-cols-2 gap-4">
        <NutritionPanel nutrition={r.nutrition} />
        <AllergenPanel rollup={r.allergen_rollup} />
      </div>

      {s && (
        <section className="bg-white rounded-lg border border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-3">QA / QC Dish Standard</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <Row label="Branch applicability" value={s.branch_applicability} />
              <Row label="Service style" value={s.service_style} />
              <Row label="Portion weight (g)" value={s.portion_weight_g && `${s.portion_weight_g} ±${s.portion_tolerance_g ?? 0}`} />
              <Row label="Serving temp (°C)" value={s.serving_temp_c && `${s.serving_temp_c} ±${s.temp_tolerance_c ?? 0}`} />
              <Row label="Holding time (min)" value={s.holding_time_minutes} />
              <Row label="Appearance" value={s.appearance} />
              <Row label="Colour" value={s.color} />
              <Row label="Aroma" value={s.aroma} />
              <Row label="Texture" value={s.texture} />
              <Row label="Presentation" value={s.presentation} />
              <Row label="Primary flavour" value={s.primary_flavor} />
              <Row label="Secondary flavour" value={s.secondary_flavor} />
              <Row label="Aftertaste" value={s.aftertaste} />
              <Row label="Mouthfeel" value={s.mouthfeel} />
              <Row label="Freshness standard" value={s.freshness_standard} />
              <Row label="Critical defects" value={s.critical_defects_not_allowed} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Taste targets (0–10)</p>
              {TASTE_AXES.map(([key, label]) => (
                <TasteAxisBar key={key} label={label} target={s[`${key}_target`]} tolerance={s[`${key}_tolerance`]} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
