import { useEffect, useState } from 'react'
import { productionRecipes } from './lib/cookbookApi'
import { primaryButtonClass, secondaryButtonClass, ErrorState, Spinner } from './RecipeFormFields'
import CostBreakdown from './CostBreakdown'
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

export default function ProductionRecipeCard({ recipeId, onBack, onEdit }) {
  const toast = useToast()
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [recalculating, setRecalculating] = useState(false)

  function load() {
    setError('')
    productionRecipes.get(recipeId).then(setR).catch(() => setError('Could not load recipe.'))
  }

  useEffect(load, [recipeId])

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const updated = await productionRecipes.recalculate(recipeId)
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
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Recipe data</h2>
          <Row label="Prep kitchen" value={r.prep_kitchen} />
          <Row label="Section" value={r.section?.name} />
          <Row label="Output item SKU" value={r.output_item_sku} />
          <Row label="Output qty" value={`${r.output_qty} ${r.output_unit?.code ?? ''}`} />
          <Row label="Version" value={`v${r.version}${r.is_current ? ' (current)' : ''}`} />
        </section>

        <section className="bg-white rounded-lg border border-stone-200 p-4 col-span-2">
          <h2 className="text-sm font-semibold text-stone-700 mb-2">Approval</h2>
          <Row label="Approved by" value={r.approved_by?.name} />
          <Row label="QA approved by" value={r.qa_approved_by?.name} />
          <Row label="Approved at" value={r.approved_at} />
          <Row label="Revision" value={r.revision} />
          <Row label="Notes" value={r.notes} />
        </section>
      </div>

      <CostBreakdown
        breakdown={r.cost_breakdown}
        onRecalculate={handleRecalculate}
        recalculating={recalculating}
      />

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
    </div>
  )
}
