import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Drawer } from '@/components/Drawer'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Input, Select, Textarea } from '@/components/Input'
import { useToast } from '@/components/Toast'
import { useDishRecipes } from '@/lib/queries'
import * as api from '@/lib/api'
import type { MenuPeriodWrite } from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { parseApiError } from '@/lib/parseApiError'
import { cn } from '@/lib/cn'
import { localId } from '@/lib/id'
import { useI18n, type TFunc } from '@/i18n'
import type { MenuPeriod, MenuPeriodKind, MenuPeriodOp } from '@/types/api'

const KINDS: MenuPeriodKind[] = ['seasonal', 'daily_special', 'event']
const OPS: MenuPeriodOp[] = ['add', 'remove', 'reprice', 'replace_photo', 'replace_copy']
const ALL_DAYS = 0b1111111

/** Mon-first labels; bit i (0=Mon … 6=Sun) matches the backend weekday_mask. */
const DAY_KEYS = [
  'specials.day.mon', 'specials.day.tue', 'specials.day.wed', 'specials.day.thu',
  'specials.day.fri', 'specials.day.sat', 'specials.day.sun',
] as const
const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface DraftLine {
  key: string
  id?: string
  dish: string
  op: MenuPeriodOp
  menu_price: string
  image_url: string
  description_en: string
  description_ar: string
}

function blankLine(): DraftLine {
  return { key: localId(), dish: '', op: 'add', menu_price: '', image_url: '', description_en: '', description_ar: '' }
}

function fromPeriod(p: MenuPeriod): DraftLine[] {
  return p.lines.map((l) => ({
    key: l.id ?? localId(),
    id: l.id,
    dish: l.dish,
    op: l.op,
    menu_price: l.menu_price ?? '',
    image_url: l.image_url ?? '',
    description_en: l.description_en ?? '',
    description_ar: l.description_ar ?? '',
  }))
}

export function PeriodEditor({
  menuId,
  period,
  open,
  onClose,
}: {
  menuId: string
  period: MenuPeriod | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: dishes } = useDishRecipes(open)

  const [nameEn, setNameEn] = useState(period?.name_en ?? '')
  const [nameAr, setNameAr] = useState(period?.name_ar ?? '')
  const [kind, setKind] = useState<MenuPeriodKind>(period?.kind ?? 'seasonal')
  const [startsOn, setStartsOn] = useState(period?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(period?.ends_on ?? '')
  const [openEnded, setOpenEnded] = useState(period ? period.ends_on === null : false)
  const [mask, setMask] = useState(period?.weekday_mask ?? ALL_DAYS)
  const [isLive, setIsLive] = useState(period?.is_live ?? true)
  const [notes, setNotes] = useState(period?.notes ?? '')
  const [lines, setLines] = useState<DraftLine[]>(period ? fromPeriod(period) : [])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const dishOptions = useMemo(
    () => (dishes ?? []).slice().sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [dishes],
  )

  const mutation = useMutation({
    mutationFn: (body: MenuPeriodWrite) =>
      period ? api.updateMenuPeriod(period.id, body) : api.createMenuPeriod(menuId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.menuPeriods(menuId) })
      qc.invalidateQueries({ queryKey: ['menus', menuId, 'effective'] })
      toast.success(t('toast.periodSaved'))
      onClose()
    },
    onError: (e) => {
      const parsed = parseApiError(e)
      setErrors(parsed.fields ?? {})
      toast.error(parsed.message || t('state.errorGeneric'))
    },
  })

  function toggleDay(i: number) {
    setMask((m) => m ^ (1 << i))
  }

  function submit() {
    const next: Record<string, string> = {}
    if (!nameEn.trim()) next.name_en = t('form.required')
    if (!startsOn) next.starts_on = t('form.required')
    if (mask === 0) next.weekday_mask = t('specials.field.weekdays')
    if (!openEnded && endsOn && endsOn < startsOn) next.ends_on = t('specials.field.ends')
    setErrors(next)
    if (Object.keys(next).length) return

    const body: MenuPeriodWrite = {
      kind,
      name_en: nameEn.trim(),
      name_ar: nameAr.trim(),
      starts_on: startsOn,
      ends_on: openEnded ? null : endsOn || null,
      weekday_mask: mask,
      is_live: isLive,
      notes: notes.trim(),
      lines: lines
        .filter((l) => l.dish)
        .map((l, i) => ({
          ...(l.id ? { id: l.id } : {}),
          dish: l.dish,
          op: l.op,
          menu_price: needs(l.op, 'price') ? l.menu_price || null : null,
          image_url: needs(l.op, 'photo') ? l.image_url : '',
          description_en: needs(l.op, 'copy') ? l.description_en : '',
          description_ar: needs(l.op, 'copy') ? l.description_ar : '',
          sort_order: i,
        })),
    }
    mutation.mutate(body)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={period ? t('specials.edit') : t('specials.new')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" loading={mutation.isPending} onClick={submit}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('specials.field.name')} required error={errors.name_en}>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </Field>
          <Field label={`${t('specials.field.name')} · العربية`}>
            <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} />
          </Field>
          <Field label={t('specials.field.kind')}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as MenuPeriodKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`specials.kind.${k}`)}</option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label={t('specials.field.starts')} required error={errors.starts_on}>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label={t('specials.field.ends')} error={errors.ends_on}>
            <div className="space-y-1.5">
              <Input
                type="date"
                value={endsOn}
                disabled={openEnded}
                min={startsOn || undefined}
                onChange={(e) => setEndsOn(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-ink-subtle">
                <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
                {t('specials.field.endsOpen')}
              </label>
            </div>
          </Field>
        </div>

        <Field label={t('specials.field.weekdays')} error={errors.weekday_mask}>
          <div className="flex gap-1.5">
            {DAY_SHORT.map((d, i) => {
              const on = (mask & (1 << i)) !== 0
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={t(DAY_KEYS[i])}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    'h-9 w-9 rounded-lg border text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
                    on
                      ? 'border-accent bg-accent text-accent-on'
                      : 'border-hairline bg-surface text-ink-subtle hover:border-hairline-strong',
                  )}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isLive} onChange={(e) => setIsLive(e.target.checked)} />
          {t('specials.field.live')}
        </label>

        {/* changes */}
        <div className="space-y-2 border-t border-hairline pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{t('specials.changes')}</p>
            <Button size="sm" variant="secondary" icon="plus" onClick={() => setLines((l) => [...l, blankLine()])}>
              {t('specials.addChange')}
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="text-xs text-ink-subtle">{t('specials.changes.none')}</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((l, i) => (
                <LineRow
                  key={l.key}
                  line={l}
                  dishes={dishOptions}
                  t={t}
                  onChange={(patch) => setLines((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                  onRemove={() => setLines((all) => all.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          )}
        </div>

        <Field label={t('specials.field.notes')}>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  )
}

function needs(op: MenuPeriodOp, what: 'price' | 'photo' | 'copy') {
  if (what === 'price') return op === 'add' || op === 'reprice'
  if (what === 'photo') return op === 'add' || op === 'replace_photo'
  return op === 'add' || op === 'replace_copy'
}

function LineRow({
  line,
  dishes,
  t,
  onChange,
  onRemove,
}: {
  line: DraftLine
  dishes: { id: string; name_en: string; name_ar: string }[]
  t: TFunc
  onChange: (patch: Partial<DraftLine>) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded-lg border border-hairline bg-surface-sunken p-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Select value={line.op} onChange={(e) => onChange({ op: e.target.value as MenuPeriodOp })} aria-label={t('specials.changeType')}>
            {OPS.map((op) => (
              <option key={op} value={op}>{t(`specials.op.${op}`)}</option>
            ))}
          </Select>
          <Select value={line.dish} onChange={(e) => onChange({ dish: e.target.value })} aria-label={t('specials.pickDish')}>
            <option value="">{t('specials.pickDish')}…</option>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>{d.name_en}</option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('menus.line.remove')}
          className="mt-1 text-ink-subtle hover:text-danger-ink"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      {needs(line.op, 'price') && (
        <Input
          type="number"
          step="0.001"
          className="mt-2"
          placeholder={t('menus.line.menuPrice')}
          value={line.menu_price}
          onChange={(e) => onChange({ menu_price: e.target.value })}
        />
      )}
      {needs(line.op, 'photo') && (
        <Input
          type="url"
          className="mt-2"
          placeholder="https://…"
          value={line.image_url}
          onChange={(e) => onChange({ image_url: e.target.value })}
        />
      )}
      {needs(line.op, 'copy') && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Textarea rows={2} placeholder="EN" value={line.description_en} onChange={(e) => onChange({ description_en: e.target.value })} />
          <Textarea rows={2} dir="rtl" placeholder="AR" value={line.description_ar} onChange={(e) => onChange({ description_ar: e.target.value })} />
        </div>
      )}
    </li>
  )
}
