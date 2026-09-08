import type { ReactNode } from 'react'

import { PinnedImage } from '@/components/PinnedImage'
import { useI18n, type TFunc } from '@/i18n'
import type { PlatingGuide } from '@/types/api'

function formatPickupWindow(seconds: number | null | undefined, t: TFunc) {
  if (seconds == null) return null
  if (seconds < 60) return t('plating.window.seconds', { n: seconds })
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? t('plating.window.minutes', { n: m }) : t('plating.window.minsec', { m, s })
}

/**
 * A plating guide rendered for print — pinned photos with their numbered
 * legend, plate spec, garnish, build notes, common errors, pickup window.
 * Used inside the Station pack.
 */
export function PlatingSheet({
  plating,
  dishName,
  pageBreakBefore,
}: {
  plating: PlatingGuide
  dishName: string
  pageBreakBefore?: boolean
}) {
  const { t, locale } = useI18n()
  const pick = (en: string, ar: string) => (locale === 'ar' ? ar || en : en || ar)

  const garnish = pick(plating.garnish_spec_en, plating.garnish_spec_ar)
  const build = pick(plating.build_notes_en, plating.build_notes_ar)
  const errors = pick(plating.common_errors_en, plating.common_errors_ar)
  const window = formatPickupWindow(plating.pickup_window_seconds, t)

  return (
    <section className={pageBreakBefore ? 'doc-page-break' : undefined}>
      <h2 className="doc-section mb-3 border-b-2 border-current pb-1 font-display text-[16px] font-semibold">
        {t('documents.sheet.plating')}
      </h2>

      {plating.images.length > 0 && (
        <div className="doc-section mb-4 space-y-4">
          {[...plating.images]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => (
              <figure key={img.id} className="space-y-1">
                <div className="max-w-[130mm]">
                  <PinnedImage src={img.image_url} alt={dishName} pins={img.pins} locale={locale} />
                </div>
                {(img.caption_en || img.caption_ar) && (
                  <figcaption className="text-[11px] opacity-80">
                    {pick(img.caption_en, img.caption_ar)}
                  </figcaption>
                )}
              </figure>
            ))}
        </div>
      )}

      <div className="doc-section space-y-2 text-[12px]">
        {plating.plate_spec && <Row label={t('documents.sheet.plateSpec')}>{plating.plate_spec}</Row>}
        {window && <Row label={t('documents.sheet.pickupWindow')}>{window}</Row>}
        {garnish && <Row label={t('documents.sheet.garnish')}>{garnish}</Row>}
        {build && <Row label={t('documents.sheet.build')}>{build}</Row>}
        {errors && <Row label={t('documents.sheet.errors')}>{errors}</Row>}
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em]">{label}</p>
      <p className="whitespace-pre-line leading-relaxed">{children}</p>
    </div>
  )
}
