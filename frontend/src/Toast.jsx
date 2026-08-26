import { createContext, useCallback, useContext, useRef, useState } from 'react'

/*
 * Minimal toast system — no library. Bottom-right stack, auto-dismiss after 4s
 * (paused while hovered), manually dismissible. Semantic colours from the
 * Tailwind tokens; a left severity stripe so the variant reads without relying
 * on colour alone.
 */

const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const VARIANTS = {
  success: { stripe: 'bg-success-600', icon: '✓', iconColor: 'text-success-700' },
  error:   { stripe: 'bg-danger-600',  icon: '!', iconColor: 'text-danger-700' },
  info:    { stripe: 'bg-stone-400',   icon: 'i', iconColor: 'text-stone-600' },
}

let seq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback((message, variant = 'success') => {
    const id = ++seq
    setToasts((t) => [...t, { id, message, variant }])
    timers.current[id] = setTimeout(() => dismiss(id), 4000)
    return id
  }, [dismiss])

  const toast = useCallback((message, variant) => push(message, variant), [push])
  toast.success = (m) => push(m, 'success')
  toast.error = (m) => push(m, 'error')
  toast.info = (m) => push(m, 'info')

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
           role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => {
          const v = VARIANTS[t.variant] || VARIANTS.info
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden
                         motion-safe:animate-[toastin_180ms_ease-out]"
              onMouseEnter={() => clearTimeout(timers.current[t.id])}
              onMouseLeave={() => { timers.current[t.id] = setTimeout(() => dismiss(t.id), 2500) }}
            >
              <span className={`w-1 self-stretch flex-none ${v.stripe}`} aria-hidden="true" />
              <span className={`mt-2.5 flex-none w-4 h-4 rounded-full border text-[10px] font-bold flex items-center justify-center ${v.iconColor}`}
                    aria-hidden="true">{v.icon}</span>
              <p className="py-2.5 text-sm text-stone-800 flex-1 break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="p-2 text-stone-400 hover:text-stone-700 transition-colors rounded
                           focus:outline-none focus:ring-2 focus:ring-accent-500"
              >✕</button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
