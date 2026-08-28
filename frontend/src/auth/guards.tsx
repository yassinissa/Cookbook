import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { LoadingRow } from '@/components/States'
import { Page } from '@/components/Page'
import { getToken, setUnauthorizedHandler, USE_SEED } from '@/lib/http'
import { useI18n } from '@/i18n'
import type { CapabilityCode } from '@/types/access'

export function RequireAuth() {
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/login', { replace: true }))
  }, [navigate])

  if (!USE_SEED && !getToken()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export function RequireCapability({
  cap,
  anyOf,
  children,
}: {
  cap?: CapabilityCode
  anyOf?: CapabilityCode[]
  children?: ReactNode
}) {
  const { loading, can, canAny } = useAuth()
  const { t } = useI18n()

  if (loading) return <LoadingRow />

  const allowed = cap ? can(cap) : anyOf ? canAny(anyOf) : true
  if (!allowed) {
    return (
      <Page>
        <div className="mx-auto max-w-md rounded-card border border-hairline bg-surface p-8 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
            <Icon name="standards" size={20} />
          </span>
          <h1 className="text-base font-semibold text-ink">{t('access.denied.title')}</h1>

          <p className="mt-1 text-sm text-ink-subtle">{t('access.denied.body')}</p>
          <Button variant="secondary" className="mt-5" icon="arrowLeft" onClick={() => history.back()}>
            {t('action.back')}
          </Button>
        </div>
      </Page>
    )
  }

  return children ? <>{children}</> : <Outlet />
}
