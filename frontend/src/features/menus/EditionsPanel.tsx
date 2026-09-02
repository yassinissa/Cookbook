import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import { useMenuEditions } from '@/lib/queries'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { relativeTime, shortDate } from '@/lib/format'
import { useI18n } from '@/i18n'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EditionsPanel({
  menuId,
  branchSlug,
  canPublish,
}: {
  menuId: string
  branchSlug: string
  canPublish: boolean
}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: editions, isLoading, isError, refetch } = useMenuEditions(menuId)

  const [date, setDate] = useState(todayIso())

  const publish = useMutation({
    mutationFn: () => api.publishMenuEdition(menuId, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.menuEditions(menuId) })
      toast.success(t('toast.editionPublished'))
    },
    onError: (e) => toast.error(parseApiError(e).message || t('state.errorGeneric')),
  })

  if (isLoading) return <Skeleton className="h-56" />
  if (isError) return <ErrorState title={t('editions.title')} onRetry={() => refetch()} />

  const list = editions ?? []
  const current = list.find((e) => e.is_current) ?? null
  const publicUrl = branchSlug ? `${window.location.origin}/m/${branchSlug}` : ''

  return (
    <Card elevated rail={current ? 'idle' : undefined}>
      <CardHeader title={t('editions.title')} subtitle={t('editions.subtitle')} />
      <CardBody className="space-y-4">
        {!branchSlug ? (
          <p className="text-sm text-warning-ink">{t('editions.needsSlug')}</p>
        ) : (
          <>
            <div className="flex items-start gap-2 text-sm">
              {current ? (
                <>
                  <Icon name="check" size={15} className="mt-0.5 flex-none text-success-ink" />
                  <div>
                    <p className="text-ink">
                      {t('editions.current', { v: current.version, date: shortDate(current.effective_on, locale) })}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {t('editions.publishedAt', { when: relativeTime(current.published_at, locale) })}
                      {current.published_by && ` · ${t('editions.by', { who: current.published_by })}`}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-hairline-strong" />
                  <span className="text-ink-subtle">{t('editions.never')}</span>
                </>
              )}
            </div>

            {canPublish && (
              <div className="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
                <label className="flex flex-col gap-1 text-xs text-ink-muted">
                  {t('editions.publishFor')}
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 w-44"
                  />
                </label>
                <Button
                  variant={current ? 'secondary' : 'primary'}
                  size="sm"
                  icon="external"
                  loading={publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  {current ? t('editions.republish') : t('editions.publish')}
                </Button>
              </div>
            )}

            {current && publicUrl && (
              <div className="flex flex-col gap-3 border-t border-hairline pt-3 sm:flex-row sm:items-center">
                <img
                  src={api.menuQrUrl(branchSlug)}
                  alt={t('editions.qrAlt')}
                  width={96}
                  height={96}
                  className="rounded-lg border border-hairline bg-white p-1"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    {t('editions.publicLink')}
                  </p>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 break-all text-sm text-accent-ink hover:underline"
                  >
                    {publicUrl}
                    <Icon name="external" size={13} className="flex-none" />
                  </a>
                </div>
              </div>
            )}

            {list.length > 1 && (
              <p className="text-xs text-ink-subtle">
                {t('editions.history', { n: list.length - 1 })}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
