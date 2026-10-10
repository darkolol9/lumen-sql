import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Column } from '../../../shared/types'
import { cellText, isNumericType } from '../lib/format'
import { IconButton } from './ui'

const ROW_H = 28
const GUTTER = 56

type Sort = { col: number; dir: 'asc' | 'desc' } | null

export function ResultsGrid({
  columns,
  rows,
  filter,
  selectedColumn,
  onSelectColumn,
}: {
  columns: Column[]
  rows: unknown[][]
  filter: string
  selectedColumn?: number
  onSelectColumn: (i: number | undefined) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<Sort>(null)
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null)
  const [viewer, setViewer] = useState<{ value: unknown; column: string } | null>(null)
  const numeric = useMemo(() => columns.map((c) => isNumericType(c.type)), [columns])

  const initialWidths = useMemo(
    () =>
      columns.map((c, i) => {
        let max = c.name.length + 4
        for (let r = 0; r < Math.min(rows.length, 200); r++) max = Math.max(max, Math.min(cellText(rows[r][i]).length, 60))
        return Math.round(Math.min(Math.max(max * 7.4 + 26, 72), 380))
      }),
    [columns, rows],
  )
  const [widths, setWidths] = useState(initialWidths)
  useEffect(() => {
    setWidths(initialWidths)
    setSort(null)
    setCell(null)
  }, [initialWidths])

  const view = useMemo(() => {
    let idx = rows.map((_, i) => i)
    if (filter) {
      const f = filter.toLowerCase()
      idx = idx.filter((i) => rows[i].some((v) => cellText(v).toLowerCase().includes(f)))
    }
    if (sort) {
      const { col, dir } = sort
      const m = dir === 'asc' ? 1 : -1
      const num = numeric[col]
      idx.sort((a, b) => {
        const va = rows[a][col]
        const vb = rows[b][col]
        if (va === null) return 1
        if (vb === null) return -1
        if (num) return (Number(va) - Number(vb)) * m
        return String(cellText(va)).localeCompare(cellText(vb), undefined, { numeric: true }) * m
      })
    }
    return idx
  }, [rows, filter, sort, numeric])

  const virt = useVirtualizer({ count: view.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 16 })
  const total = GUTTER + widths.reduce((a, b) => a + b, 0)
  const template = `${GUTTER}px ${widths.map((w) => `${w}px`).join(' ')}`

  const startResize = (i: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = widths[i]
    const move = (ev: MouseEvent) => setWidths((ws) => ws.map((w, j) => (j === i ? Math.max(48, w0 + ev.clientX - x0) : w)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!cell) return
    const mv = (dr: number, dc: number) => {
      e.preventDefault()
      const r = Math.max(0, Math.min(view.length - 1, cell.r + dr))
      const c = Math.max(0, Math.min(columns.length - 1, cell.c + dc))
      setCell({ r, c })
      virt.scrollToIndex(r)
    }
    if (e.key === 'ArrowDown') mv(1, 0)
    else if (e.key === 'ArrowUp') mv(-1, 0)
    else if (e.key === 'ArrowLeft') mv(0, -1)
    else if (e.key === 'ArrowRight') mv(0, 1)
    else if (e.key === 'Enter') setViewer({ value: rows[view[cell.r]][cell.c], column: columns[cell.c].name })
    else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      navigator.clipboard.writeText(cellText(rows[view[cell.r]][cell.c]))
      toast.success('Copied cell')
    }
  }

  return (
    <div className="relative h-full">
      <div ref={scrollRef} tabIndex={0} onKeyDown={onKeyDown} className="mono h-full overflow-auto text-[12.5px] outline-none">
        <div style={{ width: total, minWidth: '100%' }}>
          {/* header */}
          <div className="sticky top-0 z-10 grid border-b border-line-strong bg-raised" style={{ gridTemplateColumns: template, height: 32 }}>
            <div className="sticky left-0 z-10 flex items-center justify-end border-r border-line bg-raised pr-2 text-[10.5px] text-faint">#</div>
            {columns.map((c, i) => {
              const s = sort?.col === i ? sort.dir : null
              return (
                <div
                  key={i}
                  onClick={() => onSelectColumn(selectedColumn === i ? undefined : i)}
                  className={clsx(
                    'group relative flex cursor-pointer items-center gap-1 border-r border-line px-2.5 font-sans',
                    selectedColumn === i ? 'bg-accent-soft' : 'hover:bg-hover',
                    numeric[i] && 'flex-row-reverse',
                  )}
                  title={`${c.name} · ${c.type}`}
                >
                  <div className={clsx('flex min-w-0 flex-1 flex-col leading-tight', numeric[i] && 'items-end')}>
                    <span className="max-w-full truncate text-[12px] font-semibold text-fg">{c.name}</span>
                    <span className="max-w-full truncate text-[9.5px] tracking-wide text-faint uppercase">{c.type}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSort(s === 'asc' ? { col: i, dir: 'desc' } : s === 'desc' ? null : { col: i, dir: 'asc' })
                    }}
                    className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-active', s ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100')}
                  >
                    {s === 'asc' ? <ArrowUp size={12} /> : s === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                  </button>
                  <div onMouseDown={(e) => startResize(i, e)} onClick={(e) => e.stopPropagation()} className="absolute top-0 -right-[3px] z-10 h-full w-[6px] cursor-col-resize hover:bg-accent/60" />
                </div>
              )
            })}
          </div>
          {/* body */}
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vr) => {
              const ri = view[vr.index]
              const row = rows[ri]
              return (
                <div
                  key={vr.key}
                  className={clsx('absolute left-0 grid w-full border-b border-line/70 hover:bg-hover/60', vr.index % 2 === 1 && 'bg-raised/35')}
                  style={{ transform: `translateY(${vr.start}px)`, height: ROW_H, gridTemplateColumns: template }}
                >
                  <div className="sticky left-0 flex items-center justify-end border-r border-line bg-panel pr-2 text-[10.5px] text-faint tabular-nums">{ri + 1}</div>
                  {row.map((v, ci) => {
                    const sel = cell?.r === vr.index && cell.c === ci
                    return (
                      <div
                        key={ci}
                        onClick={() => setCell({ r: vr.index, c: ci })}
                        onDoubleClick={() => setViewer({ value: v, column: columns[ci].name })}
                        className={clsx(
                          'flex items-center overflow-hidden border-r border-line/50 px-2.5',
                          numeric[ci] && 'justify-end tabular-nums',
                          sel && 'relative z-[1] bg-accent-soft outline outline-1 -outline-offset-1 outline-accent',
                          selectedColumn === ci && !sel && 'bg-accent-soft/40',
                        )}
                      >
                        <span className={clsx('truncate', v === null && 'text-faint italic', typeof v === 'object' && v !== null && 'text-ai')}>{cellText(v)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {!view.length && <div className="p-8 text-center font-sans text-[12.5px] text-faint">{rows.length ? 'No rows match the filter' : 'Query returned no rows'}</div>}
      </div>

      {viewer && <ValueViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

function ValueViewer({ value, column, onClose }: { value: unknown; column: string; onClose: () => void }) {
  let text = cellText(value)
  try {
    if (typeof value === 'object' && value !== null) text = JSON.stringify(value, null, 2)
    else if (typeof value === 'string' && /^\s*[[{]/.test(value)) text = JSON.stringify(JSON.parse(value), null, 2)
  } catch {}
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="absolute top-3 right-3 bottom-3 z-20 flex w-[min(460px,70%)] animate-pop flex-col overflow-hidden rounded-lg border border-line-strong bg-raised" style={{ boxShadow: 'var(--shadow-pop)' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex-1 truncate text-[12.5px] font-semibold">{column}</span>
        <span className="text-[11px] text-faint">{text.length.toLocaleString()} chars</span>
        <IconButton
          tip="Copy value"
          onClick={() => {
            navigator.clipboard.writeText(text)
            toast.success('Copied')
          }}
        >
          <Copy size={14} />
        </IconButton>
        <IconButton tip="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <pre className="mono min-h-0 flex-1 overflow-auto p-3 text-[12px] leading-relaxed break-all whitespace-pre-wrap">{text}</pre>
    </div>
  )
}
