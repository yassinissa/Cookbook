import { useId, type ReactElement, type ReactNode, cloneElement } from 'react'

import { cn } from '@/lib/cn'

interface FieldProps {
  label: string
  required?: boolean
  help?: string
  error?: string
  className?: string
  /** A single form control; it receives id / aria-describedby / aria-invalid. */
  children: ReactElement<Record<string, unknown>>
}

export function Field({ label, required, help, error, className, children }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const errId = `${id}-err`

  const control = cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errId : help ? helpId : undefined,
  })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {control}
      {help && !error && (
        <p id={helpId} className="text-xs text-ink-subtle">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

export function Fieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {legend}
      </legend>
      {description && <p className="mb-3 text-xs text-ink-subtle">{description}</p>}
      {children}
    </fieldset>
  )
}
