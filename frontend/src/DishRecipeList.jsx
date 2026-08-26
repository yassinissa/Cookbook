import { useEffect, useMemo, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { primaryButtonClass, dangerLinkClass, ErrorState, EmptyState, RatingPill, Spinner, money } from './RecipeFormFields'
import { useToast } from './Toast'
import { parseApiError } from './lib/parseApiError'

function foodCostPct(r) {
  const fcp = r.cost_breakdown?.food_cost_pct
  if (fcp != null) return Number(fcp)
  if (r.selling_price && Number(r.selling_price) > 0) return (Number(r.cost) / Number(r.selling_price)) * 100
  return null
}

function FoodCostCell({ r }) {
  const p = foodCostPct(r)
  if (p == null) return <span className="text-stone-300">—</span>
  const cls = p <= 30 ? 'text-success-700' : p <= 38 ? 'text-warning-700' : 'text-danger-700'
  return <span className={`tabular-nums ${cls}`}>{p.toFixed(1)}%</span>
}

export default function DishRecipeList({ onNew, onEdit, onView }) {
  const toast = useToast()
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  function load() {
    setError('')
    dishRecipes.list()
      .then((data) => setRecipes(data.results ?? data))
      .catch(() => setError('Could not load recipes.'))
  }

  useEffect(load, [])

  const branches = useMemo(() => {
    if (!recipes) return []
    return [...new Set(recipes.map((r) => r.branch).filter(Boolean))].sort()
  }, [recipes])

  const visible = useMemo(() => {
    if (!recipes) return []
    if (branchFilter === 'all') return recipes
    return recipes.filter((r) => r.branch === branchFilter)
  }, [recipes, branchFilter])

  async function handleDelete(recipe) {
    if (!confirm(`Delete “${recipe.name_en}”? This cannot be undone.`)) return
    try {
      await dishRecipes.remove(recipe.id)
      toast.success(`“${recipe.name_en}” deleted.`)
      load()
    } catch (err) {
      toast.error(parseApiError(err).message || 'Could not delete the recipe.')
    }
  }

  function filterButtonClass(active) {
    return `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 ${
      active ? 'bg-accent-600 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
    }`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <button onClick={() => setBranchFilter('all')} className={filterButtonClass(branchFilter === 'all')}>
            All branches
          </button>
          {branches.map((b) => (
            <button key={b} onClick={() => setBranchFilter(b)} className={filterButtonClass(branchFilter === b)}>
              {b}
            </button>
          ))}
        </div>
        <button onClick={onNew} className={primaryButtonClass}>+ New Recipe</button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!recipes && !error && <Spinner />}

      {recipes && visible.length === 0 && (
        <EmptyState
          message={`No recipes ${branchFilter !== 'all' ? `for ${branchFilter}` : 'yet'}.`}
          actionLabel="+ New Recipe"
          onAction={onNew}
        />
      )}

      {recipes && visible.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-lg border border-stone-200">
        <table className="w-full min-w-[720px]">
          <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-right px-4 py-2">Price</th>
              <th className="text-right px-4 py-2">Cost</th>
              <th className="text-right px-4 py-2">Food cost</th>
              <th className="text-right px-4 py-2">Items</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-900">{r.name_en}</span>
                    <RatingPill status={r.rating_status} rating={r.rating} />
                  </div>
                  {r.recipe_code && <span className="text-xs text-stone-400 tabular-nums">#{r.recipe_code}</span>}
                </td>
                <td className="px-4 py-2 text-stone-500">{r.category_name}</td>
                <td className="px-4 py-2 text-right text-stone-900 tabular-nums">{money(r.selling_price)}</td>
                <td className="px-4 py-2 text-right text-stone-500 tabular-nums">{money(r.cost)}</td>
                <td className="px-4 py-2 text-right"><FoodCostCell r={r} /></td>
                <td className="px-4 py-2 text-right text-stone-500 tabular-nums">{r.ingredient_count}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onView(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">View</button>
                  <button onClick={() => onEdit(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">Edit</button>
                  <button onClick={() => handleDelete(r)} className={dangerLinkClass}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
