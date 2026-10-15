/* One of a brand's own lists (menu categories or kitchen stations) on the
 * Brands screen. "Shared list" = the brand has no list of its own and uses
 * every item not tied to a brand; "Own list" = only the ticked items show in
 * the dish editor for this brand (see backend `brand_options`). New items can
 * be added here once the brand exists — they're created tied to this brand. */
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { SegmentedButtons } from '@/components/Page'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n'

export interface ListItem {
  id: string
  label: string
  labelAr?: string
}

export function BrandListEditor({
  title,
  items,
  selected,
  onChange,
  onAdd,
  withArabic,
  canAdd,
}: {
  title: string
  items: ListItem[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** create an item tied to this brand; resolves to the new item */
  onAdd: (name: string, nameAr: string) => Promise<ListItem>
  withArabic?: boolean
  /** false for a brand that isn't saved yet */
  canAdd: boolean
}) {
  const { t } = useI18n()
  const [own, setOwn] = useState(selected.length > 0)
  const [remembered, setRemembered] = useState<string[]>(selected)
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? items.filter((i) => i.label.toLowerCase().includes(q) || i.labelAr?.includes(q)) : items
  }, [items, filter])

  const setMode = (mode: 'shared' | 'own') => {
    if (mode === 'shared') {
      setRemembered(selected)
      setOwn(false)
      onChange([])
    } else {
      setOwn(true)
      onChange(remembered)
    }
  }
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const item = await onAdd(name.trim(), nameAr.trim())
      onChange([...selected, item.id])
      setName('')
      setNameAr('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="rounded-lg border border-hairline p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <SegmentedButtons
          label={title}
          value={own ? 'own' : 'shared'}
          onChange={setMode}
          options={[
            { value: 'shared', label: t('branches.lists.shared') },
            { value: 'own', label: t('branches.lists.own') },
          ]}
        />
      </div>

      {!own ? (
        <p className="text-xs text-ink-subtle">{t('branches.lists.sharedHint')}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-subtle">
            {t('branches.lists.ownHint', { n: selected.length })}
          </p>

          {items.length > 12 && (
            <div className="relative mb-2">
              <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
                <Icon name="search" size={13} />
              </span>
              <Input
                className="h-8 ps-8 text-[13px]"
                placeholder={t('branches.lists.filter')}
                aria-label={t('branches.lists.filter')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pe-1" role="group" aria-label={title}>
            {shown.map((i) => {
              const on = selected.includes(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]',
                    on
                      ? 'border-accent bg-accent text-white'
                      : 'border-hairline-strong text-ink-muted hover:bg-surface-sunken',
                  )}
                >
                  {on && <Icon name="check" size={11} />}
                  {i.label}
                  {i.labelAr && (
                    <span dir="rtl" className={on ? 'opacity-80' : 'text-ink-subtle'}>
                      {i.labelAr}
                    </span>
                  )}
                </button>
              )
            })}
            {shown.length === 0 && <p className="text-xs text-ink-subtle">{t('branches.lists.noMatch')}</p>}
          </div>

          {canAdd ? (
            <form onSubmit={add} className="mt-3 border-t border-hairline pt-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                {t('branches.lists.addNew')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-8 min-w-0 flex-1 text-[13px]"
                  placeholder={t('branches.lists.nameEn')}
                  aria-label={t('branches.lists.nameEn')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {withArabic && (
                  <Input
                    dir="rtl"
                    className="h-8 min-w-0 flex-1 text-[13px]"
                    placeholder={t('branches.lists.nameAr')}
                    aria-label={t('branches.lists.nameAr')}
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                  />
                )}
                <Button type="submit" size="sm" icon="plus" loading={adding} disabled={!name.trim()}>
                  {t('branches.lists.add')}
                </Button>
              </div>
              {addError && (
                <p role="alert" className="mt-1.5 text-xs text-danger-ink">
                  {addError}
                </p>
              )}
            </form>
          ) : (
            <p className="mt-3 text-xs text-ink-subtle">{t('branches.lists.saveFirst')}</p>
          )}
        </>
      )}
    </section>
  )
}
