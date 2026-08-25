import { useEffect, useState } from 'react'
import { productionRecipes } from './lib/cookbookApi'

export default function ProductionRecipeList({ onNew, onEdit }) {
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')

  function load() {
    productionRecipes.list()
      .then((data) => setRecipes(data.results ?? data))
      .catch(() => setError('Could not load production recipes.'))
  }

  useEffect(load, [])

  async function handleDelete(id) {
    if (!confirm('Delete this recipe?')) return
    await productionRecipes.remove(id)
    load()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onNew} className="bg-stone-900 text-white text-sm px-4 py-2 rounded-md hover:bg-stone-800">
          + New Production Recipe
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!recipes && !error && <p className="text-stone-500">Loading…</p>}
      {recipes && recipes.length === 0 && (
        <p className="text-stone-500">No production recipes yet.</p>
      )}

      {recipes && recipes.length > 0 && (
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
            {recipes.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-stone-900">{r.name_en}</td>
                <td className="px-4 py-2 text-stone-500">{r.prep_kitchen}</td>
                <td className="px-4 py-2 text-stone-500">{r.section_name}</td>
                <td className="px-4 py-2 text-right text-stone-900">{r.output_qty} {r.output_unit_code}</td>
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
  )
}
