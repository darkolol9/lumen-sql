import clsx from 'clsx'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  Download,
  PanelRight,
  Search,
  Sparkles,
  Square,
  Table2,
  Terminal,
} from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { askAi } from '../lib/aiBus'
import { download, fmtDuration, fmtNumber, modKey, toCsv, toMarkdown, toTsv } from '../lib/format'
import { useApp } from '../store/app'
import { ColumnInspector } from './ColumnInspector'
import { ResultChart } from './ResultChart'
import { ResultsGrid } from './ResultsGrid'
import { Button, IconButton, Kbd, MenuItem, Popover } from './ui'

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 87)
    return () => clearInterval(t)
  }, [])
  return <span className="mono tabular-nums">{fmtDuration(now - since)}</span>
}

export function ResultsPanel({ worksheetId }: { worksheetId: string }) {
  const run = useApp((s) => s.runs[worksheetId])
  const [view, setView] = useState<'grid' | 'chart'>('grid')
  const [filter, setFilter] = useState('')
  const [inspector, setInspector] = useState(true)
  const [selectedCol, setSelectedCol] = useState<number>()
  const [exportMenu, setExportMenu] = useState(false)
  const exportBtn = useRef<HTMLSpanElement>(null)

  const result = run?.results[run.activeResult]
  useEffect(() => setSelectedCol(undefined), [result])

  if (!run || (!run.running && !run.results.length && !run.error)) return <EmptyResults />

  const showError = run.error && run.activeResult >= run.results.length
  const tabs = run.results.length + (run.error ? 1 : 0)

  const copy = (fmt: 'tsv' | 'md') => {
    if (!result) return
    const cols = result.columns.map((c) => c.name)
    navigator.clipboard.writeText(fmt === 'tsv' ? toTsv(cols, result.rows) : toMarkdown(cols, result.rows))
    toast.success(`Copied ${fmtNumber(result.rows.length)} rows`)
    setExportMenu(false)
  }
  const exportAs = (fmt: 'csv' | 'json') => {
    if (!result) return
    const cols = result.columns.map((c) => c.name)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    if (fmt === 'csv') download(`result-${stamp}.csv`, toCsv(cols, result.rows), 'text/csv')
    else download(`result-${stamp}.json`, JSON.stringify(result.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))), null, 2), 'application/json')
    setExportMenu(false)
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      {run.running && <div className="shimmer-bar h-[2px] w-full" />}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
        {tabs > 1 && (
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {run.results.map((r, i) => (
              <button
                key={i}
                onClick={() => useApp.getState().setActiveResult(worksheetId, i)}
                title={r.statement}
                className={clsx(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px]',
                  run.activeResult === i ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                )}
              >
                {r.kind === 'rows' ? <Table2 size={12} /> : <Terminal size={12} />}
                <span className="mono max-w-28 truncate">{r.statement.split(/\s+/).slice(0, 2).join(' ')}</span>
              </button>
            ))}
            {run.error && (
              <button
                onClick={() => useApp.getState().setActiveResult(worksheetId, run.results.length)}
                className={clsx('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-bad', showError ? 'bg-bad-soft' : 'hover:bg-hover')}
              >
                <AlertTriangle size={12} /> Error
              </button>
            )}
            <div className="mx-1 h-4 w-px shrink-0 bg-line" />
          </div>
        )}

        {result && !showError && result.kind === 'rows' && (
          <div className="flex shrink-0 gap-0.5 rounded-md bg-canvas/60 p-0.5">
            {(
              [
                ['grid', Table2, 'Results'],
                ['chart', BarChart3, 'Chart'],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={clsx('flex h-6 items-center gap-1.5 rounded px-2 text-[12px] font-medium', view === k ? 'bg-active text-fg shadow-sm' : 'text-muted hover:text-fg')}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-[12px] text-muted">
          {run.running ? (
            <>
              <span className="flex items-center gap-1.5 text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Running
              </span>
              <Elapsed since={run.startedAt!} />
            </>
          ) : showError ? (
            <span className="flex items-center gap-1.5 text-bad">
              <AlertTriangle size={13} /> Failed after {fmtDuration(run.elapsedMs ?? 0)}
            </span>
          ) : result ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <CheckCircle2 size={13} className="shrink-0 text-ok" />
              {result.kind === 'rows' ? (
                <span className="truncate">
                  <span className="text-fg tabular-nums">{fmtNumber(result.rowCount)}</span> rows
                  {result.truncated && <span className="text-warn"> · showing {fmtNumber(result.rows.length)}</span>}
                </span>
              ) : (
                <span className="truncate">{result.message}</span>
              )}
              <span className="text-faint">·</span>
              <span className="mono tabular-nums">{fmtDuration(result.elapsedMs)}</span>
            </span>
          ) : null}
        </div>

        {run.running && (
          <Button size="sm" variant="secondary" icon={<Square size={11} className="fill-current" />} onClick={() => useApp.getState().cancel(worksheetId)}>
            Cancel
          </Button>
        )}

        {result && !showError && result.kind === 'rows' && !run.running && (
          <>
            {view === 'grid' && (
              <div className="relative">
                <Search size={12} className="absolute top-1/2 left-2 -translate-y-1/2 text-faint" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter rows"
                  className="h-7 w-36 rounded-md border border-line bg-canvas/60 pr-2 pl-6 text-[12px] outline-none placeholder:text-faint focus:w-52 focus:border-accent transition-[width]"
                />
              </div>
            )}
            <span ref={exportBtn} className="inline-flex">
              <IconButton tip="Copy / export" onClick={() => setExportMenu(true)}>
                <Download size={14} />
              </IconButton>
            </span>
            <Popover anchor={exportBtn.current} open={exportMenu} onClose={() => setExportMenu(false)} align="end" width={210}>
              <MenuItem icon={<ClipboardCopy size={14} />} onClick={() => copy('tsv')} hint="Excel">
                Copy as TSV
              </MenuItem>
              <MenuItem icon={<ClipboardCopy size={14} />} onClick={() => copy('md')}>
                Copy as Markdown
              </MenuItem>
              <div className="my-1 border-t border-line" />
              <MenuItem icon={<Download size={14} />} onClick={() => exportAs('csv')}>
                Download CSV
              </MenuItem>
              <MenuItem icon={<Download size={14} />} onClick={() => exportAs('json')}>
                Download JSON
              </MenuItem>
            </Popover>
            <IconButton tip="Column details" active={inspector} onClick={() => setInspector(!inspector)}>
              <PanelRight size={14} />
            </IconButton>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {run.running && !run.results.length ? (
            <RunningState />
          ) : showError ? (
            <ErrorState message={run.error!.message} />
          ) : result?.kind === 'command' ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 size={28} className="text-ok" />
              <div className="text-[14px] font-medium">{result.message ?? 'Statement executed'}</div>
              <pre className="mono max-w-[70%] truncate text-[11.5px] text-faint">{result.statement.slice(0, 160)}</pre>
            </div>
          ) : result ? (
            view === 'chart' ? (
              <ResultChart key={result.statement + result.elapsedMs} result={result} />
            ) : (
              <ResultsGrid columns={result.columns} rows={result.rows} filter={filter} selectedColumn={selectedCol} onSelectColumn={setSelectedCol} />
            )
          ) : null}
        </div>
        {inspector && result?.kind === 'rows' && !showError && result.columns.length > 0 && view === 'grid' && (
          <div className="w-72 shrink-0 border-l border-line">
            <ColumnInspector result={result} selected={selectedCol} onSelect={setSelectedCol} />
          </div>
        )}
      </div>
    </div>
  )
}

function RunningState() {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-hover/70" style={{ width: `${90 - i * 9}%`, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-bad">Query failed</div>
            <pre className="mono mt-1.5 text-[12px] leading-relaxed break-words whitespace-pre-wrap text-fg/90">{message}</pre>
          </div>
        </div>
        <div className="mt-3 flex gap-2 pl-7">
          <Button size="sm" variant="ai" icon={<Sparkles size={13} />} onClick={() => askAi('My last query failed. Diagnose the error using the schema, then propose a fixed query in the editor.')}>
            Fix with AI
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(message)
              toast.success('Error copied')
            }}
          >
            Copy error
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyResults() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line-strong bg-raised text-accent">
          <Table2 size={20} />
        </div>
      </div>
      <div>
        <div className="text-[13.5px] font-medium">Run a query to see results</div>
        <div className="mt-1 text-[12px] text-muted">Results, charts and column statistics appear here.</div>
      </div>
      <div className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 text-[12px] text-muted">
        <span className="flex justify-end gap-1">
          <Kbd>{modKey}</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <span className="text-left">Run statement under cursor</span>
        <span className="flex justify-end gap-1">
          <Kbd>{modKey}</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <span className="text-left">Run all</span>
        <span className="flex justify-end gap-1">
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </span>
        <span className="text-left">Ask AI</span>
        <span className="flex justify-end gap-1">
          <Kbd>{modKey}</Kbd>
          <Kbd>P</Kbd>
        </span>
        <span className="text-left">Command palette</span>
      </div>
    </div>
  )
}
