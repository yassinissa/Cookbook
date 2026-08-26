import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Icon } from '@/components/Icon'
import { USE_SEED } from '@/lib/http'
import { SEED_IDENTITIES, seedIdentity, setSeedIdentity } from '@/lib/seed/access'
import { cn } from '@/lib/cn'

/** Seed builds only — flip the demo identity so a walkthrough can show the
 * nav + data shrink for a scoped user. */
export function IdentitySwitcher() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const current = seedIdentity()

  if (!USE_SEED) return null

  function pick(key: string) {
    setSeedIdentity(key)
    qc.clear()
    window.location.reload()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong px-2 text-[12px] font-medium text-ink-muted transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        title="Demo identity (seed build)"
      >
        <Icon name="users" size={14} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{current.label}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-hairline bg-surface-raised py-1 shadow-popover"
        >
          <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            Demo identity
          </p>
          {SEED_IDENTITIES.map((id) => (
            <button
              key={id.key}
              type="button"
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(id.key)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-[13px]',
                id.key === current.key
                  ? 'bg-accent-subtle text-accent-ink'
                  : 'text-ink hover:bg-surface-sunken',
              )}
            >
              <span className="truncate">{id.label}</span>
              {id.key === current.key && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
