import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { IconButton } from './IconButton'
import { cn } from '@/lib/cn'
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
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') trapFocus(e, panelRef.current)
    }
    document.addEventListener('keydown', onKey)

    const first = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      returnFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
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
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </header>
        <div className="scroll-x flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-hairline px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
