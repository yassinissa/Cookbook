import { useNavigate, useParams } from 'react-router-dom'

import { Page } from '@/components/Page'
import { ErrorState } from '@/components/States'
import { shortDate } from '@/lib/format'
import { useProductionRecipe } from '@/lib/queries'
import { useI18n } from '@/i18n'

import { SheetSkeleton, sheetMeta } from './KitchenDishPage'
import { StationSheet, type SheetFact } from './StationSheet'

/* The station sheet for one production batch (see StationSheet) — yield,
 * ingredients and method on one screen; no photo, batches don't have one.
 * Read-only: no cost, no edit/delete/publish controls; those live on the
 * regular Production detail page. */
export function KitchenProductionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { data: recipe, isLoading, isError, refetch } = useProductionRecipe(id)

  if (isLoading) return <SheetSkeleton />
  if (isError || !recipe) {
    return (
      <Page>
        <ErrorState title={t('state.errorGeneric')} onRetry={() => refetch()} />
      </Page>
    )
  }

  const facts: SheetFact[] = [
    {
      label: t('kitchen.glance.yield'),
      value: `${recipe.output_qty} ${recipe.output_unit?.code ?? ''}`.trim(),
    },
  ]
  if (recipe.prep_time_minutes)
    facts.push({
      label: t('kitchen.sheet.prepTime'),
      value: t('kitchen.glance.minutes', { n: recipe.prep_time_minutes }),
    })

  return (
    <StationSheet
      backLabel={t('kitchen.title')}
      onBack={() => navigate('/kitchen')}
      nameEn={recipe.name_en}
      nameAr={recipe.name_ar}
      meta={sheetMeta(
        t,
        recipe.revision,
        recipe.revision_date ? shortDate(recipe.revision_date, locale) : null,
        recipe.section?.name,
        recipe.prep_kitchen,
      )}
      facts={facts}
      ingredients={recipe.ingredients}
      steps={recipe.steps}
    />
  )
}
