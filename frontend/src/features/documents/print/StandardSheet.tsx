import type { ReactNode } from 'react'

import { TASTE_AXES } from '@/components/TasteAxis'
import { useI18n } from '@/i18n'
import type { DishStandard } from '@/types/api'

/**
 * A QA/QC dish standard rendered for print — the expected values only (no
 * blank score columns; that is the separate scoresheet document). Used inside
 * the Station pack.
 */
export function StandardSheet({ std, pageBreakBefore }: { std: DishStandard; pageBreakBefore?: boolean }) {
  const { t, locale } = useI18n()

  const specs: [string, string | null][] = [
    [
      'Portion weight',
      std.portion_weight_g
        ? `${std.portion_weight_g} ± ${std.portion_tolerance_g ?? 0} g`
        : null,
    ],
    [
      'Serving temperature',
      std.serving_temp_c ? `${std.serving_temp_c} ± ${std.temp_tolerance_c ?? 0} °C` : null,
    ],
    ['Holding time', std.holding_time_minutes != null ? `${std.holding_time_minutes} min max` : null],
    ['Primary flavour', std.primary_flavor || null],
    ['Secondary flavour', std.secondary_flavor || null],
    ['Aftertaste', std.aftertaste || null],
    ['Mouthfeel', std.mouthfeel || null],
  ]
  const specRows = specs.filter(([, v]) => v)

  const sensory: [string, string][] = (
    [
      ['Appearance', std.appearance],
      ['Colour', std.color],
      ['Aroma', std.aroma],
      ['Texture', std.texture],
      ['Presentation', std.presentation],
    ] as [string, string][]
  ).filter(([, v]) => v)

  const axes = TASTE_AXES.filter(([key]) => {
    const v = std[`${key}_target`]
    return v !== null && v !== undefined && v !== ''
  })

  const isEmpty =
    specRows.length === 0 &&
    sensory.length === 0 &&
    axes.length === 0 &&
    !std.freshness_standard &&
    !std.critical_defects_not_allowed

  return (
    <section className={pageBreakBefore ? 'doc-page-break' : undefined}>
      <h2 className="doc-section mb-3 border-b-2 border-current pb-1 font-display text-[16px] font-semibold">
        {t('documents.sheet.standard')}
      </h2>

      {isEmpty && <p className="text-[12px] opacity-70">{t('documents.emptyStandard')}</p>}

      {specRows.length > 0 && (
        <Block title="Specification">
          <table>
            <tbody>
              {specRows.map(([label, value]) => (
                <tr key={label}>
                  <td className="w-[40%] font-semibold">{label}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      {sensory.length > 0 && (
        <Block title="Sensory standard">
          <table>
            <tbody>
              {sensory.map(([label, value]) => (
                <tr key={label}>
                  <td className="w-[22%] font-semibold">{label}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      {axes.length > 0 && (
        <Block title="Taste targets">
          <table>
            <tbody>
              {axes.map(([key, en, ar]) => {
                const target = Number(std[`${key}_target`])
                const tol = Number(std[`${key}_tolerance`]) || 0
                return (
                  <tr key={key}>
                    <td className="w-[40%] font-semibold">{locale === 'ar' ? ar : en}</td>
                    <td className="font-mono">
                      {target.toFixed(1)} ± {tol.toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Block>
      )}

      {std.freshness_standard && (
        <Block title="Freshness">
          <p>{std.freshness_standard}</p>
        </Block>
      )}
      {std.critical_defects_not_allowed && (
        <Block title="Critical defects — not allowed">
          <p>{std.critical_defects_not_allowed}</p>
        </Block>
      )}
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="doc-section mb-3 text-[12px]">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]">{title}</h3>
      {children}
    </div>
  )
}
