import { Outlet, useLocation } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useI18n } from '@/i18n'

export function AppShell() {
  const { t } = useI18n()
  // A kitchen guide is read off an iPad stood up at the station — give the
  // recipe the whole screen. The page's own back button returns to /kitchen,
  // where the navigation comes back.
  const { pathname } = useLocation()
  const standMode = /^\/kitchen\/(dishes|production)\//.test(pathname)
  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link no-print">
        {t('a11y.skipToContent')}
      </a>
      {!standMode && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main-content" className={standMode ? 'flex-1' : 'flex-1 pb-16 lg:pb-0'}>
          <Outlet />
        </main>
      </div>
      {!standMode && <BottomNav />}
    </div>
  )
}
