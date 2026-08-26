import { Card, CardBody, CardHeader } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/cn'
import type { AllergenRollup, NutritionRollup } from '@/types/api'

const ROWS: [keyof NutritionRollup, string, string, string][] = [
  ['calories', 'Calories', 'السعرات', 'kcal'],
  ['fat_g', 'Fat', 'الدهون', 'g'],
  ['saturated_fat_g', 'Saturated fat', 'الدهون المشبعة', 'g'],
  ['trans_fat_g', 'Trans fat', 'الدهون المتحولة', 'g'],
  ['cholesterol_mg', 'Cholesterol', 'الكوليسترول', 'mg'],
  ['sodium_mg', 'Sodium', 'الصوديوم', 'mg'],
  ['carbs_g', 'Carbohydrate', 'الكربوهيدرات', 'g'],
  ['fibers_g', 'Fibre', 'الألياف', 'g'],
  ['sugars_g', 'Sugars', 'السكريات', 'g'],
  ['added_sugars_g', 'Added sugars', 'السكر المضاف', 'g'],
  ['protein_g', 'Protein', 'البروتين', 'g'],
]

function fmt(v: string | undefined) {
  if (v === undefined) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n < 10 ? n.toFixed(1) : Math.round(n).toString()
}

function isNutrition(n: unknown): n is NutritionRollup {
  return !!n && typeof n === 'object' && Object.keys(n).some((k) => k !== '_coverage')
}

export function NutritionPanel({
  nutrition,
}: {
  nutrition: NutritionRollup | Record<string, never> | null | undefined
}) {
  const { t } = useI18n()
  const n = isNutrition(nutrition) ? nutrition : null
  const cov = n?._coverage

  return (
    <Card>
      <CardHeader
        title={
          <span>
            {t('nutrition.title')}{' '}
            <span className="font-normal text-ink-subtle">· {t('nutrition.perServing')}</span>
          </span>
        }
        action={
          cov ? (
            <span
              className={cn(
                'text-2xs',
                cov.covered < cov.total ? 'text-warning-ink' : 'text-ink-subtle',
              )}
            >
              {t('nutrition.coverage', { covered: cov.covered, total: cov.total })}
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {!n ? (
          <p className="text-sm text-ink-subtle">{t('nutrition.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-hairline">
              {ROWS.map(([key, en, ar, unit]) => (
                <tr key={key}>
                  <td className="py-1.5 text-ink-muted">
                    {en} <span dir="rtl" className="text-xs text-ink-subtle">{ar}</span>
                  </td>
                  <td className="tnum py-1.5 text-end text-ink">
                    {fmt(n[key] as string | undefined)}{' '}
                    <span className="text-xs text-ink-subtle">{unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  )
}

export function AllergenPanel({ rollup }: { rollup: AllergenRollup | null | undefined }) {
  const { t } = useI18n()
  if (!rollup) return null
  const all = rollup.all ?? []
  return (
    <Card>
      <CardHeader title={t('allergens.title')} />
      <CardBody>
        {all.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t('allergens.none')}</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {all.map((a) => (
                <Pill key={a} tone="danger" icon="alert">
                  {a}
                </Pill>
              ))}
            </div>
            {rollup.from_ingredients?.length > 0 && (
              <ul className="space-y-0.5 text-xs text-ink-subtle">
                {rollup.from_ingredients.map((i) => (
                  <li key={i.sku}>
                    <span className="text-ink-muted">{i.name}</span>
                    <span className="tnum text-ink-subtle"> {i.sku}</span> — {i.allergens.join(', ')}
                  </li>
                ))}
              </ul>
            )}
            {rollup.dish?.length > 0 && (
              <p className="mt-2 text-xs text-ink-subtle">
                {t('allergens.taggedOnDish', { list: rollup.dish.join(', ') })}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
