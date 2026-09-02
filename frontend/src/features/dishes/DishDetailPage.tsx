import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DishImage } from '@/components/DishImage'
import { Meter } from '@/components/Meter'
import { Page } from '@/components/Page'
import { RatingPill } from '@/components/Pill'
import { ErrorState, Skeleton } from '@/components/States'
import { PublishControl } from '@/components/PublishControl'
import { StandardCard } from '@/features/standards/StandardView'
import { CostPanel } from './CostPanel'
import { PlatingPanel } from './PlatingPanel'
import { AllergenPanel, NutritionPanel } from './NutritionPanel'
import { VersionDrawer } from './VersionDrawer'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useDishRecipe } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import { parseApiError } from '@/lib/parseApiError'
import { kwd, shortDate } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'
import type { CostBreakdown, NutritionRollup } from '@/types/api'

export function DishDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const { data: dish, isLoading, isError, refetch } = useDishRecipe(id)

  const [versionsOpen, setVersionsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  if (isLoading) return <DetailSkeleton />
  if (isError || !dish) {
    return (
      <Page>
        <ErrorState title="Could not load this recipe" onRetry={() => refetch()} />
      </Page>
    )
  }

  const breakdown = (
    dish.cost_breakdown && 'per_serving' in dish.cost_breakdown ? dish.cost_breakdown : null
  ) as CostBreakdown | null
  const nutrition = (
    dish.nutrition && Object.keys(dish.nutrition).length ? dish.nutrition : null
  ) as NutritionRollup | null
  const std = dish.standard

  async function onRecalculate() {
    if (!id) return
    setRecalculating(true)
    try {
      const r = await api.recalcDishRecipe(id)
      qc.setQueryData(qk.dish(id), r)
      toast.success(t('toast.costRecalculated'))
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
    } finally {
      setRecalculating(false)
    }
  }

  async function onPublish() {
    if (!id) return
    setPublishing(true)
    try {
      const r = await api.publishDishRecipe(id)
      qc.setQueryData(qk.dish(id), r)
      qc.invalidateQueries({ queryKey: qk.dishes, exact: true })
      const warnings = r._publish?.warnings ?? []
      if (warnings.length) toast.info(t('publish.warnings', { n: warnings.length }))
      else toast.success(t('publish.ok'))
    } catch (e) {
      toast.error(parseApiError(e).message || t('publish.failed'))
    } finally {
      setPublishing(false)
    }
  }

  async function onDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteDishRecipe(id)
      qc.invalidateQueries({ queryKey: qk.dishes })
      toast.success(t('toast.recipeDeleted', { name: dish!.name_en }))
      navigate('/recipes/dishes')
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
      setDeleting(false)
    }
  }

  return (
    <Page stagger>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/recipes/dishes')}>
          {t('dishes.title')}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {can('recipe.history') && (
            <Button variant="secondary" size="sm" icon="history" onClick={() => setVersionsOpen(true)}>
              {t('action.versionHistory')}
            </Button>
          )}
          {can('costing.recalculate') && (
            <Button variant="secondary" size="sm" icon="refresh" loading={recalculating} onClick={onRecalculate}>
              {t('action.recalculate')}
            </Button>
          )}
          {can('dish.edit') && (
            <Button variant="primary" size="sm" icon="edit" onClick={() => navigate(`/recipes/dishes/${id}/edit`)}>
              {t('action.edit')}
            </Button>
          )}
        </div>
      </div>

      {/* hero */}
      <div className="card-lit relative mb-6 overflow-hidden rounded-card border border-hairline">
        <div className="aspect-[21/9] w-full bg-surface-sunken">
          <DishImage src={dish.image_url} name={dish.name_en} rounded="rounded-none" />
        </div>
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-[1.75rem] font-medium tracking-tight text-white">
                {dish.name_en}
              </h1>
              {dish.name_ar && (
                <p dir="rtl" className="mt-0.5 text-sm text-white/85">
                  {dish.name_ar}
                </p>
              )}
              <p className="mt-1 font-mono text-xs text-white/70">
                {[dish.recipe_code && `#${dish.recipe_code}`, dish.revision, dish.branch, dish.category?.name]
                  .filter(Boolean)
                  .join('  ·  ')}
              </p>
            </div>
            <RatingPill status={dish.rating_status} rating={dish.rating} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card elevated>
            <CardHeader title={t('editor.section.ingredients')} />
            <CardBody flush>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-hairline">
                  {dish.ingredients.map((i) => (
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
                {dish.steps.map((s) => (
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

          {std && <StandardCard std={std} t={t} />}

          {id && <PlatingPanel dishId={id} canEdit={can('standard.edit')} />}
        </div>

        <div className="space-y-6">
          <Card elevated rail="idle">
            <CardHeader title={t('cost.tile.perServing')} />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="tnum font-mono text-[1.9rem] font-medium leading-none text-ink">
                  {kwd(dish.cost)}
                </span>
                <span className="text-xs text-ink-subtle">
                  KWD · {t('editor.field.price')} {kwd(dish.selling_price)}
                </span>
              </div>
              <Meter
                value={dish.food_cost_pct === null ? null : Number(dish.food_cost_pct)}
                bandLabel={(b) => t(`cost.band.${b}`)}
              />
            </CardBody>
          </Card>
          <CostPanel breakdown={breakdown} sellingPrice={dish.selling_price} />
          <NutritionPanel nutrition={nutrition} />
          <AllergenPanel rollup={dish.allergen_rollup} />

          <PublishControl
            isPublished={!!dish.inventory_recipe_id}
            publishedAt={dish.published_at}
            publishStale={dish.publish_stale}
            publishError={dish.publish_error}
            inventoryRecipeId={dish.inventory_recipe_id}
            canPublish={can('recipe.publish')}
            busy={publishing}
            onPublish={onPublish}
          />

          {(dish.approved_by || dish.qa_approved_by) && (
            <Card elevated>
              <CardHeader title={t('editor.section.approvals')} />
              <CardBody className="space-y-1.5 text-sm">
                {dish.approved_by && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.approvedBy')}</span>
                    <span className="text-ink">{dish.approved_by.name}</span>
                  </p>
                )}
                {dish.qa_approved_by && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.qaApprovedBy')}</span>
                    <span className="text-ink">{dish.qa_approved_by.name}</span>
                  </p>
                )}
                {dish.approved_at && (
                  <p className="flex justify-between">
                    <span className="text-ink-subtle">{t('editor.field.approvedAt')}</span>
                    <span className="tnum text-ink">{shortDate(dish.approved_at, locale)}</span>
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {can('dish.delete') && (
            <div className="no-print">
              <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDelete(true)}>
                {t('action.delete')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {id && <VersionDrawer recipeId={id} open={versionsOpen} onClose={() => setVersionsOpen(false)} />}

      <ConfirmDialog
        open={confirmDelete}
        title={`${t('action.delete')} “${dish.name_en}”?`}
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
      <Skeleton className="mb-6 aspect-[21/9] w-full rounded-card" />
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
