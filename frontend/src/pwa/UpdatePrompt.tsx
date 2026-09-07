import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useI18n } from '@/i18n'

/**
 * Service-worker update prompt. The SW is registered in `prompt` mode, so a new
 * build waits instead of taking over silently. We nudge it along:
 *   - re-check for an update whenever the tab regains focus (an installed PWA
 *     that only ever gets backgrounded would otherwise never check), and hourly
 *     for a tab left open;
 *   - when one is waiting, show a dismissible pill — "Reload" calls
 *     `updateSW(true)`, which activates the new SW and reloads.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function UpdatePrompt() {
  const { t } = useI18n()
  const [waiting, setWaiting] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    updateRef.current = registerSW({
      // In dev the SW is regenerated on every server tick, so `onNeedRefresh`
      // fires constantly — register it (installability still testable) but don't
      // nag. In a production build a waiting SW is a real new deploy.
      onNeedRefresh: () => {
        if (import.meta.env.PROD) setWaiting(true)
      },
      onRegisteredSW: (_url, registration) => {
        if (!registration) return
        const check = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        }
        const timer = setInterval(check, CHECK_INTERVAL_MS)
        document.addEventListener('visibilitychange', check)
        window.addEventListener('focus', check)
        // best-effort cleanup — this effect runs once for the app's lifetime
        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', check)
          window.removeEventListener('focus', check)
        }
      },
    })
  }, [])

  if (!waiting) return null

  return (
    <div
      className="fixed bottom-4 start-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg
                 border border-hairline bg-surface-raised px-3 py-2 shadow-popover
                 motion-safe:animate-toast-in rtl:translate-x-1/2"
      role="status"
    >
      <Icon name="refresh" size={16} className="flex-none text-accent-ink" />
      <p className="text-[13px] leading-snug text-ink">{t('pwa.update.body')}</p>
      <Button size="sm" variant="primary" onClick={() => updateRef.current?.(true)}>
        {t('pwa.update.reload')}
      </Button>
      <button
        type="button"
        onClick={() => setWaiting(false)}
        aria-label={t('action.close')}
        className="flex-none text-ink-subtle transition-colors hover:text-ink
                   focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  )
}
