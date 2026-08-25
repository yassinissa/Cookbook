import { useEffect, useMemo, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { primaryButtonClass, dangerLinkClass, ErrorState, EmptyState, Spinner } from './RecipeFormFields'

export default function DishRecipeList({ onNew, onEdit, onView }) {
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

  async function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return
    await dishRecipes.remove(id)
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
        <table className="w-full bg-white rounded-lg border border-stone-200 overflow-hidden">
          <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Branch</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-right px-4 py-2">Price</th>
              <th className="text-right px-4 py-2">Cost</th>
              <th className="text-right px-4 py-2">Ingredients</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-2 text-stone-900">{r.name_en}</td>
                <td className="px-4 py-2 text-stone-500">{r.branch}</td>
                <td className="px-4 py-2 text-stone-500">{r.category_name}</td>
                <td className="px-4 py-2 text-right text-stone-900 tabular-nums">{r.selling_price ?? '—'}</td>
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
