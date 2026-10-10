import clsx from 'clsx'
import {
  ChevronRight,
  Columns3,
  Database,
  Eye,
  FolderTree,
  Play,
  Plus,
  RefreshCw,
  Search,
  Table2,
  CornerDownLeft,
  Settings2,
  Lock,
  Crosshair,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { quoteIdent } from '../../../shared/sql'
import type { CatalogTable, Connection } from '../../../shared/types'
import { catalogKey, useActiveWorksheet, useApp } from '../store/app'
import { appendStatement, insertText, runCurrent } from '../lib/editorActions'
import { fmtCompact } from '../lib/format'
import { DbIcon, IconButton, MenuItem, Popover, Spinner, Tooltip } from './ui'

export function DataExplorer() {
  const connections = useApp((s) => s.connections)
  const ws = useActiveWorksheet()
  const [connId, setConnId] = useState<string | undefined>(ws?.connectionId ?? connections[0]?.id)
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState(false)
  const pickBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (ws?.connectionId) setConnId(ws.connectionId)
  }, [ws?.connectionId])

  const conn = connections.find((c) => c.id === connId)
  const dbs = useApp((s) => (connId ? s.databases[connId] : undefined))
  useEffect(() => {
    if (connId) void useApp.getState().loadDatabases(connId)
  }, [connId])

  if (!connections.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Database size={20} />
        </div>
        <div className="text-[13px] font-medium">No connections yet</div>
        <div className="text-[12px] text-muted">Connect to MySQL, Snowflake or ClickHouse to browse your data.</div>
        <button onClick={() => useApp.getState().openConnectionDialog()} className="mt-1 text-[12.5px] font-medium text-accent hover:underline">
          Add a connection
        </button>
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <button ref={pickBtn} onClick={() => setPick(true)} className="-ml-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover">
          {conn && <DbIcon type={conn.type} />}
          <span className="truncate text-[13px] font-semibold">{conn?.name ?? 'Select connection'}</span>
          {conn?.readOnly && <Lock size={11} className="shrink-0 text-warn" />}
          <ChevronRight size={13} className="shrink-0 rotate-90 text-faint" />
        </button>
        {conn && (
          <IconButton tip="Edit connection" onClick={() => useApp.getState().openConnectionDialog(conn)}>
            <Settings2 size={14} />
          </IconButton>
        )}
        <IconButton tip="Refresh" onClick={() => connId && refreshAll(connId)}>
          <RefreshCw size={14} className={clsx(dbs?.status === 'loading' && 'animate-spin')} />
        </IconButton>
      </div>
      <Popover anchor={pickBtn.current} open={pick} onClose={() => setPick(false)} width={260}>
        {connections.map((c) => (
          <MenuItem key={c.id} icon={<DbIcon type={c.type} />} active={c.id === connId} onClick={() => (setConnId(c.id), setPick(false))} hint={c.readOnly ? 'read-only' : undefined}>
            {c.name}
          </MenuItem>
        ))}
        <div className="my-1 border-t border-line" />
        <MenuItem icon={<Plus size={14} />} onClick={() => (setPick(false), useApp.getState().openConnectionDialog())}>
          New connection
        </MenuItem>
      </Popover>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter loaded objects"
            className="h-7 w-full rounded-md border border-line bg-canvas/60 pr-2 pl-7 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 select-none">
        {dbs?.status === 'loading' && !dbs.data && <LoadingRow depth={0} />}
        {dbs?.status === 'error' && <ErrorRow message={dbs.error!} />}
        {conn && dbs?.data?.map((d) => <DatabaseNode key={d.name} conn={conn} name={d.name} query={query.toLowerCase()} />)}
      </div>
    </div>
  )
}

function refreshAll(connId: string) {
  const s = useApp.getState()
  void s.loadDatabases(connId, true)
  for (const key of Object.keys(s.catalogs)) {
    if (key.startsWith(`${connId}::`)) void s.loadCatalog(connId, key.slice(connId.length + 2), true)
  }
}

function Row({
  depth,
  open,
  onToggle,
  icon,
  label,
  meta,
  actions,
  onDoubleClick,
  title,
  active,
}: {
  depth: number
  open?: boolean
  onToggle?: () => void
  icon: React.ReactNode
  label: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  onDoubleClick?: () => void
  title?: string
  active?: boolean
}) {
  return (
    <div
      title={title}
      onClick={onToggle}
      onDoubleClick={onDoubleClick}
      className={clsx('group flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md pr-1.5 text-[12.5px] hover:bg-hover', active && 'text-accent')}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      <span className="flex w-3.5 shrink-0 justify-center text-faint">
        {onToggle !== undefined && open !== undefined && <ChevronRight size={12} className={clsx('transition-transform duration-150', open && 'rotate-90')} />}
      </span>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-[10.5px] text-faint group-hover:hidden">{meta}</span>}
      {actions && <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">{actions}</span>}
    </div>
  )
}

function MiniAction({ tip, onClick, children }: { tip: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip tip={tip}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-active hover:text-fg"
      >
        {children}
      </button>
    </Tooltip>
  )
}

const LoadingRow = ({ depth }: { depth: number }) => (
  <div className="flex h-[26px] items-center gap-2 text-[12px] text-faint" style={{ paddingLeft: 26 + depth * 14 }}>
    <Spinner className="h-3 w-3" /> Loading…
  </div>
)
const ErrorRow = ({ message }: { message: string }) => <div className="mx-2 my-1 rounded-md bg-bad-soft px-2 py-1.5 text-[11.5px] break-words text-bad">{message}</div>

function DatabaseNode({ conn, name, query }: { conn: Connection; name: string; query: string }) {
  const ws = useActiveWorksheet()
  const cat = useApp((s) => s.catalogs[catalogKey(conn.id, name)])
  const [open, setOpen] = useState(false)
  const isCurrent = ws?.connectionId === conn.id && ws.database === name
  const forceOpen = !!query && !!cat?.data
  const expanded = open || forceOpen

  const tables = useMemo(() => {
    const all = cat?.data ?? []
    if (!query) return all
    return all.filter((t) => t.name.toLowerCase().includes(query) || t.columns.some((c) => c.name.toLowerCase().includes(query)))
  }, [cat?.data, query])
  if (query && cat?.data && !tables.length && !name.toLowerCase().includes(query)) return null

  const toggle = () => {
    if (!open) void useApp.getState().loadCatalog(conn.id, name)
    setOpen(!open)
  }
  const setContext = () => {
    if (ws) useApp.getState().updateWorksheet(ws.id, { connectionId: conn.id, database: name, schema: conn.type === 'snowflake' ? undefined : ws.schema })
  }

  return (
    <div>
      <Row
        depth={0}
        open={expanded}
        onToggle={toggle}
        active={isCurrent}
        icon={<Database size={13} className={isCurrent ? 'text-accent' : 'text-muted'} />}
        label={name}
        meta={cat?.data ? `${cat.data.length}` : undefined}
        actions={
          <MiniAction tip="Use as worksheet context" onClick={setContext}>
            <Crosshair size={12} />
          </MiniAction>
        }
      />
      {expanded && (
        <div>
          {cat?.status === 'loading' && !cat.data && <LoadingRow depth={1} />}
          {cat?.status === 'error' && <ErrorRow message={cat.error!} />}
          {conn.type === 'snowflake' ? (
            <SchemaGroups conn={conn} tables={tables} query={query} />
          ) : (
            tables.map((t) => <TableNode key={t.name} conn={conn} table={t} depth={1} query={query} />)
          )}
          {cat?.data && !tables.length && <div className="py-1 text-[12px] text-faint" style={{ paddingLeft: 40 }}>No tables</div>}
        </div>
      )}
    </div>
  )
}

function SchemaGroups({ conn, tables, query }: { conn: Connection; tables: CatalogTable[]; query: string }) {
  const groups = useMemo(() => {
    const m = new Map<string, CatalogTable[]>()
    for (const t of tables) m.set(t.schema ?? '', [...(m.get(t.schema ?? '') ?? []), t])
    return [...m.entries()]
  }, [tables])
  return (
    <>
      {groups.map(([schema, list]) => (
        <SchemaNode key={schema} conn={conn} schema={schema} tables={list} query={query} />
      ))}
    </>
  )
}

function SchemaNode({ conn, schema, tables, query }: { conn: Connection; schema: string; tables: CatalogTable[]; query: string }) {
  const [open, setOpen] = useState(false)
  const ws = useActiveWorksheet()
  const db = tables[0]?.database
  const isCurrent = ws?.connectionId === conn.id && ws.database === db && ws.schema === schema
  const expanded = open || !!query
  return (
    <div>
      <Row
        depth={1}
        open={expanded}
        onToggle={() => setOpen(!open)}
        active={isCurrent}
        icon={<FolderTree size={13} className={isCurrent ? 'text-accent' : 'text-muted'} />}
        label={schema}
        meta={tables.length}
        actions={
          <MiniAction tip="Use as worksheet context" onClick={() => ws && useApp.getState().updateWorksheet(ws.id, { connectionId: conn.id, database: db, schema })}>
            <Crosshair size={12} />
          </MiniAction>
        }
      />
      {expanded && tables.map((t) => <TableNode key={t.name} conn={conn} table={t} depth={2} query={query} />)}
    </div>
  )
}

function qualified(conn: Connection, t: CatalogTable) {
  const ws = useApp.getState().worksheets[useApp.getState().activeTabId ?? '']
  const parts = [t.name]
  if (conn.type === 'snowflake') {
    if (t.schema && (t.schema !== ws?.schema || t.database !== ws?.database)) parts.unshift(t.schema)
    if (t.database !== ws?.database) parts.unshift(t.database)
  } else if (t.database !== ws?.database) parts.unshift(t.database)
  return parts.map((p) => quoteIdent(p, conn.type)).join('.')
}

function TableNode({ conn, table, depth, query }: { conn: Connection; table: CatalogTable; depth: number; query: string }) {
  const [open, setOpen] = useState(false)
  const cols = query && !table.name.toLowerCase().includes(query) ? table.columns.filter((c) => c.name.toLowerCase().includes(query)) : table.columns
  const expanded = open || (!!query && cols.length !== table.columns.length)
  const preview = async () => {
    const ws = useApp.getState().worksheets[useApp.getState().activeTabId ?? '']
    if (!ws) return
    if (ws.connectionId !== conn.id) useApp.getState().updateWorksheet(ws.id, { connectionId: conn.id })
    appendStatement(`SELECT *\nFROM ${qualified(conn, table)}\nLIMIT 100;`)
    await runCurrent()
  }
  return (
    <div>
      <Row
        depth={depth}
        open={expanded}
        onToggle={() => setOpen(!open)}
        onDoubleClick={() => insertText(qualified(conn, table))}
        title={table.comment}
        icon={table.kind === 'view' ? <Eye size={13} className="text-ai" /> : <Table2 size={13} className="text-accent/80" />}
        label={table.name}
        meta={table.rows != null ? fmtCompact(table.rows) : undefined}
        actions={
          <>
            <MiniAction tip="Insert name" onClick={() => insertText(qualified(conn, table))}>
              <CornerDownLeft size={12} />
            </MiniAction>
            <MiniAction tip="Preview 100 rows" onClick={preview}>
              <Play size={12} />
            </MiniAction>
          </>
        }
      />
      {expanded &&
        cols.map((c) => (
          <Row
            key={c.name}
            depth={depth + 1}
            onDoubleClick={() => insertText(quoteIdent(c.name, conn.type))}
            icon={<Columns3 size={12} className="text-faint" />}
            label={<span className="text-muted">{c.name}</span>}
            meta={<span className="mono">{c.type.toLowerCase().slice(0, 22)}</span>}
            actions={
              <MiniAction tip="Insert column" onClick={() => insertText(quoteIdent(c.name, conn.type))}>
                <CornerDownLeft size={12} />
              </MiniAction>
            }
          />
        ))}
    </div>
  )
}
