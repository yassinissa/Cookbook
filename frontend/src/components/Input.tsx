import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/lib/cn'

const field =
  'w-full rounded-lg border bg-surface text-ink placeholder:text-ink-subtle ' +
  'transition-colors duration-150 ' +
  'focus:outline-none focus-visible:outline-none focus:border-accent ' +
  'focus:ring-2 focus:ring-[var(--focus)] focus:ring-offset-0 ' +
  'disabled:opacity-60 disabled:bg-surface-sunken ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger'

const sizing = 'h-10 px-3 text-sm'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...rest }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(field, sizing, type === 'number' && 'tnum text-end', className)}
        {...rest}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(field, 'px-3 py-2 text-sm leading-relaxed', className)}
        {...rest}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(field, sizing, 'appearance-none pe-9 cursor-pointer', className)}
          {...rest}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    )
  },
)
