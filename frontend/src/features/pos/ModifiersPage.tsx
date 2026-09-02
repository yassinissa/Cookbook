import { useState } from 'react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Page, PageHeader } from '@/components/Page'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { Pill } from '@/components/Pill'
import { useModifierGroups, useDishModifiers } from '@/lib/queries'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'
import type { ModifierGroup } from '@/types/api'
import { ModifierGroupEditor } from './ModifierGroupEditor'
import { DishModifierDrawer } from './DishModifierDrawer'

export function ModifiersPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'groups' | 'dishes'>('groups')

  return (
    <Page stagger>
      <PageHeader title={t('mods.title')} subtitle={t('mods.subtitle')} />

      <div role="tablist" className="mb-6 flex gap-1 border-b border-hairline">
        {(['groups', 'dishes'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
              tab === key ? 'border-accent text-ink' : 'border-transparent text-ink-subtle hover:text-ink',
            )}
          >
            {t(key === 'groups' ? 'mods.tab.groups' : 'mods.tab.dishes')}
          </button>
        ))}
      </div>

      {tab === 'groups' ? <GroupsTab /> : <DishesTab />}
    </Page>
  )
}

function GroupsTab() {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useModifierGroups()
  const [editing, setEditing] = useState<ModifierGroup | null>(null)
  const [creating, setCreating] = useState(false)

  if (isLoading) return <Skeleton className="h-72" />
  if (isError) return <ErrorState title={t('mods.title')} onRetry={() => refetch()} />

  const groups = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>
          {t('mods.new')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="pos"
          title={t('mods.empty')}
          body={t('mods.empty.hint')}
          action={{ label: t('mods.new'), icon: 'plus', onClick: () => setCreating(true) }}
        />
      ) : (
        <Card elevated className="overflow-hidden">
          <div className="scroll-x">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-ink-subtle">
                  <th className="px-4 py-2 text-start font-medium">{t('mods.col.group')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('mods.col.selection')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('mods.col.options')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('mods.col.dishes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {groups.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => setEditing(g)}
                    className="cursor-pointer hover:bg-surface-sunken"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">{g.name_en}</span>
                      {g.name_ar && <span dir="rtl" className="ms-2 text-xs text-ink-subtle">{g.name_ar}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {t(g.selection === 'single' ? 'mods.selection.single' : 'mods.selection.multi')}
                      {g.selection === 'multi' && g.max_select ? ` · ${g.min_select}–${g.max_select}` : ''}
                    </td>
                    <td className="tnum px-3 py-2.5 text-end text-ink-muted">{g.option_count}</td>
                    <td className="tnum px-3 py-2.5 text-end text-ink-muted">{g.dish_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(creating || editing) && (
        <ModifierGroupEditor
          group={editing}
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

function DishesTab() {
  const { t } = useI18n()
  const { data, isLoading, isError, refetch } = useDishModifiers()
  const [dishId, setDishId] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-72" />
  if (isError) return <ErrorState title={t('mods.title')} onRetry={() => refetch()} />

  const rows = data ?? []

  return (
    <div>
      <Card elevated className="overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-ink-subtle">
                <th className="px-4 py-2 text-start font-medium">{t('dishes.col.name')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('dishes.col.category')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('mods.col.group')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setDishId(d.id)}
                  className="cursor-pointer hover:bg-surface-sunken"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink">{d.name_en}</span>
                    {d.name_ar && <span dir="rtl" className="ms-2 text-xs text-ink-subtle">{d.name_ar}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{d.category_name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-end">
                    {d.group_count === 0 ? (
                      <span className="text-ink-subtle">—</span>
                    ) : (
                      <Pill tone="neutral">
                        {t('mods.dish.count', { groups: d.group_count, forced: d.forced_count })}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {dishId && <DishModifierDrawer dishId={dishId} onClose={() => setDishId(null)} />}
    </div>
  )
}
