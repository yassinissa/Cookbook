/* Pieces shared by the two chronological feeds — Activity & History and
 * Recipe Changes: day grouping, the filter-bar field wrapper, the pager and
 * the loading skeleton. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/States'
import { useI18n } from '@/i18n'

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2">
      <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * A search box whose value lives in the URL. Typing is held locally and
 * written to the URL once it pauses — writing every keystroke straight to the
 * search params drops characters when keys land faster than the router
 * re-renders, and fires a request per letter.
 */
export function useSearchParamInput(value: string, commit: (v: string) => void, delay = 250) {
  const [text, setText] = useState(value)
  const committed = useRef(value)
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  // the URL changed from outside — "clear filters", back / forward
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => {
    if (text === committed.current) return
    const id = setTimeout(() => {
      committed.current = text
      commitRef.current(text)
    }, delay)
    return () => clearTimeout(id)
  }, [text, delay])

  return [text, setText] as const
}

export interface DayGroup<T> {
  key: string
  label: string
  entries: T[]
}

export function groupByDay<T extends { created_at: string }>(
  entries: T[],
  locale: 'en' | 'ar',
): DayGroup<T>[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const out: DayGroup<T>[] = []
  for (const e of entries) {
    const d = new Date(e.created_at)
    const dayStart = new Date(d)
    dayStart.setHours(0, 0, 0, 0)
    const key = String(dayStart.getTime())
    let group = out.find((g) => g.key === key)
    if (!group) {
      const label =
        dayStart.getTime() === today.getTime()
          ? locale === 'ar'
            ? 'اليوم'
            : 'Today'
          : dayStart.getTime() === yesterday.getTime()
            ? locale === 'ar'
              ? 'أمس'
              : 'Yesterday'
            : d.toLocaleDateString(locale === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
      group = { key, label, entries: [] }
      out.push(group)
    }
    group.entries.push(e)
  }
  return out
}

export function FeedPager({
  page,
  numPages,
  pageSize,
  count,
  onPage,
}: {
  page: number
  numPages: number
  pageSize: number
  count: number
  onPage: (page: number) => void
}) {
  const { t } = useI18n()
  const from = count ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(page * pageSize, count)
  return (
    <div className="mt-6 flex items-center justify-between">
      <p className="text-xs text-ink-subtle">{t('activity.range', { from, to, total: count })}</p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon="chevronLeft"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('activity.prev')}
        </Button>
        <span className="tnum text-xs text-ink-subtle">
          {page} / {numPages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= numPages} onClick={() => onPage(page + 1)}>
          {t('activity.next')}
          <Icon name="chevronRight" size={14} className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  )
}

export function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Card className="overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-hairline px-4 py-3.5 last:border-0">
                <Skeleton className="h-7 w-7 flex-none rounded-full" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="ms-auto h-3 w-10" />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}
