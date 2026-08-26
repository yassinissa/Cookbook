import { useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from './Icon'
import { cn } from '@/lib/cn'
import type { InventoryItem } from '@/types/api'

interface ComboboxProps {
  value: string
  items: InventoryItem[]
  onSelect: (sku: string, item: InventoryItem | null) => void
  placeholder?: string
  invalid?: boolean
}

/** Type-ahead over the ~2,100 inventory SKUs — keyboard navigable. */
export function Combobox({ value, items, onSelect, placeholder, invalid }: ComboboxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = useMemo(() => items.find((i) => i.sku === value), [items, value])
  const display = open ? query : selected ? `${selected.name_en} · ${selected.sku}` : value

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 40)
    return items
      .filter((i) => i.name_en.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      .slice(0, 40)
  }, [items, query])

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

  function choose(item: InventoryItem) {
    onSelect(item.sku, item)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle">
          <Icon name="search" size={14} />
        </span>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-list"
          aria-invalid={invalid || undefined}
          className={cn(
            'h-9 w-full rounded-lg border bg-surface ps-8 pe-2 text-[13px] text-ink placeholder:text-ink-subtle',
            'focus:outline-none focus:border-accent focus:ring-2 focus:ring-[var(--focus)]',
            invalid && 'border-danger',
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
      </div>

      {open && (
        <ul
          id="combobox-list"
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-ink-subtle">No matching item.</li>
          )}
          {matches.map((item, i) => (
            <li
              key={item.sku}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(item)
              }}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[13px]',
                i === active ? 'bg-accent-subtle text-accent-ink' : 'text-ink',
              )}
            >
              <span className="truncate">{item.name_en}</span>
              <span className="tnum flex-none text-xs text-ink-subtle">{item.sku}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
