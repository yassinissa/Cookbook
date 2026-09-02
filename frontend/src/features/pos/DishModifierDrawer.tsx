import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Icon } from '@/components/Icon'
import { Select } from '@/components/Input'
import { ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import { useDishModifier, useModifierGroups } from '@/lib/queries'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'
import type { ModifierRole } from '@/types/api'

interface Row {
  group: string
  group_name: string
  default_role: ModifierRole
}

export function DishModifierDrawer({ dishId, onClose }: { dishId: string; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: detail, isLoading, isError, refetch } = useDishModifier(dishId)
  const { data: allGroups } = useModifierGroups()

  const [rows, setRows] = useState<Row[]>([])
  const hydrated = useRef(false)

  useEffect(() => {
    if (detail && !hydrated.current) {
      hydrated.current = true
      setRows(detail.modifier_groups.map((g) => ({
        group: g.group, group_name: g.group_name, default_role: g.default_role,
      })))
    }
  }, [detail])

  const save = useMutation({
    mutationFn: () =>
      api.updateDishModifiers(dishId, rows.map((r, i) => ({
        group: r.group, default_role: r.default_role, sort_order: i,
      }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.dishModifiers })
      qc.invalidateQueries({ queryKey: qk.dishModifier(dishId) })
      qc.invalidateQueries({ queryKey: qk.modifierGroups })
      toast.success(t('toast.dishModsSaved'))
      onClose()
    },
    onError: (e) => toast.error(parseApiError(e).message || t('state.errorGeneric')),
  })

  const used = new Set(rows.map((r) => r.group))
  const available = (allGroups ?? []).filter((g) => !used.has(g.id))

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={detail ? detail.name_en : t('mods.panel.title')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" loading={save.isPending} onClick={() => save.mutate()}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError ? (
        <ErrorState title={t('mods.panel.title')} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-ink-subtle">{t('mods.dish.none')}</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.group} className="flex items-center gap-2 rounded-lg border border-hairline bg-surface p-2.5">
                  <span className="flex-1 text-sm font-medium text-ink">{r.group_name}</span>
                  <div className="flex overflow-hidden rounded-md border border-hairline text-xs">
                    {(['forced', 'optional'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setRows((all) => all.map((x, j) => (j === i ? { ...x, default_role: role } : x)))}
                        className={cn(
                          'px-2 py-1 font-medium transition-colors',
                          r.default_role === role ? 'bg-accent text-accent-on' : 'text-ink-subtle hover:bg-surface-sunken',
                        )}
                      >
                        {t(`mods.dish.${role}`)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    aria-label={t('action.delete')}
                    className="text-ink-subtle hover:text-danger-ink"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {available.length > 0 && (
            <Select
              value=""
              aria-label={t('mods.dish.attach')}
              onChange={(e) => {
                const g = available.find((x) => x.id === e.target.value)
                if (g) setRows((all) => [...all, { group: g.id, group_name: g.name_en, default_role: 'optional' }])
              }}
            >
              <option value="">{t('mods.dish.attach')}…</option>
              {available.map((g) => (
                <option key={g.id} value={g.id}>{g.name_en}</option>
              ))}
            </Select>
          )}
        </div>
      )}
    </Drawer>
  )
}
