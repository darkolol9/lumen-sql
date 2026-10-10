import clsx from 'clsx'
import { Hash, Calendar, Type, ChevronLeft } from 'lucide-react'
import { useMemo } from 'react'
import type { Column, StatementResult } from '../../../shared/types'
import { cellText, fmtCompact, fmtDuration, fmtNumber, isNumericType, isTemporalType } from '../lib/format'

interface Stats {
  nulls: number
  distinct: number
  numeric?: { min: number; max: number; mean: number; bins: number[] }
  top: { value: string; count: number }[]
  minText?: string
  maxText?: string
}

function computeStats(col: Column, idx: number, rows: unknown[][]): Stats {
  let nulls = 0
  const counts = new Map<string, number>()
  const nums: number[] = []
  const isNum = isNumericType(col.type)
  for (const r of rows) {
    const v = r[idx]
    if (v === null || v === undefined) {
      nulls++
      continue
    }
    const s = cellText(v)
    counts.set(s, (counts.get(s) ?? 0) + 1)
    if (isNum) {
      const n = Number(v)
      if (Number.isFinite(n)) nums.push(n)
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([value, count]) => ({ value, count }))
  let numeric: Stats['numeric']
  if (nums.length) {
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const n of nums) {
      if (n < min) min = n
      if (n > max) max = n
      sum += n
    }
    const B = 24
    const bins = new Array(B).fill(0)
    const span = max - min || 1
    for (const n of nums) bins[Math.min(B - 1, Math.floor(((n - min) / span) * B))]++
    numeric = { min, max, mean: sum / nums.length, bins }
  }
  const sorted = isTemporalType(col.type) ? [...counts.keys()].sort() : undefined
  return { nulls, distinct: counts.size, numeric, top, minText: sorted?.[0], maxText: sorted?.at(-1) }
}

function TypeIcon({ type }: { type: string }) {
  if (isNumericType(type)) return <Hash size={12} className="text-accent" />
  if (isTemporalType(type)) return <Calendar size={12} className="text-warn" />
  return <Type size={12} className="text-ai" />
}

function Histogram({ bins, height = 28 }: { bins: number[]; height?: number }) {
  const max = Math.max(...bins, 1)
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {bins.map((b, i) => (
        <div key={i} className="flex-1 rounded-t-[2px] bg-accent/70" style={{ height: `${Math.max((b / max) * 100, b ? 6 : 0)}%` }} title={`${b} rows`} />
      ))}
    </div>
  )
}

function TopValues({ top, total, limit = 3 }: { top: Stats['top']; total: number; limit?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {top.slice(0, limit).map((t) => (
        <div key={t.value} className="relative flex h-[18px] items-center overflow-hidden rounded-sm px-1.5 text-[11px]">
          <div className="absolute inset-y-0 left-0 bg-ai-soft" style={{ width: `${(t.count / total) * 100}%` }} />
          <span className="mono relative min-w-0 flex-1 truncate">{t.value}</span>
          <span className="relative ml-2 text-faint tabular-nums">{fmtCompact(t.count)}</span>
        </div>
      ))}
    </div>
  )
}

export function ColumnInspector({
  result,
  selected,
  onSelect,
}: {
  result: StatementResult
  selected?: number
  onSelect: (i: number | undefined) => void
}) {
  const stats = useMemo(() => result.columns.map((c, i) => computeStats(c, i, result.rows)), [result])
  const n = result.rows.length

  if (selected !== undefined && result.columns[selected]) {
    const c = result.columns[selected]
    const s = stats[selected]
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <button onClick={() => onSelect(undefined)} className="flex items-center gap-1 px-3 pt-3 text-[11.5px] text-muted hover:text-fg">
          <ChevronLeft size={13} /> All columns
        </button>
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center gap-2">
            <TypeIcon type={c.type} />
            <span className="truncate text-[14px] font-semibold">{c.name}</span>
          </div>
          <div className="mono mt-0.5 text-[11px] text-faint">{c.type}</div>
        </div>
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line">
          {[
            ['Rows', fmtNumber(n)],
            ['Distinct', fmtNumber(s.distinct)],
            ['Null', `${n ? ((s.nulls / n) * 100).toFixed(1) : 0}%`],
            ['Unique', `${n ? ((s.distinct / Math.max(n - s.nulls, 1)) * 100).toFixed(0) : 0}%`],
            ...(s.numeric
              ? [
                  ['Min', fmtCompact(s.numeric.min)],
                  ['Max', fmtCompact(s.numeric.max)],
                  ['Mean', fmtCompact(s.numeric.mean)],
                  ['Range', fmtCompact(s.numeric.max - s.numeric.min)],
                ]
              : s.minText
                ? [
                    ['Earliest', s.minText],
                    ['Latest', s.maxText!],
                  ]
                : []),
          ].map(([k, v]) => (
            <div key={k} className="bg-panel px-4 py-2.5">
              <div className="text-[10.5px] font-medium tracking-wide text-faint uppercase">{k}</div>
              <div className="mono mt-0.5 truncate text-[13px] tabular-nums" title={v}>
                {v}
              </div>
            </div>
          ))}
        </div>
        {s.numeric && (
          <div className="px-4 pt-4">
            <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Distribution</div>
            <Histogram bins={s.numeric.bins} height={72} />
            <div className="mono mt-1 flex justify-between text-[10.5px] text-faint">
              <span>{fmtCompact(s.numeric.min)}</span>
              <span>{fmtCompact(s.numeric.max)}</span>
            </div>
          </div>
        )}
        <div className="px-4 py-4">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Most frequent</div>
          <TopValues top={s.top} total={n} limit={6} />
        </div>
        {result.truncated && <div className="mx-4 mb-4 text-[11px] text-faint">Statistics cover the {fmtNumber(n)} fetched rows.</div>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[11px] font-medium tracking-wide text-faint uppercase">Query details</div>
        <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-[12px]">
          <span className="text-muted">Duration</span>
          <span className="mono text-right">{fmtDuration(result.elapsedMs)}</span>
          <span className="text-muted">Rows</span>
          <span className="mono text-right">{fmtNumber(result.rowCount)}</span>
          {result.message && (
            <>
              <span className="text-muted">Scan</span>
              <span className="mono truncate text-right" title={result.message}>
                {result.message}
              </span>
            </>
          )}
          {result.queryId && (
            <>
              <span className="text-muted">Query ID</span>
              <span className="mono truncate text-right text-faint" title={result.queryId}>
                {result.queryId}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col py-1">
        {result.columns.map((c, i) => {
          const s = stats[i]
          return (
            <button key={i} onClick={() => onSelect(i)} className={clsx('group flex flex-col gap-1.5 px-4 py-2.5 text-left hover:bg-hover')}>
              <div className="flex items-center gap-2">
                <TypeIcon type={c.type} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                {s.nulls > 0 && <span className="text-[10.5px] text-faint">{((s.nulls / n) * 100).toFixed(0)}% null</span>}
              </div>
              {s.numeric && s.distinct > 6 ? <Histogram bins={s.numeric.bins} height={22} /> : <TopValues top={s.top} total={n} limit={2} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
