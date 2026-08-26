import { foodCostBand, type FoodCostBand } from '@/lib/format'
import { cn } from '@/lib/cn'

const BAND: Record<FoodCostBand, { bar: string; text: string; mark: string; key: string }> = {
  healthy: { bar: 'bg-success', text: 'text-success-ink', mark: '✓', key: 'cost.band.healthy' },
  watch: { bar: 'bg-warning', text: 'text-warning-ink', mark: '~', key: 'cost.band.watch' },
  high: { bar: 'bg-danger', text: 'text-danger-ink', mark: '!', key: 'cost.band.high' },
}

interface MeterProps {
  /** food-cost % */
  value: number | null
  target?: number
  /** localised band label: healthy / watch / high */
  bandLabel?: (band: FoodCostBand) => string
  showTarget?: boolean
  size?: 'sm' | 'md'
}

/** Food-cost meter — bar + named band (never colour alone) + target marker. */
export function Meter({ value, target = 30, bandLabel, showTarget = true, size = 'md' }: MeterProps) {
  const band = foodCostBand(value)
  if (value === null || band === null) {
    return <span className="text-sm text-ink-subtle">—</span>
  }
  const meta = BAND[band]
  const width = Math.min(Math.max(value, 0), 100)

  return (
    <div className={cn('w-full', size === 'sm' ? 'space-y-1' : 'space-y-1.5')}>
      {size === 'md' && (
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            Food cost
          </span>
          <span className={cn('tnum text-sm font-semibold', meta.text)}>
            <span aria-hidden="true" className="inline-block w-4 text-center">
              {meta.mark}
            </span>
            {value.toFixed(1)}% · {bandLabel ? bandLabel(band) : band}
          </span>
        </div>
      )}
      <div className="relative">
        <div
          className={cn(
            'overflow-hidden rounded-full bg-surface-sunken',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', meta.bar)}
            style={{ width: `${width}%` }}
          />
        </div>
        {showTarget && (
          <div
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-hairline-strong"
            style={{ insetInlineStart: `${target}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      {size === 'sm' && (
        <span className={cn('tnum text-xs font-semibold', meta.text)}>{value.toFixed(1)}%</span>
      )}
    </div>
  )
}

/** Just the coloured, labelled % — for dense table cells. */
export function FoodCostValue({ value }: { value: number | string | null | undefined }) {
  const n = value === null || value === undefined || value === '' ? null : Number(value)
  const band = foodCostBand(n)
  if (n === null || band === null) return <span className="text-ink-subtle">—</span>
  const meta = BAND[band]
  return (
    <span className={cn('tnum font-medium', meta.text)}>
      <span aria-hidden="true" className="me-0.5">
        {meta.mark}
      </span>
      {n.toFixed(1)}%
    </span>
  )
}
