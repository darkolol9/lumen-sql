import clsx from 'clsx'
import { BarChart3, LineChart } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StatementResult } from '../../../shared/types'
import { cellText, fmtCompact, isNumericType, isTemporalType } from '../lib/format'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const MAX_BARS = 60
const M = { top: 16, right: 20, bottom: 34, left: 56 }

function niceTicks(min: number, max: number, count = 5) {
  if (min === max) max = min + 1
  const step0 = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10))
  return ticks
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

export function ResultChart({ result }: { result: StatementResult }) {
  const { columns, rows } = result
  const numericCols = columns.map((c, i) => (isNumericType(c.type) ? i : -1)).filter((i) => i >= 0)
  const defaultX = useMemo(() => {
    const t = columns.findIndex((c) => isTemporalType(c.type))
    if (t >= 0) return t
    const s = columns.findIndex((c) => !isNumericType(c.type))
    return s >= 0 ? s : 0
  }, [columns])
  const [x, setX] = useState(defaultX)
  const [ys, setYs] = useState<number[]>(() => numericCols.filter((i) => i !== defaultX).slice(0, 1))
  const [kind, setKind] = useState<'line' | 'bar'>(isTemporalType(columns[defaultX]?.type ?? '') ? 'line' : 'bar')
  const [hover, setHover] = useState<number | null>(null)
  const [ref, { w, h }] = useSize()

  const data = useMemo(() => {
    const xIsTime = isTemporalType(columns[x]?.type ?? '')
    const xIsNum = isNumericType(columns[x]?.type ?? '')
    let pts = rows.map((r) => ({
      label: cellText(r[x]),
      xv: xIsTime ? Date.parse(String(r[x]).replace(' ', 'T')) : xIsNum ? Number(r[x]) : NaN,
      ys: ys.map((yi) => (r[yi] === null ? null : Number(r[yi]))),
    }))
    if (kind === 'line' && (xIsTime || xIsNum)) pts = pts.filter((p) => Number.isFinite(p.xv)).sort((a, b) => a.xv - b.xv)
    if (kind === 'bar') pts = pts.slice(0, MAX_BARS)
    return pts
  }, [rows, x, ys, kind, columns])

  const iw = Math.max(w - M.left - M.right, 10)
  const ih = Math.max(h - M.top - M.bottom, 10)
  const allY = data.flatMap((d) => d.ys.filter((v): v is number => v !== null && Number.isFinite(v)))
  const ticks = niceTicks(Math.min(0, ...allY), Math.max(0, ...allY))
  const y0 = ticks[0]
  const y1 = ticks[ticks.length - 1]
  const sy = (v: number) => M.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih
  const band = iw / Math.max(data.length, 1)
  const sx = (i: number) => M.left + band * i + band / 2
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(Math.floor(iw / 90), 1)))

  const toggleY = (i: number) => setYs((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i].slice(-4)))

  if (!numericCols.length)
    return <div className="flex h-full items-center justify-center text-[12.5px] text-faint">Charts need at least one numeric column.</div>

  const barW = Math.max(Math.min((band - 2) / Math.max(ys.length, 1) - 2, 48), 1)

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line p-3 text-[12px]">
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-faint uppercase">Chart type</div>
          <div className="flex gap-1 rounded-md bg-canvas/60 p-0.5">
            {(['bar', 'line'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded py-1 capitalize', kind === k ? 'bg-active text-fg' : 'text-muted hover:text-fg')}>
                {k === 'bar' ? <BarChart3 size={13} /> : <LineChart size={13} />} {k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-faint uppercase">X axis</div>
          <select value={x} onChange={(e) => setX(Number(e.target.value))} className="h-7 w-full rounded-md border border-line-strong bg-canvas px-2 outline-none">
            {columns.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium tracking-wide text-faint uppercase">Series (max 4)</div>
          <div className="flex flex-col gap-0.5">
            {numericCols.map((i) => {
              const on = ys.indexOf(i)
              return (
                <button key={i} onClick={() => toggleY(i)} className="flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-hover">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm border" style={on >= 0 ? { background: SERIES[on], borderColor: SERIES[on] } : { borderColor: 'var(--c-line-strong)' }} />
                  <span className={clsx('truncate', on < 0 && 'text-muted')}>{columns[i].name}</span>
                </button>
              )
            })}
          </div>
        </div>
        {kind === 'bar' && rows.length > MAX_BARS && <div className="text-[11px] text-faint">Showing the first {MAX_BARS} rows.</div>}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {ys.length > 1 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-[11.5px] text-muted">
            {ys.map((yi, s) => (
              <span key={yi} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[s] }} />
                {columns[yi].name}
              </span>
            ))}
          </div>
        )}
        <div ref={ref} className="relative min-h-0 flex-1" onMouseLeave={() => setHover(null)}>
          {w > 0 && ys.length > 0 && (
            <svg width={w} height={h} className="block text-[10.5px]">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={w - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--c-line)" strokeDasharray={t === 0 ? undefined : '2 4'} />
                  <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" fill="var(--c-faint)" className="tabular-nums">
                    {fmtCompact(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) =>
                i % labelEvery === 0 ? (
                  <text key={i} x={sx(i)} y={h - M.bottom + 16} textAnchor="middle" fill="var(--c-faint)">
                    {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
                  </text>
                ) : null,
              )}
              {hover !== null && kind === 'line' && <line x1={sx(hover)} x2={sx(hover)} y1={M.top} y2={M.top + ih} stroke="var(--c-faint)" strokeDasharray="3 3" />}
              {kind === 'bar'
                ? data.map((d, i) =>
                    d.ys.map((v, s) => {
                      if (v === null || !Number.isFinite(v)) return null
                      const bx = sx(i) - (barW + 2) * (ys.length / 2) + (barW + 2) * s + 1
                      const top = sy(Math.max(v, 0))
                      const bh = Math.max(Math.abs(sy(v) - sy(0)), 1)
                      const r = Math.min(4, barW / 2, bh)
                      const path =
                        v >= 0
                          ? `M${bx},${top + bh} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barW - r} Q${bx + barW},${top} ${bx + barW},${top + r} V${top + bh} Z`
                          : `M${bx},${top} V${top + bh - r} Q${bx},${top + bh} ${bx + r},${top + bh} H${bx + barW - r} Q${bx + barW},${top + bh} ${bx + barW},${top + bh - r} V${top} Z`
                      return <path key={`${i}-${s}`} d={path} fill={SERIES[s]} opacity={hover === null || hover === i ? 1 : 0.45} />
                    }),
                  )
                : ys.map((_, s) => {
                    // break the line at NULLs instead of drawing through them
                    const segs: string[] = []
                    let cur: string[] = []
                    data.forEach((d, i) => {
                      const v = d.ys[s]
                      if (v === null || !Number.isFinite(v)) {
                        if (cur.length) segs.push(cur.join(' '))
                        cur = []
                      } else cur.push(`${sx(i)},${sy(v)}`)
                    })
                    if (cur.length) segs.push(cur.join(' '))
                    return (
                      <g key={s}>
                        {segs.map((seg, k) => (
                          <polyline key={k} points={seg} fill="none" stroke={SERIES[s]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        ))}
                        {hover !== null && data[hover]?.ys[s] != null && (
                          <circle cx={sx(hover)} cy={sy(data[hover].ys[s]!)} r={4.5} fill={SERIES[s]} stroke="var(--c-panel)" strokeWidth={2} />
                        )}
                      </g>
                    )
                  })}
              {/* hit areas wider than the marks */}
              {data.map((_, i) => (
                <rect key={i} x={M.left + band * i} y={M.top} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              ))}
            </svg>
          )}
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-line-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-lg"
              style={{ left: Math.min(sx(hover) + 12, w - 170), top: M.top }}
            >
              <div className="mb-1 font-semibold">{data[hover].label}</div>
              {ys.map((yi, s) => (
                <div key={yi} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[s] }} />
                  <span className="flex-1 text-muted">{columns[yi].name}</span>
                  <span className="mono tabular-nums">{data[hover].ys[s] === null ? 'NULL' : data[hover].ys[s]!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          {!ys.length && <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-faint">Pick a series to plot</div>}
        </div>
      </div>
    </div>
  )
}
