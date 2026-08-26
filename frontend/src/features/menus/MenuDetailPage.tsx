import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { TrendChart } from '@/components/Charts'
import { DishImage } from '@/components/DishImage'
import { FoodCostValue } from '@/components/Meter'
import { Icon } from '@/components/Icon'
import { Page, BiName } from '@/components/Page'
import { RatingPill } from '@/components/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useMenuByBranch, useMenuSnapshots, useMenuTrends, useReference, useUpdateMenuLine } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import { parseApiError } from '@/lib/parseApiError'
import { kwd, shortDate } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n, type TFunc } from '@/i18n'
import type { MenuLine } from '@/types/api'

export function MenuDetailPage() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t, locale } = useI18n()
  const { can } = useAuth()
  const canEdit = can('menu.edit')
  const canSnapshot = can('menu.snapshot')

  const { data: menu, isLoading, isError, refetch } = useMenuByBranch(branchId)
  const { data: ref } = useReference()
  const menuId = menu?.id
  const { data: trends } = useMenuTrends(menuId)
  const { data: snapshots } = useMenuSnapshots(menuId)
  const updateLine = useUpdateMenuLine(branchId ?? '')

  const [busy, setBusy] = useState<'build' | 'snapshot' | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; nameAr: string; order: number; lines: MenuLine[] }>()
    for (const line of menu?.lines ?? []) {
      const key = line.category ?? 'Uncategorised'
      if (!map.has(key))
        map.set(key, {
          name: key,
          nameAr: line.category_ar,
          order: line.category_order ?? 99,
          lines: [],
        })
      map.get(key)!.lines.push(line)
    }
    return [...map.values()].sort((a, b) => a.order - b.order)
  }, [menu])

  const branchName = ref?.branches.find((b) => b.id === branchId)

  async function runAction(kind: 'build' | 'snapshot') {
    if (!menuId) return
    setBusy(kind)
    try {
      if (kind === 'build') {
        await api.buildMenu(menuId)
        toast.success(t('toast.menuBuilt'))
      } else {
        await api.snapshotMenu(menuId, '')
        toast.success(t('toast.snapshotTaken'))
      }
      qc.invalidateQueries({ queryKey: qk.menuByBranch(branchId ?? '') })
      qc.invalidateQueries({ queryKey: qk.menuTrends(menuId) })
      qc.invalidateQueries({ queryKey: qk.menuSnapshots(menuId) })
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
    } finally {
      setBusy(null)
    }
  }

  function patchLine(line: MenuLine, payload: Partial<MenuLine>, successMsg: string) {
    updateLine.mutate(
      { lineId: line.id, payload },
      { onSuccess: () => toast.success(successMsg), onError: (e) => toast.error(parseApiError(e).message) },
    )
  }

  async function removeLine(line: MenuLine) {
    try {
      await api.deleteMenuLine(line.id)
      qc.invalidateQueries({ queryKey: qk.menuByBranch(branchId ?? '') })
      toast.success(`${line.dish_name} removed`)
    } catch (e) {
      toast.error(parseApiError(e).message || t('state.errorGeneric'))
    }
  }

  if (isLoading) return <MenuSkeleton />
  if (isError || !menu) {
    return (
      <Page>
        <ErrorState title="Could not load this menu" onRetry={() => refetch()} />
      </Page>
    )
  }

  const trendPoints = (trends?.points ?? []).map((p) => ({
    label: p.label || shortDate(p.date, locale),
    fcp: p.avg_food_cost_pct === null ? null : Number(p.avg_food_cost_pct),
    cost: Number(p.total_cost),
  }))

  return (
    <Page className="pb-24 lg:pb-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/menus')}>
            {t('menus.title')}
          </Button>
          <h1 className="mt-1 flex items-baseline gap-2 text-2xl font-semibold tracking-tight text-ink">
            {branchName?.name_en ?? menu.branch_detail.name_en}
            {branchName?.name_ar && (
              <span dir="rtl" className="text-base font-normal text-ink-subtle">
                {branchName.name_ar}
              </span>
            )}
          </h1>
          <p className="text-sm text-ink-subtle">{menu.line_count} {t('menus.col.dishes')}</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          {canEdit && (
            <Button variant="secondary" size="sm" icon="refresh" loading={busy === 'build'} onClick={() => runAction('build')}>
              {t('action.build')}
            </Button>
          )}
          {canSnapshot && (
            <Button variant="primary" size="sm" icon="camera" loading={busy === 'snapshot'} onClick={() => runAction('snapshot')}>
              {t('action.snapshot')}
            </Button>
          )}
        </div>
      </div>

      {trendPoints.length >= 2 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <TrendChart
            title={t('menus.trend.foodCost')}
            target={30}
            points={trendPoints.map((p) => ({ label: p.label, y: p.fcp }))}
            format={(v) => `${v.toFixed(1)}%`}
          />
          <TrendChart
            title={t('menus.trend.totalCost')}
            tone="positive"
            points={trendPoints.map((p) => ({ label: p.label, y: p.cost }))}
            format={(v) => v.toFixed(2)}
          />
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="menu"
          title={t('menus.empty')}
          action={canEdit ? { label: t('action.build'), icon: 'refresh', onClick: () => runAction('build') } : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card key={g.name} className="overflow-hidden">
              <div className="flex items-baseline gap-2 border-b border-hairline bg-surface-sunken px-4 py-2.5">
                <h2 className="text-sm font-semibold text-ink">{g.name}</h2>
                {g.nameAr && (
                  <span dir="rtl" className="text-xs text-ink-subtle">
                    {g.nameAr}
                  </span>
                )}
              </div>

              {/* desktop */}
              <div className="scroll-x hidden sm:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wide text-ink-subtle">
                      <th className="px-4 py-2 text-start font-medium">{t('dishes.col.name')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('menus.line.menuPrice')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('menus.line.cost')}</th>
                      <th className="px-3 py-2 text-end font-medium">{t('menus.line.foodCost')}</th>
                      <th className="px-3 py-2 text-center font-medium">{t('menus.line.available')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {g.lines.map((l) => (
                      <MenuRow
                        key={l.id}
                        line={l}
                        readOnly={!canEdit}
                        onPrice={(v) => patchLine(l, { menu_price: v || null }, t('toast.priceUpdated'))}
                        onAvailable={(v) =>
                          patchLine(l, { is_available: v }, t('toast.availabilityUpdated'))
                        }
                        onRemove={() => removeLine(l)}
                        t={t}
                        onNavigate={() => navigate(`/recipes/dishes/${l.dish}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* mobile */}
              <ul className="divide-y divide-hairline sm:hidden">
                {g.lines.map((l) => (
                  <li key={l.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 flex-none overflow-hidden rounded-md">
                          <DishImage src={l.image_url} name={l.dish_name} rounded="rounded-md" />
                        </div>
                        <BiName en={l.dish_name} ar={l.dish_name_ar} className="font-medium" />
                      </div>
                      <RatingPill status={l.rating_status} rating={l.rating} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[13px]">
                      <label className="flex items-center gap-2 text-ink-muted">
                        {t('menus.line.menuPrice')}
                        {canEdit ? (
                          <input
                            type="number"
                            step="0.001"
                            defaultValue={l.menu_price ?? ''}
                            placeholder={kwd(l.recipe_price)}
                            onBlur={(e) =>
                              patchLine(l, { menu_price: e.target.value || null }, t('toast.priceUpdated'))
                            }
                            className="tnum h-8 w-24 rounded-md border border-hairline bg-surface px-2 text-end"
                          />
                        ) : (
                          <span className="tnum text-ink">{kwd(l.effective_price)}</span>
                        )}
                      </label>
                      <FoodCostValue value={l.food_cost_pct} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {snapshots && snapshots.length > 0 && (
        <Card className="mt-6">
          <CardHeader title={t('menus.snapshots.title')} />
          <CardBody className="p-0">
            <ul className="divide-y divide-hairline">
              {[...snapshots].reverse().map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-ink">{s.label || 'Snapshot'}</span>
                    <span className="text-ink-subtle"> · {s.taken_by || 'system'}</span>
                  </div>
                  <span className="tnum text-ink-subtle">{shortDate(s.created_at, locale)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* mobile action bar */}
      {(canEdit || canSnapshot) && (
        <div className="fixed inset-x-0 bottom-16 z-30 flex gap-2 border-t border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
          {canEdit && (
            <Button variant="secondary" className="flex-1" size="sm" icon="refresh" loading={busy === 'build'} onClick={() => runAction('build')}>
              {t('action.build')}
            </Button>
          )}
          {canSnapshot && (
            <Button variant="primary" className="flex-1" size="sm" icon="camera" loading={busy === 'snapshot'} onClick={() => runAction('snapshot')}>
              {t('action.snapshot')}
            </Button>
          )}
        </div>
      )}
    </Page>
  )
}

function MenuRow({
  line,
  readOnly,
  onPrice,
  onAvailable,
  onRemove,
  onNavigate,
  t,
}: {
  line: MenuLine
  readOnly: boolean
  onPrice: (v: string) => void
  onAvailable: (v: boolean) => void
  onRemove: () => void
  onNavigate: () => void
  t: TFunc
}) {
  return (
    <tr className={line.is_available ? '' : 'opacity-55'}>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 flex-none overflow-hidden rounded-md">
            <DishImage src={line.image_url} name={line.dish_name} rounded="rounded-md" />
          </div>
          <button type="button" onClick={onNavigate} className="text-start hover:text-accent-ink">
            <BiName en={line.dish_name} ar={line.dish_name_ar} />
          </button>
          <RatingPill status={line.rating_status} rating={line.rating} />
        </div>
      </td>
      <td className="px-3 py-1.5 text-end">
        {readOnly ? (
          <span className="tnum text-[13px] text-ink">{kwd(line.effective_price)}</span>
        ) : (
          <input
            type="number"
            step="0.001"
            defaultValue={line.menu_price ?? ''}
            placeholder={kwd(line.recipe_price)}
            onBlur={(e) => onPrice(e.target.value)}
            aria-label={`${line.dish_name} menu price`}
            className="tnum h-8 w-24 rounded-md border border-hairline bg-surface px-2 text-end text-[13px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
          />
        )}
      </td>
      <td className="tnum px-3 py-2 text-end text-ink-subtle">{kwd(line.recipe_cost)}</td>
      <td className="px-3 py-2 text-end">
        <FoodCostValue value={line.food_cost_pct} />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={line.is_available}
          disabled={readOnly}
          onChange={(e) => onAvailable(e.target.checked)}
          aria-label={`${line.dish_name} available`}
          className="h-4 w-4 rounded border-hairline-strong text-accent disabled:opacity-50"
        />
      </td>
      <td className="px-3 py-2 text-end">
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="text-ink-subtle hover:text-danger-ink"
            aria-label={`${t('menus.line.remove')} ${line.dish_name}`}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </td>
    </tr>
  )
}

function MenuSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <Skeleton className="h-72" />
    </Page>
  )
}
