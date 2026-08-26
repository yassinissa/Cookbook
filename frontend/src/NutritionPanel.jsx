/*
 * Per-serving nutrition — the sum of each ingredient's ItemNutrition scaled to
 * the amount used. `coverage` says how many ingredients actually had data, so a
 * partial rollup is never mistaken for a complete one.
 */
const ROWS = [
  ['calories', 'Calories', 'السعرات الحرارية', 'kcal'],
  ['fat_g', 'Fat', 'الدهون', 'g'],
  ['saturated_fat_g', 'Saturated fat', 'الدهون المشبعة', 'g'],
  ['trans_fat_g', 'Trans fat', 'الدهون المتحولة', 'g'],
  ['cholesterol_mg', 'Cholesterol', 'الكوليسترول', 'mg'],
  ['sodium_mg', 'Sodium', 'الصوديوم', 'mg'],
  ['carbs_g', 'Carbohydrate', 'الكربوهيدرات', 'g'],
  ['fibers_g', 'Fibre', 'الألياف', 'g'],
  ['sugars_g', 'Sugars', 'السكريات', 'g'],
  ['added_sugars_g', 'Added sugars', 'السكر المضاف', 'g'],
  ['protein_g', 'Protein', 'البروتين', 'g'],
]

function fmt(v) {
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n < 10 ? n.toFixed(2) : Math.round(n).toString()
}

export default function NutritionPanel({ nutrition }) {
  const n = nutrition && Object.keys(nutrition).length ? nutrition : null
  const cov = n?._coverage

  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Nutrition <span className="font-normal text-stone-400">· per serving</span></h2>
        {cov && (
          <span className={`text-xs ${cov.covered < cov.total ? 'text-warning-700' : 'text-stone-400'}`}>
            {cov.covered} / {cov.total} ingredients have data
          </span>
        )}
      </div>
      {!n ? (
        <p className="text-sm text-stone-400">Save the recipe to compute nutrition.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {ROWS.map(([key, en, ar, unit]) => (
              <tr key={key}>
                <td className="py-1.5 text-stone-700">
                  {en} <span className="text-stone-400 text-xs" dir="rtl">{ar}</span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-stone-900">
                  {fmt(n[key])} <span className="text-stone-400 text-xs">{unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function AllergenPanel({ rollup }) {
  if (!rollup) return null
  const all = rollup.all || []
  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <h2 className="text-sm font-semibold text-stone-700 mb-3">Allergens</h2>
      {all.length === 0 ? (
        <p className="text-sm text-stone-400">None tagged. Add them on the dish or on an ingredient's item page.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {all.map((a) => (
              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-danger-50 text-danger-700 border border-danger-600/40">{a}</span>
            ))}
          </div>
          {rollup.from_ingredients?.length > 0 && (
            <ul className="text-xs text-stone-500 space-y-0.5">
              {rollup.from_ingredients.map((i) => (
                <li key={i.sku}>
                  <span className="text-stone-700">{i.name}</span>
                  <span className="text-stone-300 tabular-nums"> {i.sku}</span> — {i.allergens.join(', ')}
                </li>
              ))}
            </ul>
          )}
          {rollup.dish?.length > 0 && (
            <p className="text-xs text-stone-400 mt-2">Tagged on the dish: {rollup.dish.join(', ')}</p>
          )}
        </>
      )}
    </section>
  )
}
