import { useState } from 'react'

/*
 * One-series trend — inline SVG, no chart library (premium-ui: simple trends
 * are inline SVG). Area fill, recessive grid, an emphasised end point, a
 * per-point hover tooltip, and an optional target line. The title names the
 * series so no legend is needed.
 */
const W = 520
const H = 160
const PAD = { l: 40, r: 12, t: 10, b: 22 }

export default function TrendChart({ title, points, target, format = (v) => v, unit = '', accent = 'accent' }) {
  const [hover, setHover] = useState(null)

  const vals = points.map((p) => Number(p.y)).filter((v) => !Number.isNaN(v))
  if (vals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-700 mb-1">{title}</h3>
        <p className="text-sm text-stone-400">No snapshots yet — take one to start the trend.</p>
      </div>
    )
  }

  const lo = Math.min(...vals, target ?? Infinity)
  const hi = Math.max(...vals, target ?? -Infinity)
  const span = hi - lo || 1
  const yMin = lo - span * 0.15
  const yMax = hi + span * 0.15

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i) => PAD.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(p.y))}`).join(' ')
  const area = `${line} L ${x(points.length - 1)} ${PAD.t + innerH} L ${x(0)} ${PAD.t + innerH} Z`
  const stroke = accent === 'accent' ? '#a8681c' : '#16a34a'
  const fill = accent === 'accent' ? '#a8681c14' : '#16a34a14'

  const ticks = [yMin, (yMin + yMax) / 2, yMax]

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-700 mb-2">{title}</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" style={{ minWidth: 360 }} role="img" aria-label={title}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#f0ede8" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#a8a29e" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(t)}
              </text>
            </g>
          ))}
          {target != null && (
            <>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} stroke="#dc2626" strokeWidth="1" strokeDasharray="3 3" />
              <text x={W - PAD.r} y={y(target) - 3} textAnchor="end" fontSize="9" fill="#dc2626">target {format(target)}</text>
            </>
          )}
          <path d={area} fill={fill} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const last = i === points.length - 1
            return (
              <g key={i}>
                <circle cx={x(i)} cy={y(Number(p.y))} r={last ? 4 : 3}
                        fill={last ? stroke : '#fff'} stroke={stroke} strokeWidth="1.5" />
                <rect x={x(i) - 12} y={PAD.t} width="24" height={innerH} fill="transparent"
                      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#a8a29e">
                  {p.label || i + 1}
                </text>
              </g>
            )
          })}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="#d6d3d1" strokeWidth="1" />
              <g transform={`translate(${Math.min(x(hover) + 8, W - 96)}, ${PAD.t + 6})`}>
                <rect width="90" height="30" rx="4" fill="#292524" />
                <text x="8" y="13" fontSize="10" fill="#fff">{points[hover].label}</text>
                <text x="8" y="25" fontSize="10" fill="#e7e5e4" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {format(Number(points[hover].y))}{unit}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
