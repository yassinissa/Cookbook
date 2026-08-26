import type { ReactNode } from 'react'

import { Icon, type IconName } from './Icon'
import { cn } from '@/lib/cn'
import type { RatingStatus } from '@/types/api'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-hairline-strong',
  accent: 'bg-accent-subtle text-accent-ink border-transparent',
  success: 'bg-success-subtle text-success-ink border-transparent',
  warning: 'bg-warning-subtle text-warning-ink border-transparent',
  danger: 'bg-danger-subtle text-danger-ink border-transparent',
}

export function Pill({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: ReactNode
  tone?: Tone
  icon?: IconName
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium',
        toneClass[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

const RATING_TONE: Record<Exclude<RatingStatus, ''>, { tone: Tone; icon: IconName; label: string }> = {
  ok: { tone: 'success', icon: 'check', label: 'OK' },
  attention: { tone: 'warning', icon: 'warning', label: 'Review' },
  fix: { tone: 'danger', icon: 'alert', label: 'Fix' },
}

export function RatingPill({
  status,
  rating,
}: {
  status?: RatingStatus | null
  rating?: string | number | null
}) {
  const hasRating = rating !== null && rating !== undefined && rating !== ''
  if (!status && !hasRating) return null
  const meta = status ? RATING_TONE[status as Exclude<RatingStatus, ''>] : null
  return (
    <Pill tone={meta?.tone ?? 'neutral'} icon={meta?.icon}>
      {hasRating && <span className="tnum font-semibold">{rating}</span>}
      {meta && <span>{meta.label}</span>}
    </Pill>
  )
}
