import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import {
  EMPTY_STANDARD,
  QaStandardFields,
  standardToForm,
} from '@/features/dishes/QaStandardFields'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDishStandard, useReference } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '@/lib/parseApiError'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/i18n'
import type { DishStandard } from '@/types/api'

export function StandardEditorPage() {
  const { dishId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useDishStandard(dishId)
  const { data: ref, isLoading: refLoading } = useReference()

  const [form, setForm] = useState<DishStandard>(EMPTY_STANDARD)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const hadStandard = !!data?.standard

  useEffect(() => {
    if (data?.standard) hydrate(data.standard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function hydrate(std: DishStandard) {
    setForm(standardToForm(std))
  }

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dishId) return
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    try {
      const saved = await api.updateDishStandard(dishId, form)
      qc.setQueryData(qk.standard(dishId), saved)
      qc.invalidateQueries({ queryKey: qk.standards })
      toast.success(t('toast.standardSaved'))
      navigate(`/standards/${dishId}`)
    } catch (error) {
      const { fields, message } = parseApiError(error)
      setFieldErrors(fields)
      setFormError(message)
      toast.error(t('toast.saveFailed', { detail: message }))
    } finally {
      setSaving(false)
    }
  }

  if (isError) {
    return (
      <Page>
        <ErrorState onRetry={() => refetch()} />
      </Page>
    )
  }
  if (isLoading || refLoading || !ref || !data) return <EditorSkeleton />

  return (
    <form onSubmit={onSubmit}>
      <Page stagger className="pb-28 lg:pb-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="arrowLeft"
              onClick={() => navigate(`/standards/${dishId}`)}
            >
              {t('action.back')}
            </Button>
            <div>
              <h1 className="font-display text-[1.5rem] font-medium tracking-tight text-ink">
                {hadStandard ? t('standards.editor.editTitle') : t('standards.editor.newTitle')}
              </h1>
              <p className="text-xs text-ink-subtle">
                {t('standards.editor.for', { dish: data.name_en })}
              </p>
            </div>
          </div>
          <Button type="submit" variant="primary" size="sm" loading={saving} className="hidden sm:inline-flex">
            {saving ? t('action.saving') : t('action.saveChanges')}
          </Button>
        </header>

        {formError && (
          <div className="mb-5">
            <ErrorState title={t('state.errorGeneric')} body={formError} />
          </div>
        )}

        <Card>
          <CardHeader title={t('editor.section.standard')} />
          <CardBody>
            <QaStandardFields standard={form} branches={ref.branches} onChange={setField} />
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-hairline pt-3 text-xs text-danger-ink">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k.replace(/_/g, ' ')}</span>: {v}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </Page>

      <div className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-2 border-t border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>
          {saving ? t('action.saving') : t('action.saveChanges')}
        </Button>
      </div>
    </form>
  )
}

function EditorSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-8 w-56" />
      <Skeleton className="h-[32rem]" />
    </Page>
  )
}
