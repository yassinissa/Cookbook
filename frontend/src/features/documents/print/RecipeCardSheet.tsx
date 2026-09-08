import type { ReactNode } from 'react'

import { kwd, percent } from '@/lib/format'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'
import type { DishRecipeDetail, ProductionRecipeDetail } from '@/types/api'

export type DocLang = 'en' | 'ar' | 'both'

interface Props {
  kind: 'dish' | 'production'
  recipe: DishRecipeDetail | ProductionRecipeDetail
  lang: DocLang
  includePhoto?: boolean
  includeCost?: boolean
  /** start this card on a fresh page — for the prep-book batch */
  pageBreakBefore?: boolean
}

/**
 * One recipe (dish or production) rendered as an ink-on-white printable card.
 * Presentational only — the builder pages own data fetching and options.
 */
export function RecipeCardSheet({
  kind,
  recipe,
  lang,
  includePhoto = true,
  includeCost = true,
  pageBreakBefore,
}: Props) {
  const { t } = useI18n()

  const isDish = kind === 'dish'
  const dish = recipe as DishRecipeDetail
  const prod = recipe as ProductionRecipeDetail

  const scope = isDish ? dish.branch_name || dish.branch : prod.prep_kitchen
  const meta = [
    recipe.recipe_code && `#${recipe.recipe_code}`,
    recipe.revision,
    scope,
    isDish ? dish.category?.name : undefined,
    recipe.section?.name,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const cost = recipe.cost ?? ''
  const showCost = includeCost && !!cost && Number(cost) > 0
  const perUnit = isDish ? null : prod.cost_per_unit

  return (
    <article
      className={cn(
        'doc-sheet font-sans text-[12px] leading-snug',
        pageBreakBefore && 'doc-page-break',
      )}
    >
      <header className="doc-section mb-4 border-b-2 border-current pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {(lang === 'en' || lang === 'both') && (
              <h2 className="font-display text-[19px] font-semibold leading-tight">
                {recipe.name_en}
              </h2>
            )}
            {(lang === 'ar' || lang === 'both') && recipe.name_ar && (
              <p
                dir="rtl"
                className={cn(
                  'font-display leading-tight',
                  lang === 'ar' ? 'text-[19px] font-semibold' : 'mt-0.5 text-[14px]',
                )}
              >
                {recipe.name_ar}
              </p>
            )}
            {meta && <p className="mt-1 text-[11px] opacity-80">{meta}</p>}
          </div>
          {recipe.prep_time_minutes != null && (
            <p className="whitespace-nowrap text-end text-[11px]">
              {t('documents.sheet.prepTime')}
              <br />
              <span className="font-mono text-[13px] font-semibold">
                {t('documents.sheet.prepMinutes', { n: recipe.prep_time_minutes })}
              </span>
            </p>
          )}
        </div>
      </header>

      {isDish && includePhoto && dish.image_url && (
        <div className="doc-section mb-4">
          <img
            src={dish.image_url}
            alt=""
            className="max-h-[320px] w-full rounded border border-[#ccc] object-contain print:max-h-[78mm]"
          />
        </div>
      )}

      <Section title={t('documents.sheet.ingredients')}>
        {recipe.ingredients.length === 0 ? (
          <p className="opacity-70">{t('documents.sheet.noIngredients')}</p>
        ) : (
          <table>
            <tbody>
              {recipe.ingredients.map((i) => (
                <tr key={i.id ?? i.item_sku}>
                  <td>
                    {i.item_name_snapshot}
                    {i.prep_note && <span className="opacity-70"> · {i.prep_note}</span>}
                  </td>
                  <td className="w-[26%] whitespace-nowrap text-end font-mono">
                    {i.quantity} {i.unit_detail?.code ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t('documents.sheet.method')}>
        {recipe.steps.length === 0 ? (
          <p className="opacity-70">{t('documents.sheet.noSteps')}</p>
        ) : (
          <ol className="space-y-1.5">
            {[...recipe.steps]
              .sort((a, b) => a.step_number - b.step_number)
              .map((s) => (
                <li key={s.id ?? s.step_number} className="flex gap-2">
                  <span className="font-mono font-semibold">{s.step_number}.</span>
                  <span className="leading-relaxed">{s.instruction}</span>
                </li>
              ))}
          </ol>
        )}
      </Section>

      <Section title={t('documents.sheet.yield')}>
        <table>
          <tbody>
            {isDish
              ? dish.selling_price && (
                  <Row label={t('documents.sheet.portionPrice')} value={`${kwd(dish.selling_price)} KWD`} />
                )
              : (
                  <Row
                    label={t('documents.sheet.yield')}
                    value={`${prod.output_qty} ${prod.output_unit?.code ?? ''}`}
                  />
                )}
            {showCost && (
              <>
                <Row
                  label={
                    isDish ? t('documents.sheet.perServing') : t('documents.sheet.perUnit')
                  }
                  value={`${kwd(isDish ? cost : perUnit ?? cost)} KWD`}
                />
                {isDish && dish.food_cost_pct != null && (
                  <Row
                    label={t('documents.sheet.foodCost')}
                    value={percent(dish.food_cost_pct)}
                  />
                )}
              </>
            )}
          </tbody>
        </table>
      </Section>

      {isDish && dish.allergen_rollup?.all?.length > 0 && (
        <Section title={t('documents.sheet.allergens')}>
          <p>{dish.allergen_rollup.all.join(', ')}</p>
        </Section>
      )}
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doc-section mb-4">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <td className="w-[40%] font-semibold">{label}</td>
      <td className="font-mono">{value}</td>
    </tr>
  )
}
