import { useEffect, useMemo, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'

export default function DishRecipeList({ onNew, onEdit, onView }) {
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  function load() {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-md ${branchFilter === 'all' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
          >
            All branches
          </button>
          {branches.map((b) => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-3 py-1.5 text-sm rounded-md ${branchFilter === b ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
            >
              {b}
            </button>
          ))}
        </div>
        <button onClick={onNew} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-md hover:bg-stone-800">
          + New Recipe
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!recipes && !error && <p className="text-stone-500">Loading…</p>}

      {recipes && visible.length === 0 && (
        <p className="text-stone-500">No recipes {branchFilter !== 'all' ? `for ${branchFilter}` : 'yet'}.</p>
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
              <tr key={r.id}>
                <td className="px-4 py-2 text-stone-900">{r.name_en}</td>
                <td className="px-4 py-2 text-stone-500">{r.branch}</td>
                <td className="px-4 py-2 text-stone-500">{r.category_name}</td>
                <td className="px-4 py-2 text-right text-stone-900">{r.selling_price ?? '—'}</td>
                <td className="px-4 py-2 text-right text-stone-500">{r.cost}</td>
                <td className="px-4 py-2 text-right text-stone-500">{r.ingredient_count}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => onView(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3">View</button>
                  <button onClick={() => onEdit(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3">Edit</button>
                  <button onClick={() => handleDelete(r.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
