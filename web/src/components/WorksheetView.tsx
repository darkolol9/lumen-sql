import clsx from 'clsx'
import { ChevronDown, Database, FolderTree, Lock, Play, Plus, Search, Sparkles, Square, Wand2, Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { focusAi } from '../lib/aiBus'
import { formatEditor, runCurrent } from '../lib/editorActions'
import { modKey } from '../lib/format'
import { DB_META } from '../lib/dialect'
import { catalogKey, useApp } from '../store/app'
import { ResultsPanel } from './ResultsPanel'
import { SqlEditor } from './SqlEditor'
import { Button, DbIcon, IconButton, Kbd, MenuItem, Popover, Spinner, Tooltip } from './ui'

export function WorksheetView({ worksheetId }: { worksheetId: string }) {
  const layout = useDefaultLayout({ id: 'lumen-editor-split', storage: localStorage })
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar worksheetId={worksheetId} />
      <Group orientation="vertical" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="min-h-0 flex-1">
        <Panel id="editor" defaultSize="52" minSize={80}>
          <SqlEditor worksheetId={worksheetId} />
        </Panel>
        <Separator className="h-px" />
        <Panel id="results" defaultSize="48" minSize={60}>
          <ResultsPanel worksheetId={worksheetId} />
        </Panel>
      </Group>
    </div>
  )
}

function Toolbar({ worksheetId }: { worksheetId: string }) {
  const ws = useApp((s) => s.worksheets[worksheetId])
  const connections = useApp((s) => s.connections)
  const running = useApp((s) => s.runs[worksheetId]?.running)
  const conn = connections.find((c) => c.id === ws?.connectionId)
  const [runMenu, setRunMenu] = useState(false)
  const runMenuBtn = useRef<HTMLButtonElement>(null)

  // warm the catalog for autocomplete as soon as the context is known
  useEffect(() => {
    if (conn && ws?.database) void useApp.getState().loadCatalog(conn.id, ws.database)
    if (conn) void useApp.getState().loadDatabases(conn.id)
  }, [conn, ws?.database])

  if (!ws) return null
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2.5">
      <ConnectionPicker worksheetId={worksheetId} />
      {conn && (
        <>
          <span className="text-faint">/</span>
          <DatabasePicker worksheetId={worksheetId} />
          {conn.type === 'snowflake' && ws.database && (
            <>
              <span className="text-faint">.</span>
              <SchemaPicker worksheetId={worksheetId} />
            </>
          )}
        </>
      )}
      {conn?.readOnly && (
        <Tooltip tip="Read-only connection: writes are blocked">
          <span className="ml-1 flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-warn uppercase">
            <Lock size={10} /> Read only
          </span>
        </Tooltip>
      )}

      <div className="flex-1" />

      <IconButton tip="Format SQL (Shift+Alt+F)" onClick={() => formatEditor(worksheetId)}>
        <Wand2 size={15} />
      </IconButton>
      <Tooltip tip={<span className="flex items-center gap-1">Ask AI <Kbd>{modKey}</Kbd><Kbd>K</Kbd></span>}>
        <button onClick={focusAi} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-ai hover:bg-ai-soft">
          <Sparkles size={14} /> Ask AI
        </button>
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-line" />
      {running ? (
        <Button size="sm" variant="secondary" className="w-[92px]" icon={<Square size={11} className="fill-current" />} onClick={() => useApp.getState().cancel(worksheetId)}>
          Cancel
        </Button>
      ) : (
        <div className="flex">
          <Tooltip
            tip={
              <span className="flex items-center gap-1">
                Run <Kbd>{modKey}</Kbd>
                <Kbd>↵</Kbd>
              </span>
            }
          >
            <Button size="sm" variant="primary" className="rounded-r-none pr-2.5" icon={<Play size={12} className="fill-current" />} onClick={() => runCurrent(worksheetId)} disabled={!conn}>
              Run
            </Button>
          </Tooltip>
          <Button ref={runMenuBtn} size="sm" variant="primary" className="rounded-l-none border-l border-black/20 px-1.5" onClick={() => setRunMenu(true)} disabled={!conn}>
            <ChevronDown size={13} />
          </Button>
          <Popover anchor={runMenuBtn.current} open={runMenu} onClose={() => setRunMenu(false)} align="end" width={230}>
            <MenuItem icon={<Play size={13} />} hint={`${modKey} ↵`} onClick={() => (setRunMenu(false), void runCurrent(worksheetId))}>
              Run statement
            </MenuItem>
            <MenuItem icon={<Play size={13} />} hint={`${modKey} ⇧ ↵`} onClick={() => (setRunMenu(false), void runCurrent(worksheetId, true))}>
              Run all
            </MenuItem>
          </Popover>
        </div>
      )}
    </div>
  )
}

function PickerButton({ icon, label, placeholder, onClick, btnRef, loading }: { icon: React.ReactNode; label?: string; placeholder: string; onClick: () => void; btnRef: React.Ref<HTMLButtonElement>; loading?: boolean }) {
  return (
    <button ref={btnRef} onClick={onClick} className="flex h-7 max-w-56 min-w-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] hover:bg-hover">
      {icon}
      <span className={clsx('truncate', label ? 'font-medium text-fg' : 'text-faint')}>{label ?? placeholder}</span>
      {loading ? <Spinner className="h-3 w-3 text-faint" /> : <ChevronDown size={12} className="shrink-0 text-faint" />}
    </button>
  )
}

function SearchList({ items, value, onPick, empty }: { items: string[]; value?: string; onPick: (v: string) => void; empty: string }) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const list = useMemo(() => items.filter((i) => i.toLowerCase().includes(q.toLowerCase())), [items, q])
  return (
    <div className="flex flex-col">
      <div className="relative border-b border-line px-2 pb-1.5">
        <Search size={12} className="absolute top-1/2 left-4 -translate-y-[60%] text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => (setQ(e.target.value), setHi(0))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, list.length - 1))
            if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0))
            if (e.key === 'Enter' && list[hi]) onPick(list[hi])
          }}
          placeholder="Search…"
          className="h-7 w-full rounded-md bg-canvas/70 pr-2 pl-6 text-[12.5px] outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {list.map((i, idx) => (
          <MenuItem key={i} active={idx === hi} onClick={() => onPick(i)} icon={i === value ? <Check size={13} className="text-accent" /> : null}>
            {i}
          </MenuItem>
        ))}
        {!list.length && <div className="px-3 py-3 text-center text-[12px] text-faint">{empty}</div>}
      </div>
    </div>
  )
}

function ConnectionPicker({ worksheetId }: { worksheetId: string }) {
  const ws = useApp((s) => s.worksheets[worksheetId])
  const connections = useApp((s) => s.connections)
  const conn = connections.find((c) => c.id === ws?.connectionId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)} className="flex h-7 min-w-0 items-center gap-2 rounded-md border border-line-strong bg-raised px-2 text-[12.5px] hover:border-faint/40 hover:bg-hover">
        {conn ? <DbIcon type={conn.type} className="h-3.5 w-3.5" /> : <Database size={13} className="text-faint" />}
        <span className={clsx('max-w-44 truncate font-medium', !conn && 'text-faint')}>{conn?.name ?? 'Select connection'}</span>
        {conn && <span className="h-1.5 w-1.5 rounded-full" style={{ background: conn.color }} />}
        <ChevronDown size={12} className="text-faint" />
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={270}>
        <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Connections</div>
        {connections.map((c) => (
          <MenuItem
            key={c.id}
            active={c.id === conn?.id}
            icon={<DbIcon type={c.type} className="h-3.5 w-3.5" />}
            hint={c.readOnly ? <Lock size={11} className="text-warn" /> : DB_META[c.type].label}
            onClick={() => {
              setOpen(false)
              if (c.id !== ws?.connectionId) useApp.getState().updateWorksheet(worksheetId, { connectionId: c.id, database: c.config.database || undefined, schema: c.config.schema || undefined })
            }}
          >
            {c.name}
          </MenuItem>
        ))}
        <div className="my-1 border-t border-line" />
        <MenuItem icon={<Plus size={14} />} onClick={() => (setOpen(false), useApp.getState().openConnectionDialog())}>
          New connection…
        </MenuItem>
      </Popover>
    </>
  )
}

function DatabasePicker({ worksheetId }: { worksheetId: string }) {
  const ws = useApp((s) => s.worksheets[worksheetId])
  const dbs = useApp((s) => (ws?.connectionId ? s.databases[ws.connectionId] : undefined))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <PickerButton btnRef={ref} icon={<Database size={13} className="shrink-0 text-accent" />} label={ws?.database} placeholder="No database" loading={dbs?.status === 'loading'} onClick={() => setOpen(true)} />
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={260}>
        {dbs?.status === 'error' ? (
          <div className="px-3 py-2 text-[12px] text-bad">{dbs.error}</div>
        ) : (
          <SearchList
            items={dbs?.data?.map((d) => d.name) ?? []}
            value={ws?.database}
            empty={dbs?.status === 'loading' ? 'Loading…' : 'No databases'}
            onPick={(d) => {
              setOpen(false)
              useApp.getState().updateWorksheet(worksheetId, { database: d, schema: undefined })
            }}
          />
        )}
      </Popover>
    </>
  )
}

function SchemaPicker({ worksheetId }: { worksheetId: string }) {
  const ws = useApp((s) => s.worksheets[worksheetId])
  const cat = useApp((s) => (ws?.connectionId && ws.database ? s.catalogs[catalogKey(ws.connectionId, ws.database)] : undefined))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const schemas = useMemo(() => [...new Set((cat?.data ?? []).map((t) => t.schema!).filter(Boolean))].sort(), [cat?.data])
  return (
    <>
      <PickerButton btnRef={ref} icon={<FolderTree size={13} className="shrink-0 text-ai" />} label={ws?.schema} placeholder="Schema" loading={cat?.status === 'loading'} onClick={() => setOpen(true)} />
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={240}>
        <SearchList
          items={schemas}
          value={ws?.schema}
          empty={cat?.status === 'loading' ? 'Loading…' : 'No schemas'}
          onPick={(sc) => {
            setOpen(false)
            useApp.getState().updateWorksheet(worksheetId, { schema: sc })
          }}
        />
      </Popover>
    </>
  )
}
