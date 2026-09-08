import { Outlet } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useI18n } from '@/i18n'

export function AppShell() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link no-print">
        {t('a11y.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main-content" className="flex-1 pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
