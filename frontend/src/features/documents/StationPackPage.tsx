import { useMemo, useState } from 'react'

import { EmptyState, ErrorState, LoadingRow } from '@/components/States'
import { useDishRecipe, useDishRecipes, usePlatingGuide } from '@/lib/queries'
import { useI18n } from '@/i18n'
import { PrintFrame } from './print/PrintFrame'
import { RecipeCardSheet, type DocLang } from './print/RecipeCardSheet'
import { StandardSheet } from './print/StandardSheet'
import { PlatingSheet } from './print/PlatingSheet'
import { RecipePicker, type PickerOption } from './RecipePicker'
import { SegmentedButtons } from '@/components/Page'
import { ControlBar, Ctl } from './controls'

export function StationPackPage() {
  const { t, locale } = useI18n()

  const [dishId, setDishId] = useState<string | null>(null)
  const [lang, setLang] = useState<DocLang>(locale === 'ar' ? 'ar' : 'en')

  const dishes = useDishRecipes()
  const detail = useDishRecipe(dishId ?? undefined)
  const plating = usePlatingGuide(dishId ?? undefined)

  const options: PickerOption[] = useMemo(
    () =>
      (dishes.data ?? [])
        .map((r) => ({
          id: r.id,
          name_en: r.name_en,
          name_ar: r.name_ar,
          recipe_code: r.recipe_code,
          hint: r.has_standard ? undefined : t('documents.noStandard'),
        }))
        .sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [dishes.data, t],
  )

  const controls = (
    <ControlBar>
      <Ctl label={t('documents.pickDish')} className="sm:col-span-2 lg:col-span-3">
        <RecipePicker
          value={dishId}
          options={options}
          onSelect={setDishId}
          placeholder={t('documents.pickDish')}
        />
      </Ctl>
      <Ctl label={t('documents.lang')}>
        <SegmentedButtons<DocLang>
          label={t('documents.lang')}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: t('documents.lang.en') },
            { value: 'ar', label: t('documents.lang.ar') },
            { value: 'both', label: t('documents.lang.both') },
          ]}
        />
      </Ctl>
    </ControlBar>
  )

  const std = detail.data?.standard ?? null
  const plate = plating.data?.plating ?? null

  return (
    <PrintFrame
      title={t('documents.stationPack.title')}
      subtitle={detail.data?.name_en}
      controls={controls}
      printDisabled={!detail.data}
    >
      {!dishId ? (
        <EmptyState icon="standards" title={t('documents.empty.dish')} />
      ) : detail.isLoading ? (
        <LoadingRow />
      ) : detail.isError || !detail.data ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : (
        <div className="space-y-8">
          <RecipeCardSheet kind="dish" recipe={detail.data} lang={lang} includeCost />

          {std ? (
            <StandardSheet std={std} pageBreakBefore />
          ) : (
            <MissingNote text={t('documents.noStandard')} pageBreakBefore />
          )}

          {plating.isLoading ? (
            <LoadingRow />
          ) : plate ? (
            <PlatingSheet plating={plate} dishName={detail.data.name_en} pageBreakBefore />
          ) : (
            <MissingNote text={t('documents.noPlating')} pageBreakBefore />
          )}
        </div>
      )}
    </PrintFrame>
  )
}

function MissingNote({ text, pageBreakBefore }: { text: string; pageBreakBefore?: boolean }) {
  return (
    <p
      className={
        'rounded border border-dashed border-hairline-strong px-4 py-3 text-sm text-ink-subtle ' +
        (pageBreakBefore ? 'doc-page-break' : '')
      }
    >
      {text}
    </p>
  )
}
