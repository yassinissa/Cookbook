import { useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'
import { cn } from '@/lib/cn'

export interface PickerOption {
  id: string
  name_en: string
  name_ar?: string
  recipe_code?: string
  hint?: string
}

/**
 * Type-ahead single-select over a recipe/dish list. Same interaction model as
 * `components/Combobox` but keyed by record id rather than an inventory SKU.
 */
export function RecipePicker({
  value,
  options,
  onSelect,
  placeholder,
}: {
  value: string | null
  options: PickerOption[]
  onSelect: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value])
  const display = open
    ? query
    : selected
      ? [selected.name_en, selected.recipe_code && `#${selected.recipe_code}`]
          .filter(Boolean)
          .join(' · ')
      : ''

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter(
          (o) =>
            o.name_en.toLowerCase().includes(q) ||
            (o.name_ar ?? '').includes(query.trim()) ||
            (o.recipe_code ?? '').toLowerCase().includes(q),
        )
      : options
    return base.slice(0, 50)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(opt: PickerOption) {
    onSelect(opt.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
        <Icon name="search" size={14} />
      </span>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="recipe-picker-list"
        className={cn(
          'h-10 w-full rounded-lg border border-hairline-strong bg-surface ps-8 pe-2 text-sm text-ink',
          'placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--focus)]',
        )}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault()
            choose(matches[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open && (
        <ul
          id="recipe-picker-list"
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-ink-subtle">No matching recipe.</li>
          )}
          {matches.map((opt, i) => (
            <li
              key={opt.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(opt)
              }}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[13px]',
                i === active ? 'bg-accent-subtle text-accent-ink' : 'text-ink',
              )}
            >
              <span className="truncate">
                {opt.name_en}
                {opt.hint && <span className="text-ink-subtle"> · {opt.hint}</span>}
              </span>
              {opt.recipe_code && (
                <span className="tnum flex-none text-xs text-ink-subtle">#{opt.recipe_code}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
