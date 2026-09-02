import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card, CardBody } from '@/components/Card'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Drawer } from '@/components/Drawer'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useEffectiveMenu, useMenuPeriods } from '@/lib/queries'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { kwd, shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useI18n, type TFunc } from '@/i18n'
import type { MenuPeriod, MenuPeriodKind } from '@/types/api'
import { PeriodEditor } from './PeriodEditor'
import { EditionsPanel } from './EditionsPanel'

const KIND_DOT: Record<MenuPeriodKind, string> = {
  event: 'bg-accent',
  daily_special: 'bg-spice-2',
  seasonal: 'bg-spice-4',
}
const KIND_TEXT: Record<MenuPeriodKind, string> = {
  event: 'text-accent-ink',
  daily_special: 'text-spice-2',
  seasonal: 'text-spice-4',
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Monday = 0 … Sunday = 6 — matches the backend weekday_mask. */
function pyWeekday(d: Date) {
  return (d.getDay() + 6) % 7
}
function periodCovers(p: MenuPeriod, d: Date) {
  if (!p.is_live) return false
  const day = iso(d)
  if (day < p.starts_on) return false
  if (p.ends_on && day > p.ends_on) return false
  return (p.weekday_mask & (1 << pyWeekday(d))) !== 0
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(1 - pyWeekday(first))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function weekdaySummary(mask: number, t: TFunc) {
  if (mask === 0b1111111) return ''
  const keys = ['specials.day.mon', 'specials.day.tue', 'specials.day.wed', 'specials.day.thu', 'specials.day.fri', 'specials.day.sat', 'specials.day.sun'] as const
  return keys
    .filter((_, i) => mask & (1 << i))
    .map((k) => t(k).slice(0, 3))
    .join(' · ')
}

export function SpecialsCalendar({
  menuId,
  canEdit,
  branchSlug,
  canPublish,
}: {
  menuId: string
  canEdit: boolean
  branchSlug: string
  canPublish: boolean
}) {
  const { t, locale } = useI18n()
  const { data: periods, isLoading, isError, refetch } = useMenuPeriods(menuId)

  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [previewDate, setPreviewDate] = useState<string | null>(null)
  const [editing, setEditing] = useState<MenuPeriod | null>(null)
  const [creating, setCreating] = useState(false)

  const days = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor])
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const dayHeads = useMemo(
    () => monthGrid(2024, 0).slice(0, 7).map((d) => d.toLocaleDateString(locale, { weekday: 'short' })),
    [locale],
  )

  if (isLoading) return <Skeleton className="h-96" />
  if (isError) return <ErrorState title={t('specials.title')} onRetry={() => refetch()} />

  const list = periods ?? []

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">{t('specials.title')}</h2>
          <p className="max-w-prose text-sm text-ink-subtle">{t('specials.subtitle')}</p>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>
            {t('specials.new')}
          </Button>
        )}
      </div>

      {/* month calendar */}
      <Card elevated>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <p className="text-sm font-semibold capitalize text-ink">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {dayHeads.map((d, i) => (
              <div key={i} className="pb-1 text-2xs font-medium uppercase tracking-wide text-ink-subtle">
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              const inMonth = d.getMonth() === cursor.m
              const isToday = iso(d) === iso(today)
              const active = list.filter((p) => periodCovers(p, d))
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewDate(iso(d))}
                  className={cn(
                    'flex min-h-[3.2rem] flex-col items-center gap-1 rounded-lg border p-1.5 text-sm transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
                    inMonth ? 'border-hairline bg-surface hover:border-hairline-strong' : 'border-transparent text-ink-subtle/60',
                    isToday && 'border-accent',
                  )}
                >
                  <span className={cn('tnum', isToday && 'font-semibold text-accent-ink')}>{d.getDate()}</span>
                  <span className="flex gap-0.5">
                    {active.slice(0, 3).map((p) => (
                      <span key={p.id} className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[p.kind])} title={p.name_en} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-subtle">
            {(['event', 'daily_special', 'seasonal'] as MenuPeriodKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[k])} />
                {t(`specials.kind.${k}`)}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* period list */}
      {list.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t('specials.empty')}
          body={t('specials.empty.hint')}
          action={canEdit ? { label: t('specials.new'), icon: 'plus', onClick: () => setCreating(true) } : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 flex-none rounded-full', KIND_DOT[p.kind])} />
                      <span className="truncate font-medium text-ink">{p.name_en}</span>
                      <span className={cn('text-2xs font-medium uppercase tracking-wide', KIND_TEXT[p.kind])}>
                        {t(`specials.kind.${p.kind}`)}
                      </span>
                      {!p.is_live && (
                        <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-subtle">
                          {t('specials.draft')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {shortDate(p.starts_on, locale)}
                      {' – '}
                      {p.ends_on ? shortDate(p.ends_on, locale) : t('specials.field.endsOpen')}
                      {weekdaySummary(p.weekday_mask, t) && ` · ${weekdaySummary(p.weekday_mask, t)}`}
                      {` · ${p.line_count} ${t('specials.changes').toLowerCase()}`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-none gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        aria-label={t('specials.edit')}
                        className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-ink"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <DeleteButton menuId={menuId} period={p} t={t} />
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EditionsPanel menuId={menuId} branchSlug={branchSlug} canPublish={canPublish} />

      {previewDate && (
        <PreviewDrawer menuId={menuId} date={previewDate} onClose={() => setPreviewDate(null)} />
      )}
      {(creating || editing) && (
        <PeriodEditor
          menuId={menuId}
          period={editing}
          open
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function DeleteButton({ menuId, period, t }: { menuId: string; period: MenuPeriod; t: TFunc }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.deleteMenuPeriod(period.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.menuPeriods(menuId) })
      qc.invalidateQueries({ queryKey: ['menus', menuId, 'effective'] })
      toast.success(t('toast.periodDeleted'))
      setOpen(false)
    },
    onError: (e) => toast.error(parseApiError(e).message || t('state.errorGeneric')),
  })
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('action.delete')}
        className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-danger-ink"
      >
        <Icon name="trash" size={15} />
      </button>
      <ConfirmDialog
        open={open}
        title={t('specials.confirmDelete')}
        body={period.name_en}
        confirmLabel={t('action.delete')}
        danger
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

function PreviewDrawer({ menuId, date, onClose }: { menuId: string; date: string; onClose: () => void }) {
  const { t, locale } = useI18n()
  const { data, isLoading, isError, refetch } = useEffectiveMenu(menuId, date)

  return (
    <Drawer open onClose={onClose} width="md" title={t('specials.preview.title', { date: shortDate(date, locale) })}>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError || !data ? (
        <ErrorState title={t('specials.preview.title', { date })} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-subtle">
            {data.periods.length === 0
              ? t('specials.preview.base')
              : t('specials.preview.active', {
                  n: data.periods.length,
                  names: data.periods.map((p) => p.name_en).join(', '),
                })}
          </p>
          {data.categories.map((c) => (
            <div key={c.name}>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{c.name}</h3>
              <ul className="divide-y divide-hairline">
                {c.items.map((item) => (
                  <li key={item.dish_id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0">
                      <span className={cn('truncate', !item.is_available && 'text-ink-subtle line-through')}>
                        {item.name_en}
                      </span>
                      {item.source !== 'base' && (
                        <span className={cn('ms-2 text-2xs', KIND_TEXT[item.source])}>
                          {t('specials.preview.from', {
                            name: data.periods.find((p) => p.kind === item.source)?.name_en ?? t(`specials.kind.${item.source}`),
                          })}
                        </span>
                      )}
                    </span>
                    <span className="tnum flex-none text-ink-muted">{kwd(item.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}
