import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, LoadingRow } from '@/components/States'
import { useDishStandard, useDishStandards } from '@/lib/queries'
import { useI18n } from '@/i18n'
import { ScoreSheet } from '@/features/standards/ScoreSheet'
import { PrintFrame } from './print/PrintFrame'
import { RecipePicker, type PickerOption } from './RecipePicker'
import { ControlBar, Ctl } from './controls'

/* The shared <ScoreSheet> is authored `hidden print:block` for embedding in the
   Standard detail page; here it is the whole document, so force it visible and
   give its tables borders on screen too. */
const PREVIEW_CSS = `
  .doc-scoresheet .print-sheet { display: block !important; color: var(--ink); }
  .doc-scoresheet .print-sheet table { width: 100%; border-collapse: collapse; }
  .doc-scoresheet .print-sheet th,
  .doc-scoresheet .print-sheet td {
    border: 1px solid var(--hairline-strong);
    padding: 6px 8px; text-align: start; vertical-align: top;
  }
`

export function ScoreSheetPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  const [dishId, setDishId] = useState<string | null>(null)

  const standards = useDishStandards()
  const detail = useDishStandard(dishId ?? undefined)

  const options: PickerOption[] = useMemo(
    () =>
      (standards.data ?? [])
        .map((r) => ({
          id: r.id,
          name_en: r.name_en,
          name_ar: r.name_ar,
          recipe_code: r.recipe_code,
          hint: !r.has_standard
            ? t('standards.status.missing')
            : !r.is_approved
              ? t('standards.status.review')
              : undefined,
        }))
        .sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [standards.data, t],
  )

  const controls = (
    <ControlBar>
      <Ctl label={t('documents.pickDish')} className="sm:col-span-2 lg:col-span-4">
        <RecipePicker
          value={dishId}
          options={options}
          onSelect={setDishId}
          placeholder={t('documents.pickDish')}
        />
      </Ctl>
    </ControlBar>
  )

  const std = detail.data?.standard ?? null

  return (
    <PrintFrame
      title={t('documents.scoresheet.title')}
      subtitle={detail.data?.name_en}
      controls={controls}
      printDisabled={!std}
    >
      <style>{PREVIEW_CSS}</style>

      {!dishId ? (
        <EmptyState icon="camera" title={t('documents.empty.scoresheet')} />
      ) : detail.isLoading ? (
        <LoadingRow />
      ) : detail.isError || !detail.data ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : !std ? (
        <EmptyState
          icon="standards"
          title={t('documents.noStandard')}
          action={{
            label: t('documents.noStandard.cta'),
            icon: 'plus',
            onClick: () => navigate(`/standards/${dishId}/edit`),
          }}
        />
      ) : (
        <>
          {!detail.data.qa_approved_by && (
            <p className="no-print mb-4 rounded-lg border border-warning-subtle bg-warning-subtle px-4 py-3 text-sm text-warning-ink">
              {t('documents.notApproved')}
            </p>
          )}
          <div className="doc-scoresheet">
            <ScoreSheet data={detail.data} std={std} t={t} locale={locale} />
          </div>
        </>
      )}
    </PrintFrame>
  )
}
