import { useEffect, useState } from 'react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { Page, PageHeader, BiName } from '@/components/Page'
import { Pill } from '@/components/Pill'
import { EmptyState, ErrorState, LoadingRow, Skeleton } from '@/components/States'
import { useInventoryItem, useInventoryItemsPage } from '@/lib/queries'
import { kwd, number } from '@/lib/format'
import { useI18n } from '@/i18n'
import type { InventoryItem } from '@/types/api'

const PAGE_SIZE = 25
const keyOf = (i: InventoryItem) => i.id || i.sku

export function InventoryListPage() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  // debounce the field into the query term, and reset to page 1 on a new search
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [q])

  const { data, isLoading, isError, isFetching, refetch } = useInventoryItemsPage(
    search,
    page,
    PAGE_SIZE,
  )

  const items = data?.results ?? []
  const total = data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = (page - 1) * PAGE_SIZE

  return (
    <Page stagger>
      <PageHeader
        eyebrow={t('app.group')}
        title={t('nav.inventory')}
        subtitle={data ? t('inv.count', { n: number(total) }) : undefined}
      />

      <div className="mb-4 max-w-xs">
        <div className="relative">
          <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
            <Icon name="search" size={15} />
          </span>
          <Input
            className="ps-8"
            placeholder={t('inv.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('inv.search')}
          />
        </div>
      </div>

      {isError && (
        <ErrorState
          title={t('inv.error.title')}
          body={t('inv.error.body')}
          onRetry={() => refetch()}
        />
      )}

      {isLoading && <ListSkeleton />}

      {data && items.length === 0 && (
        <EmptyState
          icon="inventory"
          title={search ? t('inv.empty.filtered') : t('inv.empty.all')}
          body={search ? undefined : t('inv.empty.allBody')}
        />
      )}

      {data && items.length > 0 && (
        <>
          <Card
            elevated
            rail="idle"
            className={`hidden overflow-hidden transition-opacity md:block ${isFetching ? 'opacity-60' : ''}`}
          >
            <div className="scroll-x">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-sunken text-[11px] uppercase tracking-[0.06em] text-ink-subtle">
                    <th className="py-2.5 pe-3 ps-5 text-start font-semibold">{t('inv.col.sku')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('inv.col.name')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('inv.col.category')}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t('inv.col.unit')}</th>
                    <th className="px-5 py-2.5 text-end font-semibold">{t('inv.col.unitCost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {items.map((i) => (
                    <tr
                      key={keyOf(i)}
                      onClick={() => setOpenId(keyOf(i))}
                      className="cursor-pointer transition-colors hover:bg-surface-sunken"
                    >
                      <td className="tnum py-2.5 pe-3 ps-5 font-mono text-xs text-ink-muted">
                        {i.sku}
                      </td>
                      <td className="px-3 py-2.5">
                        <BiName en={i.name_en} ar={i.name_ar} className="font-medium" />
                        {i.is_active === false && (
                          <Pill tone="neutral" className="ms-2">
                            {t('inv.inactive')}
                          </Pill>
                        )}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-ink-muted">
                        {i.category?.replace(/_/g, ' ') || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {i.unit_code || i.unit_name || '—'}
                      </td>
                      <td className="tnum px-5 py-2.5 text-end font-mono text-ink">
                        {kwd(i.unit_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <ul className={`space-y-2 md:hidden ${isFetching ? 'opacity-60' : ''}`}>
            {items.map((i) => (
              <li key={keyOf(i)}>
                <button
                  type="button"
                  onClick={() => setOpenId(keyOf(i))}
                  className="block w-full rounded-card border border-hairline bg-surface p-3.5 text-start transition-colors active:bg-surface-sunken"
                >
                  <div className="flex items-start justify-between gap-2">
                    <BiName en={i.name_en} ar={i.name_ar} className="font-medium" />
                    <span className="tnum flex-none font-mono text-xs text-ink-subtle">{i.sku}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[13px] text-ink-subtle">
                    <span className="capitalize">
                      {i.category?.replace(/_/g, ' ') || '—'}
                      {(i.unit_code || i.unit_name) && ` · ${i.unit_code || i.unit_name}`}
                    </span>
                    <span className="tnum font-mono text-ink">{kwd(i.unit_cost)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-subtle">
            <span className="tnum">
              {t('inv.range', {
                from: number(from + 1),
                to: number(from + items.length),
                total: number(total),
              })}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="chevronLeft"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                >
                  {t('inv.prev')}
                </Button>
                <span className="tnum px-2">
                  {number(page)} / {number(pageCount)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  iconEnd="chevronRight"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount || isFetching}
                >
                  {t('inv.next')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ItemDrawer id={openId} onClose={() => setOpenId(null)} />
    </Page>
  )
}

function ItemDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useInventoryItem(id ?? undefined)

  return (
    <Drawer open={!!id} onClose={onClose} title={data?.name_en ?? t('nav.inventory')} width="md">
      {isLoading && <LoadingRow label={t('state.loading')} />}
      {isError && (
        <ErrorState title={t('inv.error.title')} body={t('inv.error.body')} onRetry={() => refetch()} />
      )}
      {data && (
        <div className="space-y-5">
          <div>
            <p className="font-display text-xl font-medium text-ink">{data.name_en}</p>
            {data.name_ar && (
              <p dir="rtl" className="mt-0.5 text-sm text-ink-subtle">
                {data.name_ar}
              </p>
            )}
            <p className="tnum mt-1 font-mono text-xs text-ink-subtle">{data.sku}</p>
          </div>

          <dl className="divide-y divide-hairline rounded-card border border-hairline">
            <Row
              label={t('inv.col.category')}
              value={data.category_display ?? data.category?.replace(/_/g, ' ')}
            />
            <Row label={t('inv.detail.type')} value={data.item_type_display} />
            <Row
              label={t('inv.col.unit')}
              value={
                data.unit_detail
                  ? `${data.unit_detail.code} · ${data.unit_detail.name_en}`
                  : data.unit_code
              }
            />
            <Row
              label={t('inv.col.unitCost')}
              value={data.unit_cost ? `${kwd(data.unit_cost)} KWD` : undefined}
              mono
            />
            <Row
              label={t('inv.detail.sellingPrice')}
              value={data.selling_price ? `${kwd(data.selling_price)} KWD` : undefined}
              mono
            />
            <Row label={t('inv.detail.reorder')} value={data.reorder_level} mono />
            <Row
              label={t('inv.detail.shelfLife')}
              value={
                data.shelf_life_value
                  ? `${data.shelf_life_value} ${data.shelf_life_unit ?? ''}`.trim()
                  : undefined
              }
            />
            <Row
              label={t('inv.detail.expiry')}
              value={
                data.expiry_tracking
                  ? t('inv.detail.expiryOn', { d: data.expiry_alert_days ?? 0 })
                  : data.expiry_tracking === false
                    ? t('inv.detail.expiryOff')
                    : undefined
              }
            />
            <Row label={t('inv.detail.location')} value={data.default_location_name} />
            <Row
              label={t('inv.detail.suppliers')}
              value={
                data.suppliers_info?.length
                  ? data.suppliers_info.map((s) => s.name_en).join(', ')
                  : undefined
              }
            />
            <Row label={t('inv.detail.notes')} value={data.notes} />
            <Row
              label={t('inv.detail.status')}
              value={data.is_active === false ? t('inv.inactive') : t('inv.active')}
            />
          </dl>

          <p className="text-xs text-ink-subtle">{t('inv.source')}</p>
        </div>
      )}
    </Drawer>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value?: string | number | null
  mono?: boolean
}) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
      <dt className="flex-none text-[13px] text-ink-subtle">{label}</dt>
      <dd className={`text-end text-[13px] text-ink ${mono ? 'tnum font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function ListSkeleton() {
  return (
    <Card elevated className="overflow-hidden">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-hairline px-5 py-3 last:border-0"
        >
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="ms-auto h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </Card>
  )
}
