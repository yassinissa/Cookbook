import { useMemo, useState } from 'react'

import { SegmentedButtons } from '@/components/Page'
import { EmptyState, ErrorState, LoadingRow } from '@/components/States'
import { useAuth } from '@/auth/AuthProvider'
import {
  useDishRecipe,
  useDishRecipes,
  useProductionRecipe,
  useProductionRecipes,
} from '@/lib/queries'
import { useI18n } from '@/i18n'
import { PrintFrame } from './print/PrintFrame'
import { RecipeCardSheet, type DocLang } from './print/RecipeCardSheet'
import { RecipePicker, type PickerOption } from './RecipePicker'
import { ControlBar, Ctl, Toggle } from './controls'

type Kind = 'dish' | 'production'

export function RecipeCardPage() {
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const canCost = can('costing.view')

  const [kind, setKind] = useState<Kind>('dish')
  const [dishId, setDishId] = useState<string | null>(null)
  const [prodId, setProdId] = useState<string | null>(null)
  const [includePhoto, setIncludePhoto] = useState(true)
  const [includeCost, setIncludeCost] = useState(canCost)
  const [lang, setLang] = useState<DocLang>(locale === 'ar' ? 'ar' : 'en')

  const dishes = useDishRecipes(kind === 'dish')
  const productions = useProductionRecipes(kind === 'production')

  const selectedId = kind === 'dish' ? dishId : prodId
  const dishDetail = useDishRecipe(kind === 'dish' ? dishId ?? undefined : undefined)
  const prodDetail = useProductionRecipe(kind === 'production' ? prodId ?? undefined : undefined)
  const detail = kind === 'dish' ? dishDetail : prodDetail

  const options: PickerOption[] = useMemo(() => {
    const rows = kind === 'dish' ? dishes.data ?? [] : productions.data ?? []
    return rows
      .map((r) => ({
        id: r.id,
        name_en: r.name_en,
        name_ar: r.name_ar,
        recipe_code: r.recipe_code,
      }))
      .sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [kind, dishes.data, productions.data])

  const controls = (
    <ControlBar>
      <Ctl label={t('documents.kind.dish') + ' / ' + t('documents.kind.production')}>
        <SegmentedButtons<Kind>
          label={t('documents.recipeCard.title')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'dish', label: t('documents.kind.dish') },
            { value: 'production', label: t('documents.kind.production') },
          ]}
        />
      </Ctl>

      <Ctl
        label={kind === 'dish' ? t('documents.pickDish') : t('documents.pickProduction')}
        className="sm:col-span-2"
      >
        <RecipePicker
          value={selectedId}
          options={options}
          onSelect={(id) => (kind === 'dish' ? setDishId(id) : setProdId(id))}
          placeholder={kind === 'dish' ? t('documents.pickDish') : t('documents.pickProduction')}
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

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
        {kind === 'dish' && (
          <Toggle
            checked={includePhoto}
            onChange={setIncludePhoto}
            label={t('documents.opt.photo')}
          />
        )}
        <Toggle
          checked={includeCost && canCost}
          onChange={setIncludeCost}
          disabled={!canCost}
          label={t('documents.opt.cost')}
          hint={!canCost ? t('documents.opt.costLocked') : undefined}
        />
      </div>
    </ControlBar>
  )

  return (
    <PrintFrame
      title={t('documents.recipeCard.title')}
      subtitle={detail.data?.name_en}
      controls={controls}
      printDisabled={!detail.data}
    >
      {!selectedId ? (
        <EmptyState icon="documents" title={t('documents.empty.recipe')} />
      ) : detail.isLoading ? (
        <LoadingRow />
      ) : detail.isError || !detail.data ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : (
        <RecipeCardSheet
          kind={kind}
          recipe={detail.data}
          lang={lang}
          includePhoto={includePhoto}
          includeCost={includeCost && canCost}
        />
      )}
    </PrintFrame>
  )
}
