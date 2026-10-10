import clsx from 'clsx'
import { Check, ChevronDown, Copy, FilePlus2, FileCode2, FolderPlus, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useApp } from '../store/app'
import { timeAgo } from '../lib/format'
import { EditableText, IconButton, MenuItem, Popover } from './ui'

export function WorksheetsPanel() {
  const workspaces = useApp((s) => s.workspaces)
  const activeWorkspaceId = useApp((s) => s.activeWorkspaceId)
  const worksheets = useApp((s) => s.worksheets)
  const activeTabId = useApp((s) => s.activeTabId)
  const connections = useApp((s) => s.connections)
  const { createWorksheet, openWorksheet, setPrefs, createWorkspace, renameWorkspace, deleteWorkspace, askConfirm } = useApp.getState()
  const [query, setQuery] = useState('')
  const [wsMenu, setWsMenu] = useState(false)
  const [renamingWs, setRenamingWs] = useState(false)
  const wsBtn = useRef<HTMLButtonElement>(null)
  const active = workspaces.find((w) => w.id === activeWorkspaceId)

  const list = useMemo(
    () =>
      Object.values(worksheets)
        .filter((w) => w.workspaceId === activeWorkspaceId)
        .filter((w) => !query || w.name.toLowerCase().includes(query.toLowerCase()) || w.sql.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [worksheets, activeWorkspaceId, query],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <button
          ref={wsBtn}
          onClick={() => setWsMenu((v) => !v)}
          className="-ml-1.5 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-hover"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-sky-400 to-violet-500 text-[10px] font-bold text-white">
            {active?.name[0]?.toUpperCase() ?? 'W'}
          </span>
          {renamingWs && active ? (
            <EditableText
              value={active.name}
              editing
              onEditingChange={setRenamingWs}
              onSave={(v) => renameWorkspace(active.id, v)}
              className="text-[13px] font-semibold"
            />
          ) : (
            <span className="truncate text-[13px] font-semibold">{active?.name ?? 'Workspace'}</span>
          )}
          <ChevronDown size={13} className="shrink-0 text-faint" />
        </button>
        <IconButton tip="New worksheet" onClick={() => createWorksheet()}>
          <FilePlus2 size={15} />
        </IconButton>
      </div>
      <Popover anchor={wsBtn.current} open={wsMenu} onClose={() => setWsMenu(false)} width={250}>
        <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Workspaces</div>
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            icon={w.id === activeWorkspaceId ? <Check size={14} className="text-accent" /> : null}
            hint={Object.values(worksheets).filter((s) => s.workspaceId === w.id).length}
            onClick={() => {
              setWsMenu(false)
              setPrefs({ activeWorkspaceId: w.id })
            }}
          >
            {w.name}
          </MenuItem>
        ))}
        <div className="my-1 border-t border-line" />
        <MenuItem
          icon={<FolderPlus size={14} />}
          onClick={() => {
            setWsMenu(false)
            const name = prompt('Workspace name', 'New workspace')
            if (name?.trim()) void createWorkspace(name.trim())
          }}
        >
          New workspace
        </MenuItem>
        {active && (
          <>
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => {
                setWsMenu(false)
                setRenamingWs(true)
              }}
            >
              Rename “{active.name}”
            </MenuItem>
            {workspaces.length > 1 && (
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  setWsMenu(false)
                  if (await askConfirm({ title: 'Delete workspace?', body: `“${active.name}” and all ${list.length} worksheets in it will be deleted.`, action: 'Delete workspace' }))
                    await deleteWorkspace(active.id)
                }}
              >
                Delete workspace
              </MenuItem>
            )}
          </>
        )}
      </Popover>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search worksheets"
            className="h-7 w-full rounded-md border border-line bg-canvas/60 pr-2 pl-7 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {list.map((w) => {
          const conn = connections.find((c) => c.id === w.connectionId)
          return <WorksheetRow key={w.id} id={w.id} name={w.name} active={w.id === activeTabId} meta={timeAgo(w.updatedAt)} color={conn?.color} onOpen={() => openWorksheet(w.id)} />
        })}
        {!list.length && (
          <div className="px-3 py-8 text-center text-[12px] text-faint">
            {query ? 'No matches' : 'No worksheets yet'}
            {!query && (
              <button onClick={() => createWorksheet()} className="mt-2 block w-full text-accent hover:underline">
                Create one
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WorksheetRow({ id, name, active, meta, color, onOpen }: { id: string; name: string; active: boolean; meta: string; color?: string; onOpen: () => void }) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const { updateWorksheet, duplicateWorksheet, deleteWorksheet, askConfirm } = useApp.getState()
  return (
    <div
      onClick={onOpen}
      onDoubleClick={() => setEditing(true)}
      className={clsx(
        'group relative flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] transition-colors',
        active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded bg-accent" />}
      <FileCode2 size={14} className={clsx('shrink-0', active ? 'text-accent' : 'text-faint')} />
      <EditableText value={name} editing={editing} onEditingChange={setEditing} onSave={(v) => updateWorksheet(id, { name: v })} className="min-w-0 flex-1 text-[13px]" />
      {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="shrink-0 text-[11px] text-faint group-hover:hidden">{meta}</span>
      <button
        ref={btn}
        onClick={(e) => {
          e.stopPropagation()
          setMenu(true)
        }}
        className="hidden h-5 w-5 items-center justify-center rounded text-muted group-hover:flex hover:bg-active hover:text-fg"
      >
        <MoreHorizontal size={14} />
      </button>
      <Popover anchor={btn.current} open={menu} onClose={() => setMenu(false)} width={180} align="end">
        <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(false), setEditing(true))}>
          Rename
        </MenuItem>
        <MenuItem icon={<Copy size={14} />} onClick={() => (setMenu(false), void duplicateWorksheet(id))}>
          Duplicate
        </MenuItem>
        <MenuItem
          danger
          icon={<Trash2 size={14} />}
          onClick={async () => {
            setMenu(false)
            if (await askConfirm({ title: 'Delete worksheet?', body: `“${name}” will be permanently deleted.`, action: 'Delete' })) await deleteWorksheet(id)
          }}
        >
          Delete
        </MenuItem>
      </Popover>
    </div>
  )
}
