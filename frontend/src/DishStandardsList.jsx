import { useEffect, useMemo, useState } from 'react'
import { dishRecipes } from './lib/cookbookApi'
import { ErrorState, EmptyState, RatingPill, Spinner } from './RecipeFormFields'

/*
 * QA / QC standards browser — every dish that has a Dish Standard. Opens the
 * recipe card, which carries the full sensory spec + taste-target bars.
 */
export default function DishStandardsList({ onOpen }) {
  const [recipes, setRecipes] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    dishRecipes.list()
      .then((data) => setRecipes(data.results ?? data))
      .catch(() => setError('Could not load recipes.'))
  }
  useEffect(load, [])

  const withStandard = useMemo(
    () => (recipes || []).filter((r) => r.has_standard),
    [recipes],
  )
  const without = useMemo(
    () => (recipes || []).filter((r) => !r.has_standard),
    [recipes],
  )

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!recipes) return <Spinner />
  if (withStandard.length === 0) {
    return (
      <EmptyState
        message="No dishes have a QA/QC standard yet. Open a dish and tick “Include QA/QC Dish Standard” to add one."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto bg-white rounded-lg border border-stone-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-stone-100 text-stone-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Dish</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Section</th>
              <th className="text-right px-4 py-2">Rating</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {withStandard.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-2 text-stone-900">
                  {r.name_en}
                  {r.recipe_code && <span className="text-xs text-stone-400 tabular-nums"> #{r.recipe_code}</span>}
                </td>
                <td className="px-4 py-2 text-stone-500">{r.category_name}</td>
                <td className="px-4 py-2 text-stone-500">{r.section_name}</td>
                <td className="px-4 py-2 text-right"><RatingPill status={r.rating_status} rating={r.rating} /></td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => onOpen(r.id)}
                          className="text-sm text-stone-600 hover:text-stone-900 rounded focus:outline-none focus:ring-2 focus:ring-accent-500">
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {without.length > 0 && (
        <p className="text-sm text-stone-400">
          {without.length} {without.length === 1 ? 'dish has' : 'dishes have'} no standard yet.
        </p>
      )}
    </div>
  )
}
