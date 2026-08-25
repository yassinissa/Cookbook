import { useEffect, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { logout } from './lib/auth'

export default function DishRecipeList({ onLoggedOut, onNew, onEdit, onOpenItems }) {
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')

  function load() {
    dishRecipes.list()
      .then((data) => setRecipes(data.results ?? data))
      .catch(() => setError('Could not load recipes.'))
  }

  useEffect(load, [])

  async function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return
    await dishRecipes.remove(id)
    load()
  }

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900">Dish Recipes</h1>
          <div className="flex items-center gap-4">
            <button onClick={onOpenItems} className="text-sm text-stone-500 hover:text-stone-800">Inventory items</button>
            <button onClick={onNew} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-md hover:bg-stone-800">
              + New Recipe
            </button>
            <button onClick={() => { logout(); onLoggedOut() }} className="text-sm text-stone-500 hover:text-stone-800">
              Log out
            </button>
          </div>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {!recipes && !error && <p className="text-stone-500">Loading…</p>}

        {recipes && recipes.length === 0 && (
          <p className="text-stone-500">No recipes yet. Click "New Recipe" to create one.</p>
        )}

        {recipes && recipes.length > 0 && (
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
              {recipes.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-stone-900">{r.name_en}</td>
                  <td className="px-4 py-2 text-stone-500">{r.branch}</td>
                  <td className="px-4 py-2 text-stone-500">{r.category_name}</td>
                  <td className="px-4 py-2 text-right text-stone-900">{r.selling_price ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-stone-500">{r.cost}</td>
                  <td className="px-4 py-2 text-right text-stone-500">{r.ingredient_count}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => onEdit(r.id)} className="text-sm text-stone-600 hover:text-stone-900 mr-3">Edit</button>
                    <button onClick={() => handleDelete(r.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
