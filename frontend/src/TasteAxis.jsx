import { inputClass } from './RecipeFormFields'

export const TASTE_AXES = [
  ['sweetness', 'Sweetness'], ['saltiness', 'Saltiness'], ['sourness', 'Sourness'],
  ['bitterness', 'Bitterness'], ['umami', 'Umami'], ['spice', 'Spice'],
  ['richness', 'Richness'], ['smokiness', 'Smokiness'],
]

/* Read-only: a 0–10 track with the target marked and the ± tolerance shaded. */
export function TasteAxisBar({ label, target, tolerance }) {
  const t = Number(target)
  if (target == null || target === '' || Number.isNaN(t)) return null
  const tol = Number(tolerance) || 0
  const lo = Math.max(0, t - tol)
  const hi = Math.min(10, t + tol)
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-stone-500 flex-none">{label}</span>
      <div className="relative flex-1 h-2 rounded-full bg-stone-100">
        <div className="absolute inset-y-0 rounded-full bg-accent-200"
             style={{ left: `${lo * 10}%`, width: `${(hi - lo) * 10}%` }} />
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent-600 border-2 border-white"
              style={{ left: `${t * 10}%` }} />
      </div>
      <span className="w-16 text-right tabular-nums text-stone-900 flex-none">
        {t.toFixed(1)}<span className="text-stone-400"> ±{tol.toFixed(1)}</span>
      </span>
    </div>
  )
}

/* Edit: paired target / tolerance inputs, with the same bar as a live preview. */
export function TasteAxisInput({ label, target, tolerance, onTarget, onTolerance }) {
  return (
    <div className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2">
      <span className="text-xs text-stone-500">{label}</span>
      <input type="number" step="0.1" min="0" max="10" placeholder="target"
             className={`${inputClass} tabular-nums`} value={target} onChange={(e) => onTarget(e.target.value)} />
      <input type="number" step="0.1" min="0" placeholder="± tol"
             className={`${inputClass} tabular-nums`} value={tolerance} onChange={(e) => onTolerance(e.target.value)} />
    </div>
  )
}
