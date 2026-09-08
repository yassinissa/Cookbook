import { useEffect, useState } from 'react'

import { Icon } from '@/components/Icon'
import { useI18n } from '@/i18n'

/**
 * A persistent strip shown whenever the browser reports no connection. The
 * service worker (vite.config.ts) keeps serving already-loaded recipes /
 * standards / plating from cache, so the app stays readable — this just makes
 * the state honest so nobody trusts a stale figure or wonders why a save
 * failed. Writes surface `pwa.offline.saveBlocked` via parseApiError.
 */
export function OfflineBanner() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  )

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2
                 border-b border-warning bg-warning-subtle px-4 py-1.5
                 text-center text-[12.5px] font-medium text-warning-ink"
      role="status"
      aria-live="polite"
    >
      <Icon name="warning" size={14} className="flex-none" />
      <span>{t('pwa.offline.banner')}</span>
    </div>
  )
}
