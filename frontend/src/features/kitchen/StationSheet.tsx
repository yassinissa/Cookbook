import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/Button'
import { useI18n } from '@/i18n'
import type { IngredientLine, StepLine } from '@/types/api'

/*
 * The cook's station sheet — the paper recipe card, on the iPad: a black
 * title band, the photo, the rev/station line and the ingredients (qty + item
 * code) on one side, Preparation & Method on the other.
 *
 * On anything wide enough for the two columns the sheet is *fitted to the
 * screen*: it takes exactly the height left under the top bar and, when the
 * recipe is too long for that, lays itself out on a bigger canvas and scales
 * the whole thing down — "zoomed out" — until every ingredient and step is
 * visible. An iPad stood up at the station is read, not scrolled. Narrow
 * screens (phones) get the same content as an ordinary stacked, scrolling page.
 */

const FIT_QUERY = '(min-width: 680px)'
/** Don't shrink past this — beyond it the text is too small to read anyway. */
const MAX_ZOOM_OUT = 2.6
/** Share of the sheet's height the photo is guaranteed before anything shrinks. */
const PHOTO_MIN_SHARE = 0.34

export interface SheetFact {
  label: string
  value: string
}

export function StationSheet({
  backLabel,
  onBack,
  nameEn,
  nameAr,
  photo,
  meta,
  facts,
  banner,
  ingredients,
  steps,
  children,
}: {
  backLabel: string
  onBack: () => void
  nameEn: string
  nameAr?: string
  /** The dish photo — omitted for production batches, which have none. */
  photo?: ReactNode
  /** The card's "Rev · date · section · category" line. */
  meta: string[]
  /** Headline numbers under the meta line: time of preparation, batch yield. */
  facts: SheetFact[]
  /** Allergens strip (dishes). */
  banner?: ReactNode
  ingredients: IngredientLine[]
  steps: StepLine[]
  /** Anything that follows the sheet (QA standard, plating guide…). */
  children?: ReactNode
}) {
  const { t } = useI18n()
  const fit = useMediaQuery(FIT_QUERY)
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    if (!fit) {
      outer.style.height = ''
      inner.style.width = ''
      inner.style.transform = ''
      inner.style.removeProperty('--sheet-h')
      return
    }

    const refit = () => {
      // distance from the top of the document, ignoring entrance transforms
      let top = 0
      for (let el: HTMLElement | null = outer; el; el = el.offsetParent as HTMLElement | null) {
        top += el.offsetTop
      }
      const availW = outer.clientWidth
      const availH = Math.max(360, window.innerHeight - top - 12)
      outer.style.height = `${availH}px`

      // grow the canvas (= zoom out) until neither column overflows
      const columns = Array.from(inner.querySelectorAll<HTMLElement>('[data-fit]'))
      let zoom = 1
      for (;;) {
        inner.style.width = `${availW * zoom}px`
        inner.style.setProperty('--sheet-h', `${availH * zoom}px`)
        inner.style.transform = zoom === 1 ? '' : `scale(${1 / zoom})`
        const overflows = columns.some((c) => c.scrollHeight > c.clientHeight + 1)
        if (!overflows || zoom >= MAX_ZOOM_OUT) break
        zoom *= 1.04
      }
    }

    refit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit)
    observer?.observe(outer)
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    // webfonts land after first paint and change every line's height
    document.fonts?.ready.then(refit).catch(() => {})
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', refit)
      window.removeEventListener('orientationchange', refit)
    }
  }, [fit, nameEn, nameAr, meta, facts, banner, ingredients, steps])

  return (
    <div className="stagger mx-auto w-full max-w-[1700px] px-3 py-3 sm:px-5">
      <div className="mb-2 no-print">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={onBack}>
          {backLabel}
        </Button>
      </div>

      <div ref={outerRef} className={fit ? 'relative overflow-hidden' : undefined}>
        <div
          ref={innerRef}
          className={
            fit
              ? 'absolute left-0 top-0 grid origin-top-left grid-cols-2 gap-5'
              : 'grid grid-cols-1 gap-4'
          }
        >
          {/* left — what it is and what goes in it */}
          <section
            data-fit
            className="flex flex-col overflow-hidden rounded-card border border-hairline bg-surface shadow-e2"
            style={fit ? { height: 'var(--sheet-h)' } : undefined}
          >
            {/* the card's black title band — fixed colours, same in both themes */}
            <header className="flex flex-none flex-wrap items-baseline justify-between gap-x-5 gap-y-1 bg-[#14110f] px-5 py-3">
              <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-white">
                {nameEn}
              </h1>
              {nameAr && (
                <p dir="rtl" className="text-[1.4rem] leading-tight text-white/90">
                  {nameAr}
                </p>
              )}
            </header>

            {photo && (
              <div
                className={
                  fit ? 'relative flex-1 bg-[#14110f]' : 'relative aspect-[3/2] w-full bg-[#14110f]'
                }
                style={fit ? { minHeight: `calc(var(--sheet-h) * ${PHOTO_MIN_SHARE})` } : undefined}
              >
                <div className="absolute inset-0">{photo}</div>
              </div>
            )}

            {(meta.length > 0 || facts.length > 0) && (
              <div className="flex-none space-y-0.5 border-b border-hairline px-5 py-2.5">
                {meta.length > 0 && (
                  <p className="text-[13px] font-semibold text-ink">{meta.join('  ·  ')}</p>
                )}
                {facts.length > 0 && (
                  <p className="flex flex-wrap items-baseline gap-x-6 gap-y-0.5">
                    {facts.map((f) => (
                      <span key={f.label} className="flex items-baseline gap-2 text-[13px] font-semibold text-ink-muted">
                        {f.label}
                        <span className="tnum font-mono text-[17px] font-semibold text-ink">{f.value}</span>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            {banner && <div className="flex-none">{banner}</div>}

            {ingredients.length === 0 ? (
              <p className="flex-none px-5 py-5 text-sm text-ink-subtle">{t('kitchen.sheet.noIngredients')}</p>
            ) : (
              <table className="w-full flex-none text-[15px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                    <th scope="col" className="pb-1.5 pe-3 ps-5 pt-2.5 text-start font-semibold">
                      {t('editor.section.ingredients')}
                    </th>
                    <th scope="col" className="px-3 pb-1.5 pt-2.5 text-end font-semibold">
                      {t('editor.ing.qty')}
                    </th>
                    <th scope="col" className="pb-1.5 pe-5 ps-3 pt-2.5 text-start font-semibold">
                      {t('dishes.col.code')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline border-t border-hairline">
                  {ingredients.map((i) => (
                    <tr key={i.id ?? i.item_sku}>
                      <td className="py-1.5 pe-3 ps-5 text-ink">
                        {i.item_name_snapshot}
                        {i.prep_note && <span className="text-ink-subtle"> · {i.prep_note}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-1.5 text-end font-mono font-semibold text-ink">
                        {i.quantity} {i.unit_detail?.code ?? ''}
                      </td>
                      <td className="tnum whitespace-nowrap py-1.5 pe-5 ps-3 font-mono text-[13px] text-ink-muted">
                        {i.item_sku}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* right — how to make it */}
          <section
            data-fit
            className="overflow-hidden rounded-card border border-hairline bg-surface-raised px-6 py-4 shadow-e2"
            style={fit ? { height: 'var(--sheet-h)' } : undefined}
          >
            <h2 className="mb-3 border-b border-hairline pb-2.5 font-display text-[1.35rem] font-medium tracking-tight text-ink">
              {t('kitchen.sheet.method')}
            </h2>
            {steps.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t('kitchen.sheet.noSteps')}</p>
            ) : (
              <ol className="space-y-2.5">
                {steps.map((s) => (
                  <li key={s.id ?? s.step_number} className="flex gap-3">
                    <span className="spice-rail mt-px flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[11px] font-semibold text-white">
                      {s.step_number}
                    </span>
                    <p className="text-[17px] leading-snug text-ink">{s.instruction}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {children && <div className="mt-5 space-y-5">{children}</div>}
    </div>
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return matches
}
