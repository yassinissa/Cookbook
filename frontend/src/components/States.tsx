import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import { cn } from '@/lib/cn'

/* ── skeleton ──────────────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-sunken',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-black/[0.04] after:to-transparent',
        'dark:after:via-white/[0.04]',
        className,
      )}
      aria-hidden="true"
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/* ── empty ─────────────────────────────────────────────────────────── */
export function EmptyState({
  icon = 'dish',
  title,
  body,
  action,
}: {
  icon?: IconName
  title: string
  body?: string
  action?: { label: string; onClick: () => void; icon?: IconName }
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-hairline-strong bg-surface px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-subtle">{body}</p>}
      {action && (
        <Button variant="primary" size="sm" icon={action.icon} className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/* ── error ─────────────────────────────────────────────────────────── */
export function ErrorState({
  title = 'Could not load this',
  body,
  onRetry,
}: {
  title?: string
  body?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-danger-subtle bg-danger-subtle px-4 py-3.5">
      <Icon name="alert" size={18} className="mt-0.5 flex-none text-danger-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger-ink">{title}</p>
        {body && <p className="mt-0.5 text-sm text-danger-ink/90">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry} className="flex-none">
          Retry
        </Button>
      )}
    </div>
  )
}

/* ── inline loader (only where a skeleton doesn't fit) ─────────────── */
export function LoadingRow({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-subtle">
      <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  )
}
