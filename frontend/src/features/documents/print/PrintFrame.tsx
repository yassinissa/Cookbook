import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { useI18n } from '@/i18n'

/**
 * Shared chrome for every Documents builder: a `no-print` toolbar (back to the
 * hub, the tool's own option controls, a Print / Save-PDF button) and a
 * print-scoped `<style>` block that strips the app shell so `window.print()`
 * yields a clean A4 sheet. Same technique as `LabelSheetPage`.
 */
export function PrintFrame({
  title,
  subtitle,
  controls,
  children,
  printDisabled,
}: {
  title: string
  subtitle?: string
  controls?: ReactNode
  children: ReactNode
  printDisabled?: boolean
}) {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <>
      <style>{`@media print {
        body { background: #fff !important; }
        body::before, body::after { display: none !important; }
        .doc-controls { display: none !important; }
        .doc-print-area { margin: 0 !important; padding: 0 !important; max-width: none !important; }
        @page { size: A4; margin: 14mm; }
      }`}</style>

      <Page className="doc-print-area">
        <div className="doc-controls no-print mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                icon="arrowLeft"
                onClick={() => navigate('/documents')}
              >
                {t('documents.back')}
              </Button>
              <div className="min-w-0">
                <h1 className="truncate font-display text-[1.5rem] font-medium tracking-tight text-ink">
                  {title}
                </h1>
                {subtitle && <p className="truncate text-xs text-ink-subtle">{subtitle}</p>}
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon="documents"
              disabled={printDisabled}
              onClick={() => window.print()}
            >
              {t('documents.savePdf')}
            </Button>
          </div>

          {controls}
        </div>

        {children}
      </Page>
    </>
  )
}
