import { useState } from 'react'

import { cn } from '@/lib/cn'

/*
 * Dish imagery. When a real photo URL is set it is used (object-cover, real
 * alt text). Until the photo library is wired up, a deterministic warm
 * treatment keyed off the dish name stands in — consistent aspect + radius,
 * never a broken image.
 */

const PALETTES = [
  ['#a8681c', '#6d421c'],
  ['#c98527', '#87511a'],
  ['#8f6b3d', '#5a381c'],
  ['#b1732a', '#7a4a1f'],
  ['#9c7b4e', '#5f4326'],
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function DishImage({
  src,
  name,
  className,
  rounded = 'rounded-card',
}: {
  src?: string
  name: string
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)
  const showPhoto = src && !failed

  if (showPhoto) {
    return (
      <img
        src={src}
        alt={`Plated ${name}`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', rounded, className)}
      />
    )
  }

  const h = hash(name)
  const [from, to] = PALETTES[h % PALETTES.length]
  const angle = 115 + (h % 40)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', rounded, className)}
      style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
      role="img"
      aria-label={`${name} — photo pending`}
    >
      <svg className="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden="true">
        <defs>
          <pattern id={`grain-${h}`} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#fff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grain-${h})`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-[clamp(2rem,8vw,4rem)] font-medium text-white/85">
        {initials}
      </span>
    </div>
  )
}
