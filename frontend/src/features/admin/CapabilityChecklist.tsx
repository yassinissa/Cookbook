import { cn } from '@/lib/cn'
import type { CapabilityCode, CapabilityGroup } from '@/types/access'

type State = 'on' | 'off' | 'inherited-on'

/**
 * Grouped capability checklist. In "role" mode each row is a plain toggle. In
 * "user" mode a row inherited from the role shows as inherited-on; clicking
 * cycles inherited-on → denied → granted-again for inherited rows, and
 * off → granted → off for the rest.
 */
export function CapabilityChecklist({
  groups,
  selected,
  inherited,
  denied,
  mode,
  onToggle,
}: {
  groups: CapabilityGroup[]
  selected: Set<CapabilityCode>
  inherited?: Set<CapabilityCode>
  denied?: Set<CapabilityCode>
  mode: 'role' | 'user'
  onToggle: (code: CapabilityCode) => void
}) {
  function stateOf(code: CapabilityCode): State {
    if (mode === 'role') return selected.has(code) ? 'on' : 'off'
    if (denied?.has(code)) return 'off'
    if (selected.has(code)) return 'on'
    if (inherited?.has(code)) return 'inherited-on'
    return 'off'
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            {g.group}
          </p>
          <ul className="space-y-1">
            {g.capabilities.map((c) => {
              const s = stateOf(c.code)
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => onToggle(c.code)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-surface-sunken"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 flex-none items-center justify-center rounded border',
                        s === 'on' && 'border-accent bg-accent text-white',
                        s === 'inherited-on' && 'border-accent/50 bg-accent-subtle text-accent-ink',
                        s === 'off' && 'border-hairline-strong',
                      )}
                    >
                      {s !== 'off' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 13 4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-ink">{c.label}</span>
                    <span className="tnum text-2xs text-ink-subtle">{c.code}</span>
                    {mode === 'user' && s === 'inherited-on' && (
                      <span className="rounded bg-surface-sunken px-1 text-2xs text-ink-subtle">role</span>
                    )}
                    {mode === 'user' && denied?.has(c.code) && (
                      <span className="rounded bg-danger-subtle px-1 text-2xs text-danger-ink">denied</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
