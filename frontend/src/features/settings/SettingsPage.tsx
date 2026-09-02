import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Card, CardBody, CardHeader } from '@/components/Card'
import { Page, PageHeader } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { Spinner } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/auth/AuthProvider'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDigestSubscription } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'

export function SettingsPage() {
  const { t, locale } = useI18n()
  const { me } = useAuth()

  return (
    <Page stagger>
      <PageHeader
        title={t('settings.title')}
        subtitle={me ? t('settings.for', { name: me.display_name }) : undefined}
      />
      <div className="max-w-xl">
        <DigestCard t={t} locale={locale} />
      </div>
    </Page>
  )
}

function DigestCard({ t, locale }: { t: ReturnType<typeof useI18n>['t']; locale: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useDigestSubscription()

  const mutation = useMutation({
    mutationFn: (cadence: 'weekly' | 'off') => api.updateDigestSubscription(cadence),
    onSuccess: (saved) => {
      qc.setQueryData(qk.digestSubscription, saved)
      toast.success(saved.cadence === 'weekly' ? t('settings.digest.on') : t('settings.digest.off'))
    },
    onError: (err) => toast.error(parseApiError(err).message || t('state.errorGeneric')),
  })

  if (isLoading) {
    return (
      <Card elevated>
        <CardHeader title={t('settings.digest.title')} />
        <CardBody>
          <Skeleton className="h-16" />
        </CardBody>
      </Card>
    )
  }
  if (isError || !data) {
    return <ErrorState title={t('settings.digest.title')} onRetry={() => refetch()} />
  }

  const on = data.cadence === 'weekly'

  return (
    <Card elevated>
      <CardHeader title={t('settings.digest.title')} subtitle={t('settings.digest.subtitle')} />
      <CardBody className="space-y-3">
        {!data.enrolled ? (
          <p className="text-sm text-ink-subtle">{t('settings.digest.notEnrolled')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {on ? t('settings.digest.stateOn') : t('settings.digest.stateOff')}
                </p>
                {data.last_sent_at && (
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {t('settings.digest.lastSent', { date: shortDate(data.last_sent_at, locale) })}
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t('settings.digest.title')}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(on ? 'off' : 'weekly')}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                  on ? 'bg-accent' : 'bg-surface-sunken',
                  mutation.isPending && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform',
                    on ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                >
                  {mutation.isPending && <Spinner className="h-3 w-3 text-ink-subtle" />}
                </span>
              </button>
            </div>
            <p className="border-t border-hairline pt-3 text-xs text-ink-subtle">
              {t('settings.digest.note')}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
