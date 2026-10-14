import clsx from 'clsx'
import { CheckCircle2, CircleX, FilePlus2, Lock, Pencil, Plus, PlugZap, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Connection } from '../../../shared/types'
import { api } from '../lib/api'
import { DB_META } from '../lib/dialect'
import { useApp } from '../store/app'
import { Badge, DbIcon, IconButton, Spinner } from './ui'

type TestState = { status: 'testing' } | { status: 'ok'; message: string } | { status: 'error'; message: string }

const endpoint = (c: Connection) =>
  c.type === 'snowflake'
    ? [c.config.account, c.config.user].filter(Boolean).join(' · ')
    : `${c.config.user ? `${c.config.user}@` : ''}${c.config.host ?? ''}${c.config.port ? `:${c.config.port}` : ''}`

export function ConnectionsPanel() {
  const connections = useApp((s) => s.connections)
  const worksheets = useApp((s) => s.worksheets)
  const [query, setQuery] = useState('')
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const { openConnectionDialog, createWorksheet, askConfirm, deleteConnection } = useApp.getState()

  const usage = useMemo(() => {
    const n: Record<string, number> = {}
    for (const w of Object.values(worksheets)) if (w.connectionId) n[w.connectionId] = (n[w.connectionId] ?? 0) + 1
    return n
  }, [worksheets])

  const list = useMemo(() => {
    const q = query.toLowerCase()
    return connections.filter((c) => !q || `${c.name} ${DB_META[c.type].label} ${endpoint(c)}`.toLowerCase().includes(q))
  }, [connections, query])

  const test = async (c: Connection) => {
    setTests((t) => ({ ...t, [c.id]: { status: 'testing' } }))
    try {
      const r = await api.testConnection(c)
      setTests((t) => ({ ...t, [c.id]: r.ok ? { status: 'ok', message: `${r.version} · ${r.elapsedMs}ms` } : { status: 'error', message: r.error ?? 'Failed' } }))
    } catch (e) {
      setTests((t) => ({ ...t, [c.id]: { status: 'error', message: (e as Error).message } }))
    }
  }

  const remove = async (c: Connection) => {
    if (!(await askConfirm({ title: 'Delete connection?', body: `“${c.name}” will be removed. Worksheets using it are kept.`, action: 'Delete' }))) return
    await deleteConnection(c.id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <span className="flex-1 text-[13px] font-semibold">Connections</span>
        <IconButton tip="New connection" onClick={() => openConnectionDialog()}>
          <Plus size={15} />
        </IconButton>
      </div>
      {connections.length > 0 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter connections"
              className="h-7 w-full rounded-md border border-line bg-canvas/60 pr-2 pl-7 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
            />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {list.map((c) => {
          const t = tests[c.id]
          const used = usage[c.id] ?? 0
          return (
            <div key={c.id} onDoubleClick={() => openConnectionDialog(c)} className="group relative rounded-md px-2 py-2 hover:bg-hover">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <DbIcon type={c.type} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                {c.readOnly && (
                  <Badge tone="warn">
                    <Lock size={9} />
                    RO
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 pl-4 text-[11px] text-faint">
                <span>{DB_META[c.type].label}</span>
                {endpoint(c) && (
                  <>
                    <span>·</span>
                    <span className="mono truncate">{endpoint(c)}</span>
                  </>
                )}
              </div>
              <div className="mt-0.5 pl-4 text-[11px] text-faint">
                {c.config.database ? <span className="mono">{c.config.database}</span> : 'No default database'}
                <span> · </span>
                {used} worksheet{used === 1 ? '' : 's'}
              </div>
              {t && (
                <div
                  className={clsx(
                    'mt-1 flex items-start gap-1.5 pl-4 text-[11px]',
                    t.status === 'ok' && 'text-ok',
                    t.status === 'error' && 'text-bad',
                    t.status === 'testing' && 'text-muted',
                  )}
                >
                  {t.status === 'testing' ? <Spinner className="mt-px h-3 w-3 shrink-0" /> : t.status === 'ok' ? <CheckCircle2 size={12} className="mt-px shrink-0" /> : <CircleX size={12} className="mt-px shrink-0" />}
                  <span className="line-clamp-2">{t.status === 'testing' ? 'Testing…' : t.message}</span>
                </div>
              )}
              <div className="absolute top-1.5 right-1.5 hidden gap-0.5 rounded-md border border-line bg-raised p-0.5 shadow group-hover:flex">
                <IconButton tip="Test connection" className="h-6 w-6" onClick={() => test(c)}>
                  <PlugZap size={13} />
                </IconButton>
                <IconButton tip="New worksheet" className="h-6 w-6" onClick={() => createWorksheet({ connectionId: c.id, database: c.config.database || undefined, schema: c.config.schema || undefined })}>
                  <FilePlus2 size={13} />
                </IconButton>
                <IconButton tip="Edit" className="h-6 w-6" onClick={() => openConnectionDialog(c)}>
                  <Pencil size={13} />
                </IconButton>
                <IconButton tip="Delete" className="h-6 w-6 hover:text-bad" onClick={() => remove(c)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          )
        })}
        {!connections.length && (
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <div className="text-[12.5px] text-faint">No connections yet</div>
            <button onClick={() => openConnectionDialog()} className="text-[12.5px] font-medium text-accent hover:underline">
              Add a connection
            </button>
          </div>
        )}
        {connections.length > 0 && !list.length && <div className="py-10 text-center text-[12px] text-faint">No matches</div>}
      </div>
    </div>
  )
}
