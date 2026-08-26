import { money, secondaryButtonClass } from './RecipeFormFields'

/*
 * Renders recipe.cost_breakdown — the JSON the server computes on every save /
 * recalculate. Summary before detail: four KWD tiles, then a food-cost meter
 * with a named status (never colour alone), then any ingredient lines that
 * couldn't be costed, then the markup → price table.
 */

// food cost % bands — restaurant norm is ≤ 30 %
function band(pct) {
  if (pct == null) return null
  const n = Number(pct)
  if (n <= 30) return { key: 'good',  label: 'Healthy', mark: '✓', bar: 'bg-success-600', text: 'text-success-700' }
  if (n <= 38) return { key: 'watch', label: 'Watch',   mark: '~', bar: 'bg-warning-600', text: 'text-warning-700' }
  return { key: 'high', label: 'High', mark: '!', bar: 'bg-danger-600', text: 'text-danger-700' }
}

function Tile({ label, value, accent }) {
  return (
    <div className={`px-3 py-2 rounded-md border ${accent ? 'border-accent-300 bg-accent-50' : 'border-stone-200 bg-white'}`}>
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`tabular-nums ${accent ? 'text-lg font-semibold text-accent-800' : 'text-sm text-stone-900'}`}>
        {money(value)} <span className="text-[10px] text-stone-400 font-normal">KWD</span>
      </div>
    </div>
  )
}

export function PricingScenarios({ scenarios, sellingPrice }) {
  if (!scenarios?.length) return null
  const sp = sellingPrice ? Number(sellingPrice) : null
  // nearest scenario to the current price
  const nearest = sp == null ? -1 : scenarios.reduce(
    (best, s, i) => Math.abs(Number(s.price) - sp) < Math.abs(Number(scenarios[best].price) - sp) ? i : best, 0,
  )
  return (
    <div>
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Price at markup</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-stone-400 text-left">
            <th className="font-medium py-1">Markup</th>
            <th className="font-medium py-1 text-right">Suggested price</th>
            <th className="font-medium py-1 text-right">Food cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {scenarios.map((s, i) => (
            <tr key={s.markup} className={i === nearest ? 'bg-accent-50' : ''}>
              <td className="py-1.5 tabular-nums text-stone-500">×{s.markup}</td>
              <td className="py-1.5 tabular-nums text-right text-stone-900">{money(s.price)}</td>
              <td className="py-1.5 tabular-nums text-right text-stone-500">{Number(s.cost_pct).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sp != null && (
        <p className="text-xs text-stone-400 mt-1.5">Current price {money(sp)} KWD — highlighted row is the nearest markup.</p>
      )}
    </div>
  )
}

export default function CostBreakdown({ breakdown, sellingPrice, onRecalculate, recalculating }) {
  const bd = breakdown && Object.keys(breakdown).length ? breakdown : null

  if (!bd) {
    return (
      <section className="bg-white rounded-lg border border-stone-200 p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Cost</h2>
        <p className="text-sm text-stone-400">Save the recipe to compute its cost.</p>
      </section>
    )
  }

  const fcp = bd.food_cost_pct == null ? null : Number(bd.food_cost_pct)
  const b = band(fcp)
  const issues = bd.issues || []

  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700">Cost</h2>
        {onRecalculate && (
          <button type="button" onClick={onRecalculate} disabled={recalculating} className={secondaryButtonClass}>
            {recalculating ? 'Recalculating…' : '↻ Recalculate'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Ingredients" value={bd.items} />
        <Tile label="Waste" value={bd.waste} />
        <Tile label="Labour" value={bd.labor} />
        <Tile label="Per serving" value={bd.per_serving} accent />
      </div>

      {fcp != null && b && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Food cost</span>
            <span className={`text-sm font-medium tabular-nums ${b.text}`}>
              <span aria-hidden="true" className="inline-block w-4 text-center">{b.mark}</span>
              {fcp.toFixed(1)}% · {b.label}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-stone-100 overflow-hidden">
            <div className={`absolute inset-y-0 left-0 rounded-full ${b.bar}`}
                 style={{ width: `${Math.min(fcp, 100)}%` }} />
          </div>
          <div className="relative h-3 mt-0.5">
            {/* 30% target marker */}
            <span className="absolute -translate-x-1/2 text-[10px] text-stone-400" style={{ left: '30%' }}>▲ 30%</span>
          </div>
          {bd.revenue_pct != null && (
            <p className="text-xs text-stone-400">Gross margin {Number(bd.revenue_pct).toFixed(1)}%</p>
          )}
        </div>
      )}

      {bd.cost_per_unit != null && (
        <p className="text-sm text-stone-600">
          Cost per output unit: <span className="tabular-nums text-stone-900">{money(bd.cost_per_unit)}</span> KWD
        </p>
      )}

      {issues.length > 0 && (
        <div className="bg-warning-50 border border-warning-600/30 rounded-md p-3">
          <p className="text-xs font-semibold text-warning-700 mb-1">
            {issues.length} ingredient {issues.length === 1 ? 'line' : 'lines'} not costed
          </p>
          <ul className="text-xs text-warning-700/90 space-y-0.5">
            {issues.map((iss, i) => (
              <li key={i}><span className="font-medium tabular-nums">{iss.sku}</span> — {iss.detail || iss.status.replace('_', ' ')}</li>
            ))}
          </ul>
        </div>
      )}

      <PricingScenarios scenarios={bd.scenarios} sellingPrice={sellingPrice} />
    </section>
  )
}

/* look up a line's computed cost by SKU (for the ingredient rows) */
export function lineCostIndex(breakdown) {
  const map = {}
  for (const l of breakdown?.lines || []) {
    (map[l.sku] ||= []).push(l)
  }
  return {
    take(sku) {
      const arr = map[sku]
      return arr && arr.length ? arr.shift() : null
    },
  }
}
