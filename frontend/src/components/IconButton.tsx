import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { Icon, type IconName } from './Icon'
import { cn } from '@/lib/cn'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls must be labelled for screen readers. */
  label: string
  icon: IconName
  size?: number
  tone?: 'default' | 'danger'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 18, tone = 'default', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        tone === 'danger'
          ? 'text-ink-subtle hover:text-danger hover:bg-danger-subtle'
          : 'text-ink-subtle hover:text-ink hover:bg-surface-sunken',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
})
