import { Input } from './Input'
import { cn } from '@/lib/cn'

export const TASTE_AXES: [string, string, string][] = [
  ['sweetness', 'Sweetness', 'الحلاوة'],
  ['saltiness', 'Saltiness', 'الملوحة'],
  ['sourness', 'Sourness', 'الحموضة'],
  ['bitterness', 'Bitterness', 'المرارة'],
  ['umami', 'Umami', 'الأومامي'],
  ['spice', 'Spice', 'الحرارة'],
  ['richness', 'Richness', 'الدسم'],
  ['smokiness', 'Smokiness', 'التدخين'],
]

/** Read-only: a 0–10 track with the target dot and the ± tolerance band shaded. */
export function TasteAxisBar({
  label,
  target,
  tolerance,
}: {
  label: string
  target: string | number | null | undefined
  tolerance: string | number | null | undefined
}) {
  const t = Number(target)
  if (target === null || target === undefined || target === '' || Number.isNaN(t)) return null
  const tol = Number(tolerance) || 0
  const lo = Math.max(0, t - tol)
  const hi = Math.min(10, t + tol)
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 flex-none text-ink-muted">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-surface-sunken">
        <div
          className="absolute inset-y-0 rounded-full bg-accent-subtle-hover"
          style={{ insetInlineStart: `${lo * 10}%`, width: `${(hi - lo) * 10}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-surface bg-accent"
          style={{ insetInlineStart: `${t * 10}%` }}
        />
      </div>
      <span className="tnum w-16 flex-none text-end text-ink">
        {t.toFixed(1)}
        <span className="text-ink-subtle"> ±{tol.toFixed(1)}</span>
      </span>
    </div>
  )
}

/** Edit: paired target / tolerance inputs. */
export function TasteAxisInput({
  label,
  target,
  tolerance,
  onTarget,
  onTolerance,
  className,
}: {
  label: string
  target: string
  tolerance: string
  onTarget: (v: string) => void
  onTolerance: (v: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-[1fr_5rem_5rem] items-center gap-2', className)}>
      <span className="text-[13px] text-ink-muted">{label}</span>
      <Input
        type="number"
        step="0.1"
        min="0"
        max="10"
        placeholder="target"
        className="h-9"
        value={target}
        onChange={(e) => onTarget(e.target.value)}
      />
      <Input
        type="number"
        step="0.1"
        min="0"
        placeholder="± tol"
        className="h-9"
        value={tolerance}
        onChange={(e) => onTolerance(e.target.value)}
      />
    </div>
  )
}
