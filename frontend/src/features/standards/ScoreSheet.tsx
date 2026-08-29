import type { ReactNode } from 'react'

import { TASTE_AXES } from '@/components/TasteAxis'
import { shortDate } from '@/lib/format'
import type { TFunc } from '@/i18n'
import type { DishStandard, DishStandardDetail } from '@/types/api'

/**
 * Print-only QA scoresheet. A QA assessor prints this for one dish, orders it
 * at a branch, then records what actually arrived against the approved
 * standard — expected value on the left, a blank to fill on the right.
 *
 * Rendered `hidden print:block` inside StandardDetailPage; the screen UI is
 * `print:hidden`. See the `@media print` block in styles/base.css.
 */
export function ScoreSheet({
  data,
  std,
  t,
  locale,
}: {
  data: DishStandardDetail
  std: DishStandard
  t: TFunc
  locale: 'en' | 'ar'
}) {
  const meta = [
    data.recipe_code && `#${data.recipe_code}`,
    data.branch,
    data.category,
    data.section,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const specs = [
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
    [
      'Holding time',
      std.holding_time_minutes != null ? `${std.holding_time_minutes} min max` : null,
    ],
    ['Primary flavour', std.primary_flavor || null],
    ['Secondary flavour', std.secondary_flavor || null],
    ['Aftertaste', std.aftertaste || null],
    ['Mouthfeel', std.mouthfeel || null],
  ] as [string, string | null][]

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
    const target = std[`${key}_target`]
    return target !== null && target !== undefined && target !== ''
  })

  return (
    <div className="print-sheet hidden font-sans text-[12px] leading-snug text-black print:block">
      <header className="mb-4 border-b-2 border-black pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {t('scoresheet.title')}
            </p>
            <h1 className="mt-1 text-[20px] font-bold">
              {data.name_en}
              {data.name_ar && (
                <span className="ms-2 text-[14px] font-normal" dir="rtl">
                  {data.name_ar}
                </span>
              )}
            </h1>
            {meta && <p className="mt-0.5 text-[11px]">{meta}</p>}
          </div>
          <div className="text-end text-[10px]">
            <p>
              {t('scoresheet.standardRef')} v{data.version}
            </p>
            <p>
              {data.qa_approved_by
                ? `${t('scoresheet.approvedBy')} ${data.qa_approved_by.name}` +
                  (std.approval_date ? ` · ${shortDate(std.approval_date, locale)}` : '')
                : t('scoresheet.notApproved')}
            </p>
          </div>
        </div>
      </header>

      <table className="mb-4">
        <tbody>
          <tr>
            <Th>{t('scoresheet.branchVisited')}</Th>
            <BlankTd />
            <Th>{t('scoresheet.orderTime')}</Th>
            <BlankTd />
          </tr>
          <tr>
            <Th>{t('scoresheet.assessor')}</Th>
            <BlankTd />
            <Th>{t('scoresheet.ticketNo')}</Th>
            <BlankTd />
          </tr>
        </tbody>
      </table>

      <SheetSection title={t('scoresheet.specs')}>
        <table>
          <thead>
            <tr>
              <th className="w-[26%]">{t('scoresheet.attribute')}</th>
              <th className="w-[30%]">{t('scoresheet.expected')}</th>
              <th className="w-[30%]">{t('scoresheet.actual')}</th>
              <th className="w-[14%]">{t('scoresheet.pass')}</th>
            </tr>
          </thead>
          <tbody>
            {specs.map(([label, value]) => (
              <tr key={label}>
                <td className="font-semibold">{label}</td>
                <td>{value ?? '—'}</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SheetSection>

      {sensory.length > 0 && (
        <SheetSection title={t('scoresheet.sensory')}>
          <table>
            <thead>
              <tr>
                <th className="w-[18%]">{t('scoresheet.attribute')}</th>
                <th className="w-[42%]">{t('scoresheet.standard')}</th>
                <th className="w-[40%]">{t('scoresheet.observed')}</th>
              </tr>
            </thead>
            <tbody>
              {sensory.map(([label, value]) => (
                <tr key={label}>
                  <td className="font-semibold">{label}</td>
                  <td>{value}</td>
                  <td style={{ height: '34px' }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SheetSection>
      )}

      {axes.length > 0 && (
        <SheetSection title={t('scoresheet.taste')}>
          <table>
            <thead>
              <tr>
                <th className="w-[34%]">{t('scoresheet.axis')}</th>
                <th className="w-[22%]">{t('scoresheet.target')}</th>
                <th className="w-[22%]">{t('scoresheet.score')}</th>
                <th className="w-[22%]">{t('scoresheet.withinTol')}</th>
              </tr>
            </thead>
            <tbody>
              {axes.map(([key, en, ar]) => {
                const label = locale === 'ar' ? ar : en
                const target = Number(std[`${key}_target`])
                const tol = Number(std[`${key}_tolerance`]) || 0
                return (
                  <tr key={key}>
                    <td className="font-semibold">{label}</td>
                    <td>
                      {target.toFixed(1)} ± {tol.toFixed(1)}
                    </td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </SheetSection>
      )}

      {std.freshness_standard && (
        <SheetSection title={t('scoresheet.freshness')}>
          <p className="mb-1">{std.freshness_standard}</p>
          <p>{t('scoresheet.meetsStandard')} &nbsp; Y &nbsp;/&nbsp; N</p>
        </SheetSection>
      )}

      {std.critical_defects_not_allowed && (
        <SheetSection title={t('scoresheet.criticalDefects')}>
          <p className="mb-1">{std.critical_defects_not_allowed}</p>
          <p>{t('scoresheet.anyObserved')} &nbsp; Y &nbsp;/&nbsp; N</p>
          <p className="mt-2">{t('scoresheet.detail')}</p>
          <div className="mt-1 h-10 border border-[#999]" />
        </SheetSection>
      )}

      <SheetSection title={t('scoresheet.outcome')}>
        <table>
          <tbody>
            <tr>
              <Th>{t('scoresheet.totalScore')}</Th>
              <BlankTd />
              <Th>{t('scoresheet.grade')}</Th>
              <td>{t('scoresheet.gradeOptions')}</td>
            </tr>
            <tr>
              <Th>{t('scoresheet.signature')}</Th>
              <BlankTd />
              <Th>{t('scoresheet.date')}</Th>
              <BlankTd />
            </tr>
          </tbody>
        </table>
      </SheetSection>

      <p className="mt-4 text-[9px] text-[#555]">{t('scoresheet.footer')}</p>
    </div>
  )
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]">{title}</h2>
      {children}
    </section>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <td className="w-[16%] whitespace-nowrap bg-[#eee] font-semibold">{children}</td>
}

function BlankTd() {
  return <td className="w-[34%]">&nbsp;</td>
}
