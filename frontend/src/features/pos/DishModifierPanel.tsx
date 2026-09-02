import { useState } from 'react'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { Pill } from '@/components/Pill'
import { useDishModifier } from '@/lib/queries'
import { useI18n } from '@/i18n'
import { DishModifierDrawer } from './DishModifierDrawer'

/** POS-modifiers summary + edit shortcut for the dish detail rail. */
export function DishModifierPanel({ dishId, canEdit }: { dishId: string; canEdit: boolean }) {
  const { t } = useI18n()
  const { data, isLoading } = useDishModifier(dishId)
  const [open, setOpen] = useState(false)

  if (isLoading || !data) return null

  const groups = data.modifier_groups

  return (
    <Card elevated>
      <CardHeader
        title={t('mods.panel.title')}
        action={
          canEdit ? (
            <Button variant={groups.length ? 'secondary' : 'primary'} size="sm"
              icon={groups.length ? 'edit' : 'plus'} onClick={() => setOpen(true)}>
              {groups.length ? t('action.edit') : t('mods.dish.attach')}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t('mods.dish.none')}</p>
        ) : (
          <ul className="space-y-1.5">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink">{g.group_name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-2xs text-ink-subtle">{g.option_count}</span>
                  <Pill tone={g.default_role === 'forced' ? 'warning' : 'neutral'}>
                    {t(`mods.dish.${g.default_role}`)}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {open && <DishModifierDrawer dishId={dishId} onClose={() => setOpen(false)} />}
    </Card>
  )
}
