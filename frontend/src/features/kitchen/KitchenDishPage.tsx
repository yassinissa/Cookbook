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
import { shortDate } from '@/lib/format'
import { useDishRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'
import type { NutritionRollup } from '@/types/api'

/* The cook's station sheet for one dish — the paper recipe card, on the
 * iPad: name + photo + rev/station/prep-time + ingredients (qty, item code)
 * on one side, preparation & method on the other, so nothing needs a scroll
 * to cross-check. The QA standard and plating guide follow underneath.
 * Read-only: no cost, no price, no edit/delete/publish controls — those
 * live on the regular Dish detail page. */
export function KitchenDishPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
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

  // the sheet's "Rev.No.0 - Date - Section - Category" line
  const meta = [
    // free text — some cards already carry the "Rev." themselves
    dish.revision
      ? /^rev/i.test(dish.revision)
        ? dish.revision
        : t('kitchen.sheet.rev', { n: dish.revision })
      : null,
    dish.revision_date ? shortDate(dish.revision_date, locale) : null,
    dish.section?.name,
    dish.category?.name,
    dish.service_style?.name,
  ].filter(Boolean) as string[]

  return (
    <Page stagger>
      <div className="mb-4 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/kitchen')}>
          {t('kitchen.title')}
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        {/* left — what it is and what goes in it */}
        <section className="card-lit relative overflow-hidden rounded-card border border-hairline">
          <span aria-hidden className="spice-rail-h absolute inset-x-0 top-0 h-1" />
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-4 sm:px-5">
            <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ink">
              {dish.name_en}
            </h1>
            {dish.name_ar && (
              <p dir="rtl" className="text-lg text-ink-muted">
                {dish.name_ar}
              </p>
            )}
          </header>

          <div className="aspect-[3/2] w-full bg-surface-sunken">
            <DishImage src={dish.image_url} name={dish.name_en} rounded="rounded-none" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3 sm:px-5">
            {meta.length > 0 && (
              <p className="text-xs font-medium text-ink-muted">{meta.join(' · ')}</p>
            )}
            {dish.prep_time_minutes ? (
              <p className="flex items-baseline gap-2 text-xs text-ink-subtle">
                {t('kitchen.glance.prepTime')}
                <span className="tnum font-mono text-base font-semibold text-ink">
                  {t('kitchen.glance.minutes', { n: dish.prep_time_minutes })}
                </span>
              </p>
            ) : null}
          </div>

          {/* safety — never buried, always right under the photo */}
          {allergens.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-danger-subtle bg-danger-subtle px-4 py-2.5 sm:px-5">
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
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 sm:px-5">
              <Icon name="check" size={16} className="flex-none text-success-ink" />
              <span className="text-sm text-ink-muted">{t('kitchen.allergens.none')}</span>
            </div>
          )}

          {dish.ingredients.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-subtle sm:px-5">{t('kitchen.sheet.noIngredients')}</p>
          ) : (
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                  <th scope="col" className="px-4 pb-2 pt-3.5 text-start font-semibold sm:ps-5">
                    {t('editor.section.ingredients')}
                  </th>
                  <th scope="col" className="px-3 pb-2 pt-3.5 text-end font-semibold">
                    {t('editor.ing.qty')}
                  </th>
                  <th scope="col" className="px-4 pb-2 pt-3.5 text-start font-semibold sm:pe-5">
                    {t('dishes.col.code')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline border-t border-hairline">
                {dish.ingredients.map((i) => (
                  <tr key={i.id ?? i.item_sku}>
                    <td className="px-4 py-2.5 text-ink sm:ps-5">
                      {i.item_name_snapshot}
                      {i.prep_note && <span className="text-ink-subtle"> · {i.prep_note}</span>}
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-end font-mono font-medium text-ink">
                      {i.quantity} {i.unit_detail?.code ?? ''}
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-2.5 font-mono text-[13px] text-ink-subtle sm:pe-5">
                      {i.item_sku}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* right — how to make it */}
        <div className="space-y-5">
          <Card elevated>
            <CardHeader title={t('kitchen.sheet.method')} />
            <CardBody>
              {dish.steps.length === 0 ? (
                <p className="text-sm text-ink-subtle">{t('kitchen.sheet.noSteps')}</p>
              ) : (
                <ol className="space-y-4">
                  {dish.steps.map((s) => (
                    <li key={s.id ?? s.step_number} className="flex gap-3.5">
                      <span className="spice-rail flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold text-white">
                        {s.step_number}
                      </span>
                      <p className="pt-0.5 text-base leading-relaxed text-ink">{s.instruction}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
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
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/3] w-full rounded-card" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </Page>
  )
}
