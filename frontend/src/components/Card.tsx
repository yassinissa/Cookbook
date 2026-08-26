import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Surface primitive. Flat by default (1px hairline, no shadow). `elevated`
 * lifts it onto the warm elevation scale with a lit top edge. `rail` runs the
 * signature spice gradient down the leading edge — 'alert' turns it solid
 * sumac to flag a card that needs eyes (e.g. a branch over food-cost target).
 */
export function Card({
  children,
  className,
  as: As = 'section',
  elevated = false,
  rail,
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
  elevated?: boolean
  rail?: 'idle' | 'alert'
}) {
  return (
    <As
      className={cn(
        'relative rounded-card border border-hairline bg-surface',
        elevated && 'card-lit bg-surface-raised',
        rail && 'overflow-hidden',
        className,
      )}
    >
      {rail && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 start-0 w-[3px]',
            rail === 'alert' ? 'bg-spice-1' : 'spice-rail',
          )}
        />
      )}
      {children}
    </As>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-hairline px-4 py-3 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-subtle">{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle',
        className,
      )}
    >
      {children}
    </h3>
  )
}
