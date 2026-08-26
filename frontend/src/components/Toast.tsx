import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Icon, type IconName } from './Icon'
import { cn } from '@/lib/cn'

type Variant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: Variant
}

interface ToastApi {
  (message: string, variant?: Variant): void
  success: (m: string) => void
  error: (m: string) => void
  info: (m: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const VARIANT: Record<Variant, { stripe: string; icon: IconName; iconClass: string }> = {
  success: { stripe: 'bg-success', icon: 'check', iconClass: 'text-success-ink' },
  error: { stripe: 'bg-danger', icon: 'alert', iconClass: 'text-danger-ink' },
  info: { stripe: 'bg-accent', icon: 'info', iconClass: 'text-accent-ink' },
}

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback(
    (message: string, variant: Variant = 'success') => {
      const id = ++seq
      setToasts((t) => [...t, { id, message, variant }])
      timers.current[id] = setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => {
    const fn = ((m: string, v?: Variant) => push(m, v)) as ToastApi
    fn.success = (m: string) => push(m, 'success')
    fn.error = (m: string) => push(m, 'error')
    fn.info = (m: string) => push(m, 'info')
    return fn
  }, [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 end-4"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const v = VARIANT[t.variant]
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-stretch gap-0 overflow-hidden rounded-lg border border-hairline',
                'bg-surface-raised shadow-popover motion-safe:animate-toast-in',
              )}
              onMouseEnter={() => clearTimeout(timers.current[t.id])}
              onMouseLeave={() => {
                timers.current[t.id] = setTimeout(() => dismiss(t.id), 2200)
              }}
            >
              <span className={cn('w-1 flex-none', v.stripe)} aria-hidden="true" />
              <div className="flex flex-1 items-start gap-2.5 py-2.5 ps-3">
                <Icon name={v.icon} size={16} className={cn('mt-0.5 flex-none', v.iconClass)} />
                <p className="flex-1 text-[13px] leading-snug text-ink">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="flex-none px-2.5 text-ink-subtle transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
