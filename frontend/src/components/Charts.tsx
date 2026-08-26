import { useId, useState } from 'react'

/* Theme-aware chart colours come from CSS vars (SVG can't reach Tailwind). */
const C = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  accent: 'var(--chart-accent)',
  accentFill: 'var(--chart-accent-fill)',
  positive: 'var(--chart-positive)',
  positiveFill: 'var(--chart-positive-fill)',
  target: 'var(--chart-target)',
  point: 'var(--chart-point)',
}

export interface ChartPoint {
  label: string
  y: number | null
}

/* ── sparkline — tiny, no axes, gradient fill ──────────────────────── */
export function Sparkline({
  points,
  tone = 'accent',
  width = 96,
  height = 28,
  fluid = false,
}: {
  points: number[]
  tone?: 'accent' | 'positive'
  width?: number
  height?: number
  /** stretch to the container width (for full-bleed strips inside a tile) */
  fluid?: boolean
}) {
  const gid = useId()
  const vals = points.filter((n) => Number.isFinite(n))
  if (vals.length < 2)
    return <div style={{ width: fluid ? '100%' : width, height }} aria-hidden="true" />
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const stroke = tone === 'accent' ? C.accent : C.positive
  // a wide coordinate space keeps slopes readable when a fluid strip stretches
  const vbW = fluid ? 320 : width
  const top = 3
  const bot = height - 3
  const x = (i: number) => (i / (points.length - 1)) * (vbW - 3) + 1.5
  const y = (v: number) => bot - ((v - lo) / span) * (bot - top)
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ')
  const last = points.length - 1
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${vbW} ${height}`}
      preserveAspectRatio={fluid ? 'none' : 'xMidYMid meet'}
      className="block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(last)} ${height} L${x(0)} ${height} Z`} fill={`url(#sp-${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last)} cy={y(points[last])} r="2.4" fill={stroke} />
    </svg>
  )
}

/* ── trend chart — one series, area fill, target line, hover ──────── */
const W = 520
const H = 168
const PAD = { l: 42, r: 14, t: 12, b: 26 }

export function TrendChart({
  title,
  points,
  target,
  tone = 'accent',
  format = (v) => v.toFixed(1),
}: {
  title: string
  points: ChartPoint[]
  target?: number
  tone?: 'accent' | 'positive'
  format?: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const clipId = useId()
  const valued = points.filter((p): p is { label: string; y: number } => p.y !== null)

  if (valued.length < 2) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-6 text-sm text-ink-subtle">Not enough snapshots yet to draw a trend.</p>
      </div>
    )
  }

  const ys = valued.map((p) => p.y)
  const lo = Math.min(...ys, target ?? Infinity)
  const hi = Math.max(...ys, target ?? -Infinity)
  const span = hi - lo || 1
  const yMin = lo - span * 0.18
  const yMax = hi + span * 0.18
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW
  const y = (v: number) => PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const stroke = tone === 'accent' ? C.accent : C.positive
  const fill = tone === 'accent' ? C.accentFill : C.positiveFill
  const line = points
    .map((p, i) => (p.y === null ? '' : `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.y)}`))
    .join(' ')
  const area = `${line} L${x(points.length - 1)} ${PAD.t + innerH} L${x(0)} ${PAD.t + innerH} Z`
  const ticks = [yMin + span * 0.1, (yMin + yMax) / 2, yMax - span * 0.1]

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <div className="scroll-x">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 340 }}
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t} width={innerW} height={innerH} />
            </clipPath>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={C.grid} strokeWidth="1" />
              <text
                x={PAD.l - 8}
                y={y(t) + 3}
                textAnchor="end"
                fontSize="9"
                fill={C.axis}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {format(t)}
              </text>
            </g>
          ))}
          {target != null && (
            <>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(target)}
                y2={y(target)}
                stroke={C.target}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text x={W - PAD.r} y={y(target) - 4} textAnchor="end" fontSize="9" fill={C.target}>
                target {format(target)}
              </text>
            </>
          )}
          <path d={area} fill={fill} clipPath={`url(#${clipId})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) =>
            p.y === null ? null : (
              <g key={i}>
                <circle
                  cx={x(i)}
                  cy={y(p.y)}
                  r={i === points.length - 1 ? 3.5 : 2.5}
                  fill={i === points.length - 1 ? stroke : C.point}
                  stroke={stroke}
                  strokeWidth="1.5"
                />
                <rect
                  x={x(i) - 14}
                  y={PAD.t}
                  width="28"
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="8.5" fill={C.axis}>
                  {p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label}
                </text>
              </g>
            ),
          )}
          {hover != null && points[hover]?.y != null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.t}
                y2={PAD.t + innerH}
                stroke={C.axis}
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <g transform={`translate(${Math.min(x(hover) + 8, W - 92)}, ${PAD.t + 4})`}>
                <rect width="86" height="30" rx="5" fill="var(--ink)" />
                <text x="8" y="12" fontSize="8.5" fill="var(--surface)">
                  {points[hover].label}
                </text>
                <text
                  x="8"
                  y="24"
                  fontSize="10"
                  fill="var(--surface)"
                  fontWeight="600"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {format(points[hover].y as number)}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
