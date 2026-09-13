import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { DishImage } from '@/components/DishImage'
import { Icon } from '@/components/Icon'
import { Page } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { ErrorState, Skeleton } from '@/components/States'
import { NutritionPanel } from '@/features/dishes/NutritionPanel'
import { PlatingPanel } from '@/features/dishes/PlatingPanel'
import { hasStandardContent, StandardCard } from '@/features/standards/StandardView'
import { useDishRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'
import type { NutritionRollup } from '@/types/api'

/* The staff guide for one dish — photo, safety info, quick facts,
 * ingredients, method, "what good looks like", and the plating guide as
 * the finale. Read-only: no cost, no price, no edit/delete/publish
 * controls — those live on the regular Dish detail page. */
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
  const allergens = dish.allergen_rollup?.all ?? []

  const glance: { label: string; value: string }[] = []
  if (dish.section?.name) glance.push({ label: t('kitchen.glance.station'), value: dish.section.name })
  if (dish.prep_time_minutes)
    glance.push({ label: t('kitchen.glance.prepTime'), value: t('kitchen.glance.minutes', { n: dish.prep_time_minutes }) })
  if (dish.service_style?.name) glance.push({ label: t('kitchen.glance.serviceStyle'), value: dish.service_style.name })
  if (dish.category?.name) glance.push({ label: t('kitchen.glance.category'), value: dish.category.name })

  return (
    <Page stagger>
      <div className="mb-4 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/kitchen')}>
          {t('kitchen.title')}
        </Button>
      </div>

      {/* hero */}
      <div className="card-lit relative mb-4 overflow-hidden rounded-card border border-hairline">
        <div className="aspect-[16/9] w-full bg-surface-sunken sm:aspect-[21/9]">
          <DishImage src={dish.image_url} name={dish.name_en} rounded="rounded-none" />
        </div>
        <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 sm:p-6">
          <h1 className="font-display text-[1.75rem] font-medium tracking-tight text-white">
            {dish.name_en}
          </h1>
          {dish.name_ar && (
            <p dir="rtl" className="mt-0.5 text-sm text-white/85">
              {dish.name_ar}
            </p>
          )}
          {dish.taste_profile && (
            <p className="mt-1.5 text-sm italic text-white/80">{dish.taste_profile}</p>
          )}
        </div>
      </div>

      {/* safety — never buried, always right under the photo */}
      <div className="mb-6">
        {allergens.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-subtle bg-danger-subtle px-4 py-3">
            <Icon name="alert" size={16} className="flex-none text-danger-ink" />
            <span className="text-sm font-semibold text-danger-ink">{t('allergens.title')}:</span>
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((a) => (
                <Pill key={a} tone="danger">
                  {a}
                </Pill>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-4 py-3">
            <Icon name="check" size={16} className="flex-none text-success-ink" />
            <span className="text-sm text-ink-muted">{t('kitchen.allergens.none')}</span>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
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
              <ol className="space-y-4">
                {dish.steps.map((s) => (
                  <li key={s.id ?? s.step_number} className="flex gap-3.5 text-sm">
                    <span className="spice-rail flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold text-white">
                      {s.step_number}
                    </span>
                    <p className="pt-0.5 leading-relaxed text-ink">{s.instruction}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {glance.length > 0 && (
            <Card elevated rail="idle">
              <CardHeader title={t('kitchen.glance')} />
              <CardBody className="space-y-2.5">
                {glance.map((g) => (
                  <div key={g.label} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-subtle">{g.label}</span>
                    <span className="font-medium text-ink">{g.value}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          <NutritionPanel nutrition={nutrition} />
        </div>
      </div>

      {/* the finale — full width for the standard + the plating photo(s) */}
      <div className="mt-6 space-y-6">
        {dish.standard && hasStandardContent(dish.standard) && (
          <StandardCard std={dish.standard} t={t} title={t('kitchen.standard.title')} />
        )}
        {id && <PlatingPanel dishId={id} canEdit={false} />}
      </div>
    </Page>
  )
}

function DetailSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 aspect-[21/9] w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-80" />
      </div>
    </Page>
  )
}
