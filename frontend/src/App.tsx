import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/Toast'
import { I18nProvider } from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { OfflineBanner } from '@/pwa/OfflineBanner'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'
import { router } from '@/router'
import { ThemeProvider } from '@/theme/ThemeProvider'

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <RouterProvider router={router} />
              <OfflineBanner />
              <UpdatePrompt />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
