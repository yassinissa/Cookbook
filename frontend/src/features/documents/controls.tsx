import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** A labelled wrapper for a non-form control (segmented buttons, custom picker)
 * where `components/Field` — which clones its child to inject form ids — can't
 * be used. */
export function Ctl({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-[13px] text-ink',
        disabled && 'opacity-60',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-hairline-strong accent-[var(--accent)] disabled:opacity-50"
      />
      {label}
      {hint && <span className="text-ink-subtle">· {hint}</span>}
    </label>
  )
}

/** The card that holds a builder's option controls, above the live preview. */
export function ControlBar({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-card border border-hairline bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  )
}
