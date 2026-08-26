import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export function Page({
  children,
  className,
  stagger,
}: {
  children: ReactNode
  className?: string
  /** cascade direct children in on mount (one orchestrated entrance) */
  stagger?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1160px] px-4 py-6 sm:px-6 lg:px-8',
        stagger && 'stagger',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[1.7rem] font-medium tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-subtle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </header>
  )
}

/* Button-group filter — for small, known value sets (per premium-ui). */
export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
            value === o.value
              ? 'bg-accent text-white'
              : 'border border-hairline-strong bg-surface text-ink-muted hover:bg-surface-sunken',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Bilingual name — English primary, Arabic secondary in its own direction. */
export function BiName({
  en,
  ar,
  className,
  arClassName,
}: {
  en: string
  ar?: string
  className?: string
  arClassName?: string
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className="text-ink">{en}</span>
      {ar && (
        <span dir="rtl" className={cn('text-xs text-ink-subtle', arClassName)}>
          {ar}
        </span>
      )}
    </span>
  )
}
