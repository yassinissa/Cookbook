import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from './Button'
import { trapTab } from '@/lib/a11y'
import { useI18n } from '@/i18n'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

/** Centered confirm for destructive / irreversible actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  busy,
}: ConfirmDialogProps) {
  const { t } = useI18n()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Tab') trapTab(e, panelRef.current)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      returnFocus.current?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      <button aria-label={t('action.cancel')} onClick={onCancel} className="absolute inset-0 bg-[var(--overlay)] motion-safe:animate-overlay-in" />
      <div ref={panelRef} className="relative z-10 w-full max-w-sm rounded-card border border-hairline bg-surface-raised p-5 shadow-modal motion-safe:animate-fade-rise">
        <h2 id={titleId} className="text-sm font-semibold text-ink">{title}</h2>
        <div id={bodyId} className="mt-2 text-sm text-ink-muted">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('action.cancel')}
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
