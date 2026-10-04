import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { useI18n } from '@/i18n'

/**
 * Service-worker updates. The SW is registered in `prompt` mode so *we* decide
 * when a new build takes over — and the answer is "straight away, unless
 * someone is in the middle of typing something":
 *   - re-check for an update whenever the tab regains focus (an installed PWA
 *     that only ever gets backgrounded would otherwise never check), and hourly
 *     for a tab left open;
 *   - when one is waiting, apply it (`updateSW(true)` activates the new SW and
 *     reloads) — a kitchen iPad should never sit on last week's build waiting
 *     for a cook to notice a pill;
 *   - except on an editor route or with a drawer/dialog open, where a reload
 *     would throw away unsaved work: there the dismissible "Reload" pill shows
 *     instead, and the update applies itself the next time the app is
 *     backgrounded or re-opened somewhere safe.
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/** A reload right now could lose something the user is in the middle of. */
function midEdit() {
  return (
    /\/(new|edit|plating)\/?$/.test(window.location.pathname) ||
    document.querySelector('[role="dialog"]') !== null
  )
}

export function UpdatePrompt() {
  const { t } = useI18n()
  const [waiting, setWaiting] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined)
  const pendingRef = useRef(false)

  useEffect(() => {
    const applyOrPrompt = () => {
      if (!pendingRef.current) return
      if (midEdit()) setWaiting(true)
      else updateRef.current?.(true)
    }
    // a deferred update gets another go whenever the app is left or returned to
    document.addEventListener('visibilitychange', applyOrPrompt)

    updateRef.current = registerSW({
      // In dev the SW is regenerated on every server tick, so `onNeedRefresh`
      // fires constantly — register it (installability still testable) but don't
      // nag. In a production build a waiting SW is a real new deploy.
      onNeedRefresh: () => {
        if (!import.meta.env.PROD) return
        pendingRef.current = true
        applyOrPrompt()
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
      <IconButton
        label={t('action.close')}
        icon="close"
        size={15}
        className="-me-1.5 flex-none"
        onClick={() => setWaiting(false)}
      />
    </div>
  )
}
