import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from './Button'
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

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button aria-label={t('action.cancel')} onClick={onCancel} className="absolute inset-0 bg-[var(--overlay)] motion-safe:animate-overlay-in" />
      <div className="relative z-10 w-full max-w-sm rounded-card border border-hairline bg-surface-raised p-5 shadow-modal motion-safe:animate-fade-rise">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <div className="mt-2 text-sm text-ink-muted">{body}</div>
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
