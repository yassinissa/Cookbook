import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { IconButton } from './IconButton'
import { cn } from '@/lib/cn'
import { trapTab } from '@/lib/a11y'
import { useI18n } from '@/i18n'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: 'md' | 'lg'
  footer?: ReactNode
}

/** Right-side (start-side in RTL) slide-over. Focus-trapped, Esc to close. */
export function Drawer({ open, onClose, title, children, width = 'md', footer }: DrawerProps) {
  const { dir } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') trapTab(e, panelRef.current)
    }
    document.addEventListener('keydown', onKey)

    // Prefer the first focusable field in the body over the header's Close
    // button, so e.g. a search input gets the initial keystroke.
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const first =
      bodyRef.current?.querySelector<HTMLElement>(focusable) ??
      panelRef.current?.querySelector<HTMLElement>(focusable)
    first?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      returnFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)] motion-safe:animate-overlay-in"
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 ms-auto flex h-full w-full flex-col bg-surface shadow-modal',
          width === 'md' ? 'max-w-md' : 'max-w-2xl',
          dir === 'rtl'
            ? 'motion-safe:animate-[drawer-in-rtl_200ms_ease-out]'
            : 'motion-safe:animate-[drawer-in-ltr_200ms_ease-out]',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-ink">{title}</h2>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </header>
        <div ref={bodyRef} className="scroll-x flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-hairline px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
