import { useState } from 'react'

import { DishImage } from './DishImage'
import { cn } from '@/lib/cn'
import type { PlatingPin } from '@/types/api'

/**
 * A plating photo with numbered callout pins laid over it, plus a matching
 * numbered legend. Pin `x` / `y` are 0–1 fractions of the image, so a pin
 * stays put at any render size. Read-only; the editor has its own draggable
 * variant.
 */
export function PinnedImage({
  src,
  alt,
  pins,
  locale,
  className,
}: {
  src: string | undefined
  alt: string
  pins: PlatingPin[]
  locale: string
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const label = (p: PlatingPin) =>
    (locale === 'ar' ? p.label_ar || p.label_en : p.label_en || p.label_ar) || `#${p.n}`
  const ordered = [...pins].sort((a, b) => a.n - b.n)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface-sunken">
        <div className="aspect-[16/10] w-full">
          <DishImage src={src || undefined} name={alt} rounded="rounded-none" />
        </div>
        {ordered.map((p) => (
          <button
            key={p.n}
            type="button"
            onMouseEnter={() => setActive(p.n)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(p.n)}
            onBlur={() => setActive(null)}
            aria-label={`${p.n}. ${label(p)}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            className={cn(
              'absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
              'rounded-full border-2 border-white bg-accent font-mono text-[11px] font-semibold text-accent-on',
              'shadow-[0_1px_6px_rgba(0,0,0,0.45)] transition-transform',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
              active === p.n && 'scale-125',
            )}
          >
            {p.n}
          </button>
        ))}
      </div>

      {ordered.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {ordered.map((p) => (
            <li
              key={p.n}
              onMouseEnter={() => setActive(p.n)}
              onMouseLeave={() => setActive(null)}
              className={cn(
                'flex items-start gap-2 rounded-md px-1.5 py-1 text-[13px] transition-colors',
                active === p.n ? 'bg-accent-subtle' : 'bg-transparent',
              )}
            >
              <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-accent-on">
                {p.n}
              </span>
              <span className="text-ink" dir={locale === 'ar' && (p.label_ar || !p.label_en) ? 'rtl' : undefined}>
                {label(p)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
