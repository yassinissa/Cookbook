import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { useAuth } from '@/auth/AuthProvider'
import { useInventoryItem, useItemStorage } from '@/lib/queries'
import { useI18n, type TFunc } from '@/i18n'
import { cn } from '@/lib/cn'

type Format = 'roll' | 'sheet'
const MAX_LABELS = 60

/* Kuwait has no DST, but pin the zone anyway so a use-by printed on a laptop
   set to another timezone still reads in kitchen-local time. */
const KWT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuwait',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const stamp = (d: Date) => KWT.format(d).replace(',', '')

const PAGE_CSS: Record<Format, string> = {
  roll: `@page { size: 62mm 30mm; margin: 2mm; }
  .label-sheet { display: block; }
  .label { width: 100%; height: 26mm; break-after: page; }
  .label:last-child { break-after: auto; }`,
  sheet: `@page { size: A4; margin: 10mm 8mm; }
  .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .label { height: 32mm; break-inside: avoid; }`,
}

export function LabelSheetPage() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { me } = useAuth()

  const item = useInventoryItem(itemId)
  const storage = useItemStorage(item.data?.sku)

  const [count, setCount] = useState(6)
  const [preppedBy, setPreppedBy] = useState(me?.display_name || me?.username || '')
  const [batch, setBatch] = useState('')
  const [opened, setOpened] = useState(false)
  const [format, setFormat] = useState<Format>('roll')

  const now = useMemo(() => new Date(), [])

  if (item.isLoading || (item.data && storage.isLoading)) return <LabelSkeleton />
  if (item.isError || !item.data) {
    return (
      <Page>
        <ErrorState title={t('labels.loadError')} onRetry={() => item.refetch()} />
      </Page>
    )
  }

  const s = storage.data
  const activeHours =
    opened && s?.opened_shelf_life_hours ? s.opened_shelf_life_hours : s?.shelf_life_hours ?? null
  const useBy = activeHours != null ? new Date(now.getTime() + activeHours * 3600_000) : null
  const labelNote = locale === 'ar' ? s?.label_notes_ar || s?.label_notes_en : s?.label_notes_en || s?.label_notes_ar
  const bandLabel = s?.storage_band ? s.storage_band_display : ''

  const n = Math.min(MAX_LABELS, Math.max(1, count || 1))

  return (
    <>
      <style>{`@media print {
        body { background: #fff !important; }
        .label-print-controls { display: none !important; }
        .label-print-area { margin: 0 !important; padding: 0 !important; max-width: none !important; }
        ${PAGE_CSS[format]}
      }`}</style>

      <Page className="label-print-area">
        <div className="label-print-controls no-print">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                icon="arrowLeft"
                onClick={() => navigate('/inventory')}
              >
                {t('nav.inventory')}
              </Button>
              <div>
                <h1 className="font-display text-[1.5rem] font-medium tracking-tight text-ink">
                  {t('labels.title')}
                </h1>
                <p className="text-xs text-ink-subtle">{item.data.name_en}</p>
              </div>
            </div>
            <Button variant="primary" size="sm" icon="documents" onClick={() => window.print()}>
              {t('labels.print')}
            </Button>
          </div>

          {!s?.shelf_life_hours ? (
            <ErrorState
              title={t('labels.noStorage.title')}
              body={t('labels.noStorage.body')}
            />
          ) : (
            <Card className="mb-6">
              <CardHeader title={t('labels.setup')} />
              <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t('labels.count')}>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_LABELS}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </Field>
                <Field label={t('labels.preppedBy')}>
                  <Input value={preppedBy} onChange={(e) => setPreppedBy(e.target.value)} />
                </Field>
                <Field label={t('labels.batch')} help={t('labels.batchHelp')}>
                  <Input value={batch} onChange={(e) => setBatch(e.target.value)} />
                </Field>
                <Field label={t('labels.format')}>
                  <Select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                    <option value="roll">{t('labels.format.roll')}</option>
                    <option value="sheet">{t('labels.format.sheet')}</option>
                  </Select>
                </Field>

                {s?.opened_shelf_life_hours ? (
                  <label className="flex items-center gap-2 text-[13px] text-ink sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={opened}
                      onChange={(e) => setOpened(e.target.checked)}
                      className="h-4 w-4 rounded border-hairline-strong accent-[var(--accent)]"
                    />
                    {t('labels.openedToggle', { h: s.opened_shelf_life_hours })}
                  </label>
                ) : null}

                <p className="text-xs text-ink-subtle sm:col-span-2 lg:col-span-4">
                  {t('labels.previewNote', { n, tz: 'Asia/Kuwait' })}
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {s?.shelf_life_hours && useBy && (
          <div
            className={cn(
              'label-sheet gap-3',
              format === 'sheet'
                ? 'grid grid-cols-2 sm:grid-cols-3'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {Array.from({ length: n }).map((_, i) => (
              <PrepLabel
                key={i}
                nameEn={item.data.name_en}
                nameAr={item.data.name_ar}
                sku={item.data.sku}
                band={bandLabel}
                prep={stamp(now)}
                useBy={stamp(useBy)}
                opened={opened}
                note={labelNote}
                preppedBy={preppedBy}
                batch={batch}
                t={t}
              />
            ))}
          </div>
        )}
      </Page>
    </>
  )
}

function PrepLabel({
  nameEn,
  nameAr,
  sku,
  band,
  prep,
  useBy,
  opened,
  note,
  preppedBy,
  batch,
  t,
}: {
  nameEn: string
  nameAr?: string
  sku: string
  band: string
  prep: string
  useBy: string
  opened: boolean
  note?: string
  preppedBy: string
  batch: string
  t: TFunc
}) {
  return (
    <div className="label flex flex-col justify-between rounded-md border border-black bg-white p-2 text-black">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight">{nameEn}</p>
          {nameAr && (
            <p dir="rtl" className="truncate text-[11px] leading-tight">
              {nameAr}
            </p>
          )}
        </div>
        {band && (
          <span className="flex-none rounded border border-black px-1 text-[9px] font-bold uppercase">
            {band}
          </span>
        )}
      </div>

      <div className="my-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px]">
        <span className="font-semibold">{t('labels.field.prep')}</span>
        <span>{prep}</span>
        <span className="font-semibold">
          {opened ? t('labels.field.useByOpened') : t('labels.field.useBy')}
        </span>
        <span className="text-[12px] font-bold">{useBy}</span>
      </div>

      {note && <p className="text-[9px] leading-tight">{note}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-black/40 pt-0.5 font-mono text-[9px]">
        <span className="truncate">
          {t('labels.field.by')}: {preppedBy || '—'}
        </span>
        <span className="truncate">
          {batch ? `${t('labels.field.batch')}: ${batch}` : sku}
        </span>
      </div>
    </div>
  )
}

function LabelSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-8 w-48" />
      <Skeleton className="mb-6 h-40" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </Page>
  )
}
