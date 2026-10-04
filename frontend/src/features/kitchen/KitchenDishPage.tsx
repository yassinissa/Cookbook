import { useNavigate, useParams } from 'react-router-dom'

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

import { StationSheet, type SheetFact } from './StationSheet'

/* The cook's station sheet for one dish (see StationSheet) — name, photo,
 * rev/station/prep-time, allergens and ingredients beside the method, fitted
 * to one screen. The QA standard, plating guide and nutrition follow
 * underneath. Read-only: no cost, no price, no edit/delete/publish controls —
 * those live on the regular Dish detail page. */
export function KitchenDishPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { data: dish, isLoading, isError, refetch } = useDishRecipe(id)

  if (isLoading) return <SheetSkeleton />
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

  const facts: SheetFact[] = []
  if (dish.prep_time_minutes)
    facts.push({
      label: t('kitchen.sheet.prepTime'),
      value: t('kitchen.glance.minutes', { n: dish.prep_time_minutes }),
    })

  return (
    <StationSheet
      backLabel={t('kitchen.title')}
      onBack={() => navigate('/kitchen')}
      nameEn={dish.name_en}
      nameAr={dish.name_ar}
      photo={<DishImage src={dish.image_url} name={dish.name_en} rounded="rounded-none" />}
      meta={sheetMeta(
        t,
        dish.revision,
        dish.revision_date ? shortDate(dish.revision_date, locale) : null,
        dish.section?.name,
        dish.category?.name,
        dish.service_style?.name,
      )}
      facts={facts}
      banner={
        // safety — never buried, always right under the photo
        allergens.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-danger-subtle bg-danger-subtle px-5 py-2">
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
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-2">
            <Icon name="check" size={16} className="flex-none text-success-ink" />
            <span className="text-sm text-ink-muted">{t('kitchen.allergens.none')}</span>
          </div>
        )
      }
      ingredients={dish.ingredients}
      steps={dish.steps}
    >
      {dish.standard && hasStandardContent(dish.standard) && (
        <StandardCard std={dish.standard} t={t} title={t('kitchen.standard.title')} />
      )}
      {id && <PlatingPanel dishId={id} canEdit={false} />}
      <div className="min-[680px]:w-1/2 min-[680px]:pe-2.5">
        <NutritionPanel nutrition={nutrition} />
      </div>
    </StationSheet>
  )
}

/** The card's "Rev.No.0 - Date - Section - Category" line. */
export function sheetMeta(
  t: (key: 'kitchen.sheet.rev', vars: { n: string }) => string,
  revision: string | null | undefined,
  ...rest: (string | null | undefined)[]
): string[] {
  // free text — some cards already carry the "Rev." themselves
  const rev = revision
    ? /^rev/i.test(revision)
      ? revision
      : t('kitchen.sheet.rev', { n: revision })
    : null
  return [rev, ...rest].filter(Boolean) as string[]
}

export function SheetSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1700px] px-3 py-3 sm:px-5">
      <div className="grid gap-4 min-[680px]:grid-cols-2 min-[680px]:gap-5">
        <div className="space-y-4">
          <Skeleton className="aspect-[3/2] w-full rounded-card" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}
