import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody } from '@/components/Card'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'
import { Select } from '@/components/Input'
import { Page } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { StandardCard } from './StandardView'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDishStandard, useReference } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import { parseApiError } from '@/lib/parseApiError'
import { shortDate } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n, type TFunc } from '@/i18n'

export function StandardDetailPage() {
  const { dishId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t, locale } = useI18n()
  const { can } = useAuth()

  const { data, isLoading, isError, refetch } = useDishStandard(dishId)
  const { data: ref } = useReference()

  const [approveOpen, setApproveOpen] = useState(false)
  const [approver, setApprover] = useState('')
  const [busy, setBusy] = useState(false)

  if (isLoading) return <DetailSkeleton />
  if (isError || !data) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
      </Page>
    )
  }

  const std = data.standard
  const canEdit = can('standard.edit')

  async function runApprove(approverId: string | null) {
    if (!dishId) return
    setBusy(true)
    try {
      const updated = await api.approveDishStandard(dishId, approverId)
      qc.setQueryData(qk.standard(dishId), updated)
      qc.invalidateQueries({ queryKey: qk.standards })
      toast.success(approverId ? t('toast.standardApproved') : t('toast.approvalCleared'))
      setApproveOpen(false)
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const meta = [
    data.recipe_code && `#${data.recipe_code}`,
    data.branch,
    data.category,
    data.section,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <Page stagger>
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          icon="arrowLeft"
          onClick={() => navigate('/standards')}
        >
          {t('standards.detail.back')}
        </Button>
        <div className="flex items-center gap-2">
          {canEdit && std && (
            <Button
              variant="secondary"
              size="sm"
              icon="check"
              onClick={() => {
                setApprover(data.qa_approved_by?.id ?? '')
                setApproveOpen(true)
              }}
            >
              {t('action.approveStandard')}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="primary"
              size="sm"
              icon={std ? 'edit' : 'plus'}
              onClick={() => navigate(`/standards/${dishId}/edit`)}
            >
              {std ? t('action.editStandard') : t('action.createStandard')}
            </Button>
          )}
        </div>
      </div>

      <Card elevated rail="idle" className="mb-6 overflow-hidden">
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[1.6rem] font-medium tracking-tight text-ink">
                {data.name_en}
              </h1>
              {data.name_ar && (
                <p dir="rtl" className="mt-0.5 text-sm text-ink-subtle">
                  {data.name_ar}
                </p>
              )}
              {meta && <p className="mt-1.5 font-mono text-xs text-ink-subtle">{meta}</p>}
            </div>
            <ApprovalBadge data={data} locale={locale} t={t} />
          </div>
          {std && (
            <p className="mt-3 text-xs text-ink-subtle">
              {t('standards.detail.coverage', {
                filled: data.spec_coverage.filled,
                total: data.spec_coverage.total,
              })}
            </p>
          )}
        </CardBody>
      </Card>

      {std ? (
        <div className="mx-auto max-w-3xl">
          <StandardCard std={std} t={t} />
        </div>
      ) : (
        <EmptyState
          icon="standards"
          title={t('standards.detail.none')}
          action={
            canEdit
              ? {
                  label: t('action.createStandard'),
                  icon: 'plus',
                  onClick: () => navigate(`/standards/${dishId}/edit`),
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={approveOpen}
        title={t('standards.approve.title', { dish: data.name_en })}
        confirmLabel={t('action.approve')}
        busy={busy}
        onCancel={() => setApproveOpen(false)}
        onConfirm={() => runApprove(approver || null)}
        body={
          <div className="space-y-3">
            <p>{t('standards.approve.body')}</p>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-muted">
                {t('standards.approve.who')}
              </span>
              <Select value={approver} onChange={(e) => setApprover(e.target.value)}>
                <option value="">—</option>
                {(ref?.approvers ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
            {data.qa_approved_by && (
              <button
                type="button"
                className="text-xs font-medium text-danger-ink hover:underline"
                onClick={() => runApprove(null)}
              >
                {t('action.clearApproval')}
              </button>
            )}
          </div>
        }
      />
    </Page>
  )
}

function ApprovalBadge({
  data,
  locale,
  t,
}: {
  data: NonNullable<ReturnType<typeof useDishStandard>['data']>
  locale: 'en' | 'ar'
  t: TFunc
}) {
  if (!data.standard) return <Pill tone="neutral">{t('standards.status.missing')}</Pill>
  if (data.needs_review) {
    const label = data.qa_approved_by
      ? t('standards.detail.changed')
      : t('standards.detail.unapproved')
    return (
      <Pill tone="warning" icon="warning">
        {label}
      </Pill>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name="check" size={14} className="text-success-ink" />
      <span className="text-xs text-ink-muted">
        {t('standards.detail.approvedBy', {
          name: data.qa_approved_by?.name ?? '—',
          date: shortDate(data.standard.approval_date ?? null, locale),
        })}
      </span>
    </span>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-28 w-full rounded-card" />
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-96" />
      </div>
    </Page>
  )
}
