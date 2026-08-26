import type { ReactNode } from 'react'

import { Sparkline } from './Charts'
import { CountUp } from './CountUp'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'good' | 'warn'

const valueTone: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-success-ink',
  warn: 'text-warning-ink',
}

function Rail({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute inset-y-0 start-0 w-[3px]',
        tone === 'warn' ? 'bg-spice-1' : 'spice-rail',
      )}
    />
  )
}

/*
 * Instrument tile — a single headline metric read like a gauge, not a label.
 * The figure is set in the mono face and counts up on mount; the spice rail on
 * the leading edge turns solid sumac when `tone` is `warn` so a number that
 * needs eyes announces itself before you read it.
 *
 * `featured` renders wide: label + figure on the leading side, a full-height
 * trend on the trailing side — the one metric the whole page is about.
 */
export function Stat({
  label,
  value,
  decimals = 0,
  suffix = '',
  spark,
  sparkTone = 'accent',
  note,
  tone = 'neutral',
  featured = false,
  className,
}: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  spark?: number[]
  sparkTone?: 'accent' | 'positive'
  note?: ReactNode
  tone?: Tone
  featured?: boolean
  className?: string
}) {
  const figure = (
    <div className="flex items-baseline gap-1">
      <span
        className={cn(
          'tnum font-mono font-medium leading-none',
          featured ? 'text-[2.75rem]' : 'text-[1.75rem]',
          valueTone[tone],
        )}
      >
        <CountUp value={value} decimals={decimals} />
      </span>
      {suffix && (
        <span
          className={cn(
            'font-mono font-medium leading-none',
            featured ? 'text-2xl' : 'text-base',
            valueTone[tone],
          )}
        >
          {suffix}
        </span>
      )}
    </div>
  )

  if (featured) {
    return (
      <div
        className={cn(
          'card-lit relative flex flex-col gap-4 overflow-hidden rounded-card border border-hairline bg-surface-raised p-5 sm:flex-row sm:items-center sm:gap-6',
          className,
        )}
      >
        <Rail tone={tone} />
        <div className="min-w-0 flex-none sm:w-52">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            {label}
          </p>
          <div className="mt-2">{figure}</div>
          {note && <p className="mt-1.5 text-xs text-ink-subtle">{note}</p>}
        </div>
        {spark && spark.length > 1 && (
          <div className="min-w-0 flex-1">
            <Sparkline points={spark} tone={sparkTone} fluid height={64} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'card-lit relative flex flex-col overflow-hidden rounded-card border border-hairline bg-surface-raised p-3.5',
        className,
      )}
    >
      <Rail tone={tone} />
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-subtle">
        {label}
      </p>
      <div className="mt-2">{figure}</div>
      {note && <p className="mt-1 text-[11px] leading-tight text-ink-subtle">{note}</p>}
    </div>
  )
}
