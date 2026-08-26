import { useEffect, useMemo, useRef, useState } from 'react'
import { inputClass } from './RecipeFormFields'

/*
 * Type-to-search combobox over the full inventory item list (~2,100 SKUs) —
 * replaces the <datalist>, which browsers cap and render inconsistently.
 * Keyboard: ↑/↓ move, Enter select, Esc close. Selecting fills the SKU and
 * hands the picked item back so the caller can autofill the display name.
 */
export default function ItemPicker({ value, items, onSelect, placeholder = 'Search item or SKU' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)

  const selected = useMemo(
    () => items.find((it) => it.sku === value),
    [items, value],
  )
  const display = open ? query : (selected ? `${selected.name_en} · ${selected.sku}` : (value || ''))

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 50)
    return items
      .filter((it) => it.name_en?.toLowerCase().includes(q) || it.sku?.toLowerCase().includes(q))
      .slice(0, 50)
  }, [items, query])

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(it) {
    onSelect(it.sku, it)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[active]) choose(matches[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={inputClass}
        value={display}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          className="absolute z-20 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-stone-200 rounded-md shadow-lg text-sm"
          role="listbox"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-stone-400">No match{query ? ` for “${query}”` : ''}</li>
          )}
          {matches.map((it, i) => (
            <li
              key={it.id || it.sku}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(it) }}
              className={`px-3 py-1.5 cursor-pointer flex items-baseline gap-2 ${i === active ? 'bg-accent-50' : ''}`}
            >
              <span className="text-stone-900 truncate">{it.name_en}</span>
              <span className="text-stone-400 tabular-nums text-xs flex-none">{it.sku}</span>
              {it.category && <span className="text-stone-300 text-xs flex-none capitalize">{it.category}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
