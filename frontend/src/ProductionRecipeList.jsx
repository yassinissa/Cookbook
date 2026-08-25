import { useEffect, useMemo, useState } from 'react'
import { productionRecipes } from './lib/cookbookApi'
import { primaryButtonClass, dangerLinkClass, ErrorState, EmptyState, Spinner } from './RecipeFormFields'

export default function ProductionRecipeList({ onNew, onEdit, onView }) {
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')
  const [kitchenFilter, setKitchenFilter] = useState('all')

  function load() {
    setError('')
    productionRecipes.list()
      .then((data) => setRecipes(data.results ?? data))
      .catch(() => setError('Could not load production recipes.'))
  }

  useEffect(load, [])

  const kitchens = useMemo(() => {
    if (!recipes) return []
    return [...new Set(recipes.map((r) => r.prep_kitchen).filter(Boolean))].sort()
  }, [recipes])

  const visible = useMemo(() => {
    if (!recipes) return []
    if (kitchenFilter === 'all') return recipes
    return recipes.filter((r) => r.prep_kitchen === kitchenFilter)
  }, [recipes, kitchenFilter])

  async function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return
    await productionRecipes.remove(id)
    load()
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
          <button onClick={() => setKitchenFilter('all')} className={filterButtonClass(kitchenFilter === 'all')}>
            All kitchens
          </button>
          {kitchens.map((k) => (
            <button key={k} onClick={() => setKitchenFilter(k)} className={filterButtonClass(kitchenFilter === k)}>
              {k}
            </button>
          ))}
        </div>
        <button onClick={onNew} className={primaryButtonClass}>+ New Production Recipe</button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!recipes && !error && <Spinner />}

      {recipes && visible.length === 0 && (
        <EmptyState
          message={`No production recipes ${kitchenFilter !== 'all' ? `for ${kitchenFilter}` : 'yet'}.`}
          actionLabel="+ New Production Recipe"
          onAction={onNew}
        />
      )}

      {recipes && visible.length > 0 && (
        <table className="w-full bg-white rounded-lg border border-stone-200 overflow-hidden">
          <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Prep kitchen</th>
              <th className="text-left px-4 py-2">Section</th>
              <th className="text-right px-4 py-2">Output</th>
              <th className="text-right px-4 py-2">Cost</th>
              <th className="text-right px-4 py-2">Ingredients</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-2 text-stone-900">{r.name_en}</td>
                <td className="px-4 py-2 text-stone-500">{r.prep_kitchen}</td>
                <td className="px-4 py-2 text-stone-500">{r.section_name}</td>
                <td className="px-4 py-2 text-right text-stone-900 tabular-nums">{r.output_qty} {r.output_unit_code}</td>
                <td className="px-4 py-2 text-right text-stone-500 tabular-nums">{r.cost}</td>
                <td className="px-4 py-2 text-right text-stone-500 tabular-nums">{r.ingredient_count}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onView(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">View</button>
                  <button onClick={() => onEdit(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">Edit</button>
                  <button onClick={() => handleDelete(r.id)} className={dangerLinkClass}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
