import clsx from 'clsx'
import { CheckCircle2, CircleX, FilePlus2, RefreshCw, Search, Sparkles, Trash2, CornerDownLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HistoryEntry } from '../../../shared/types'
import { api } from '../lib/api'
import { appendStatement } from '../lib/editorActions'
import { fmtDuration, fmtNumber, timeAgo } from '../lib/format'
import { useApp } from '../store/app'
import { IconButton, Tooltip } from './ui'

export function HistoryPanel() {
  const [items, setItems] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'errors' | 'ai'>('all')
  const connections = useApp((s) => s.connections)
  const runs = useApp((s) => s.runs)

  const load = () => {
    setLoading(true)
    api
      .history()
      .then(setItems)
      .finally(() => setLoading(false))
  }
  // refresh whenever any query finishes
  const runningCount = Object.values(runs).filter((r) => r.running).length
  useEffect(load, [runningCount])

  const list = useMemo(
    () =>
      items.filter(
        (h) =>
          (filter === 'all' || (filter === 'errors' ? !h.ok : h.source === 'ai')) && (!query || h.sql.toLowerCase().includes(query.toLowerCase())),
      ),
    [items, query, filter],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <span className="flex-1 text-[13px] font-semibold">Query history</span>
        <IconButton tip="Refresh" onClick={load}>
          <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
        </IconButton>
        <IconButton
          tip="Clear history"
          onClick={async () => {
            if (await useApp.getState().askConfirm({ title: 'Clear query history?', body: 'All history entries will be removed.', action: 'Clear' })) {
              await api.clearHistory()
              load()
            }
          }}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SQL"
            className="h-7 w-full rounded-md border border-line bg-canvas/60 pr-2 pl-7 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <div className="flex gap-1 rounded-md bg-canvas/60 p-0.5">
          {(['all', 'errors', 'ai'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx('flex-1 rounded px-2 py-0.5 text-[11.5px] font-medium capitalize', filter === f ? 'bg-active text-fg' : 'text-muted hover:text-fg')}
            >
              {f === 'ai' ? 'AI' : f}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {list.map((h) => {
          const conn = connections.find((c) => c.id === h.connectionId)
          return (
            <div key={h.id} className="group relative rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-1.5 text-[11px] text-faint">
                {h.ok ? <CheckCircle2 size={12} className="text-ok" /> : <CircleX size={12} className="text-bad" />}
                {h.source === 'ai' && <Sparkles size={11} className="text-ai" />}
                <span className="truncate">{conn?.name ?? 'deleted connection'}</span>
                <span>·</span>
                <span className="shrink-0">{fmtDuration(h.elapsedMs)}</span>
                {h.rowCount != null && (
                  <>
                    <span>·</span>
                    <span className="shrink-0">{fmtNumber(h.rowCount)} rows</span>
                  </>
                )}
                <span className="ml-auto shrink-0">{timeAgo(h.at)}</span>
              </div>
              <pre className="mono mt-1 line-clamp-3 text-[11.5px] leading-[1.45] whitespace-pre-wrap text-muted group-hover:text-fg">{h.sql.trim()}</pre>
              {h.error && <div className="mt-1 line-clamp-2 text-[11px] text-bad">{h.error}</div>}
              <div className="absolute top-1.5 right-1.5 hidden gap-0.5 rounded-md border border-line bg-raised p-0.5 shadow group-hover:flex">
                <Tooltip tip="Insert into editor">
                  <button onClick={() => appendStatement(h.sql.trim().replace(/;?$/, ';'))} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg">
                    <CornerDownLeft size={13} />
                  </button>
                </Tooltip>
                <Tooltip tip="Open in new worksheet">
                  <button
                    onClick={() => useApp.getState().createWorksheet({ sql: h.sql, connectionId: h.connectionId, name: 'From history' })}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
                  >
                    <FilePlus2 size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )
        })}
        {!list.length && <div className="py-10 text-center text-[12px] text-faint">{loading ? 'Loading…' : 'No queries yet'}</div>}
      </div>
    </div>
  )
}
