import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { DishImage } from '@/components/DishImage'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { AllergenPanel, NutritionPanel } from '@/features/dishes/NutritionPanel'
import { PlatingPanel } from '@/features/dishes/PlatingPanel'
import { useDishRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'
import type { NutritionRollup } from '@/types/api'

/* Read-only "how do I make this" card for kitchen floor staff — photo,
 * ingredients, method, allergens, plating guide. No cost, no price, no
 * edit/delete/publish controls; those live on the regular Dish detail page. */
export function KitchenDishPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: dish, isLoading, isError, refetch } = useDishRecipe(id)

  if (isLoading) return <DetailSkeleton />
  if (isError || !dish) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
      </Page>
    )
  }

  const nutrition = (
    dish.nutrition && Object.keys(dish.nutrition).length ? dish.nutrition : null
  ) as NutritionRollup | null

  return (
    <Page stagger>
      <div className="mb-4 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/kitchen')}>
          {t('kitchen.title')}
        </Button>
      </div>

      <div className="card-lit relative mb-6 overflow-hidden rounded-card border border-hairline">
        <div className="aspect-[16/9] w-full bg-surface-sunken sm:aspect-[21/9]">
          <DishImage src={dish.image_url} name={dish.name_en} rounded="rounded-none" />
        </div>
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 sm:p-6">
          <h1 className="font-display text-[1.75rem] font-medium tracking-tight text-white">
            {dish.name_en}
          </h1>
          {dish.name_ar && (
            <p dir="rtl" className="mt-0.5 text-sm text-white/85">
              {dish.name_ar}
            </p>
          )}
          <p className="mt-1 font-mono text-xs text-white/70">
            {[dish.branch_name || dish.branch, dish.category?.name].filter(Boolean).join('  ·  ')}
          </p>
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
                      <td className="px-4 py-2.5 text-ink">
                        {i.item_name_snapshot}
                        {i.prep_note && <span className="text-ink-subtle"> · {i.prep_note}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-2.5 text-end font-mono text-ink-muted">
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

          {id && <PlatingPanel dishId={id} canEdit={false} />}
        </div>

        <div className="space-y-6">
          <AllergenPanel rollup={dish.allergen_rollup} />
          <NutritionPanel nutrition={nutrition} />
        </div>
      </div>
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
