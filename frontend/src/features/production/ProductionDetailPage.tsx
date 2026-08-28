import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { CostPanel } from '@/features/dishes/CostPanel'
import { NutritionPanel } from '@/features/dishes/NutritionPanel'
import { VersionDrawer } from '@/features/dishes/VersionDrawer'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useProductionRecipe } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import { parseApiError } from '@/lib/parseApiError'
import { kwd, shortDate } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'
import type { CostBreakdown } from '@/types/api'

export function ProductionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const { data: recipe, isLoading, isError, refetch } = useProductionRecipe(id)

  const [versionsOpen, setVersionsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  if (isLoading) return <DetailSkeleton />
  if (isError || !recipe) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
      </Page>
    )
  }

  const breakdown = (
    recipe.cost_breakdown && 'per_serving' in recipe.cost_breakdown
      ? recipe.cost_breakdown
      : null
  ) as CostBreakdown | null
  const unitCode = recipe.output_unit?.code ?? ''

  async function onRecalculate() {
    if (!id) return
    setRecalculating(true)
    try {
      const r = await api.recalcProductionRecipe(id)
      qc.setQueryData(qk.productionRecipe(id), r)
      toast.success(t('toast.costRecalculated'))
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
    } finally {
      setRecalculating(false)
    }
  }

  async function onDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteProductionRecipe(id)
      qc.invalidateQueries({ queryKey: qk.production })
      toast.success(t('toast.recipeDeleted', { name: recipe!.name_en }))
      navigate('/recipes/production')
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
      setDeleting(false)
    }
  }

  const meta = [
    recipe.recipe_code && `#${recipe.recipe_code}`,
    recipe.revision,
    recipe.prep_kitchen,
    recipe.section?.name,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <Page stagger>
      <div className="mb-4 flex items-center justify-between no-print">
        <Button
          variant="ghost"
          size="sm"
          icon="arrowLeft"
          onClick={() => navigate('/recipes/production')}
        >
          {t('production.detail.back')}
        </Button>
        <div className="flex items-center gap-2">
          {can('recipe.history') && (
            <Button
              variant="secondary"
              size="sm"
              icon="history"
              onClick={() => setVersionsOpen(true)}
            >
              {t('action.versionHistory')}
            </Button>
          )}
          {can('costing.recalculate') && (
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              loading={recalculating}
              onClick={onRecalculate}
            >
              {t('action.recalculate')}
            </Button>
          )}
          {can('production.edit') && (
            <Button
              variant="primary"
              size="sm"
              icon="edit"
              onClick={() => navigate(`/recipes/production/${id}/edit`)}
            >
              {t('action.edit')}
            </Button>
          )}
        </div>
      </div>

      <Card elevated rail="idle" className="mb-6 overflow-hidden">
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <CardBody>
          <h1 className="font-display text-[1.6rem] font-medium tracking-tight text-ink">
            {recipe.name_en}
          </h1>
          {recipe.name_ar && (
            <p dir="rtl" className="mt-0.5 text-sm text-ink-subtle">
              {recipe.name_ar}
            </p>
          )}
          {meta && <p className="mt-1.5 font-mono text-xs text-ink-subtle">{meta}</p>}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card elevated>
            <CardHeader title={t('editor.section.ingredients')} />
            <CardBody className="p-0">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-hairline">
                  {recipe.ingredients.map((i) => (
                    <tr key={i.id ?? i.item_sku}>
                      <td className="px-4 py-2 text-ink">
                        {i.item_name_snapshot}
                        {i.prep_note && <span className="text-ink-subtle"> · {i.prep_note}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-end font-mono text-ink-muted">
                        {i.quantity} {i.unit_detail?.code ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card elevated>
            <CardHeader title={t('editor.section.method')} />
            <CardBody>
              <ol className="space-y-3">
                {recipe.steps.map((s) => (
                  <li key={s.id ?? s.step_number} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-sunken font-mono text-xs font-semibold text-ink-subtle">
                      {s.step_number}
                    </span>
                    <p className="pt-0.5 leading-relaxed text-ink">{s.instruction}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          {recipe.notes && (
            <Card elevated>
              <CardHeader title={t('editor.field.notes')} />
              <CardBody>
                <p className="text-sm leading-relaxed text-ink-muted">{recipe.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card elevated rail="idle">
            <CardHeader title={t('production.yield.title')} />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="tnum font-mono text-[1.9rem] font-medium leading-none text-ink">
                  {kwd(recipe.cost_per_unit)}
                </span>
                <span className="text-xs text-ink-subtle">
                  {t('production.yield.perUnit', { unit: unitCode || '—' })} · KWD
                </span>
              </div>
              <p className="text-xs text-ink-subtle">
                {t('production.yield.batchOf', {
                  qty: recipe.output_qty,
                  unit: unitCode,
                })}
              </p>
              <p className="tnum text-xs text-ink-subtle">
                {t('production.cost.perBatch')}: {kwd(recipe.cost)} KWD
                {recipe.output_item_sku && (
                  <span className="ms-2 font-mono">→ {recipe.output_item_sku}</span>
                )}
              </p>
            </CardBody>
          </Card>

          <CostPanel
            breakdown={breakdown}
            hideLabour
            perServingLabel={t('production.cost.perBatch')}
          />
          <NutritionPanel nutrition={recipe.nutrition} />

          {(recipe.approved_by || recipe.qa_approved_by) && (
            <Card elevated>
              <CardHeader title={t('editor.section.approvals')} />
              <CardBody className="space-y-1.5 text-sm">
                {recipe.approved_by && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.approvedBy')}</span>
                    <span className="text-ink">{recipe.approved_by.name}</span>
                  </p>
                )}
                {recipe.qa_approved_by && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.qaApprovedBy')}</span>
                    <span className="text-ink">{recipe.qa_approved_by.name}</span>
                  </p>
                )}
                {recipe.approved_at && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.approvedAt')}</span>
                    <span className="tnum text-ink">{shortDate(recipe.approved_at, locale)}</span>
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {can('production.delete') && (
            <div className="no-print">
              <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDelete(true)}>
                {t('action.delete')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {id && (
        <VersionDrawer
          recipeId={id}
          kind="production"
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`${t('action.delete')} “${recipe.name_en}”?`}
        body="This removes the current version. Archived versions are kept for cost history."
        confirmLabel={t('action.delete')}
        danger
        busy={deleting}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-24 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-80" />
      </div>
    </Page>
  )
}
