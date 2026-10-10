import { Command } from 'cmdk'
import { Database, FileCode2, FilePlus2, History, Moon, PanelLeft, Play, Plug, Settings, Sparkles, Sun, Table2, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { focusAi } from '../lib/aiBus'
import { formatEditor, insertText, runCurrent } from '../lib/editorActions'
import { modKey } from '../lib/format'
import { quoteIdent } from '../../../shared/sql'
import { catalogKey, useApp } from '../store/app'
import { DbIcon, Kbd } from './ui'

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen)
  const worksheets = useApp((s) => s.worksheets)
  const connections = useApp((s) => s.connections)
  const theme = useApp((s) => s.theme)
  const ws = useApp((s) => (s.activeTabId ? s.worksheets[s.activeTabId] : undefined))
  const catalog = useApp((s) => (ws?.connectionId && ws.database ? s.catalogs[catalogKey(ws.connectionId, ws.database)]?.data : undefined))
  const conn = connections.find((c) => c.id === ws?.connectionId)
  const [search, setSearch] = useState('')
  const close = () => useApp.setState({ paletteOpen: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P') && !e.shiftKey) {
        e.preventDefault()
        useApp.setState((s) => ({ paletteOpen: !s.paletteOpen }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => setSearch(''), [open])

  const sheets = useMemo(() => Object.values(worksheets).sort((a, b) => b.updatedAt - a.updatedAt), [worksheets])
  const act = (fn: () => void) => () => {
    close()
    setTimeout(fn, 10)
  }

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Command
        loop
        className="w-[600px] animate-pop overflow-hidden rounded-xl border border-line-strong bg-panel"
        style={{ boxShadow: 'var(--shadow-pop)' }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder="Search commands, worksheets, tables…"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint"
        />
        <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
          <Command.Empty className="py-8 text-center text-[13px] text-faint">No results</Command.Empty>
          <Command.Group heading="Actions">
            <Item icon={<Play size={14} />} onSelect={act(() => runCurrent())} hint={`${modKey} ↵`}>
              Run statement
            </Item>
            <Item icon={<Play size={14} />} onSelect={act(() => runCurrent(undefined, true))} hint={`${modKey} ⇧ ↵`}>
              Run all
            </Item>
            <Item icon={<Sparkles size={14} />} onSelect={act(focusAi)} hint={`${modKey} K`}>
              Ask AI
            </Item>
            <Item icon={<Wand2 size={14} />} onSelect={act(() => formatEditor())} hint="⇧ Alt F">
              Format SQL
            </Item>
            <Item icon={<FilePlus2 size={14} />} onSelect={act(() => useApp.getState().createWorksheet())}>
              New worksheet
            </Item>
            <Item icon={<Plug size={14} />} onSelect={act(() => useApp.getState().openConnectionDialog())}>
              New connection
            </Item>
            <Item icon={<PanelLeft size={14} />} onSelect={act(() => useApp.getState().setPrefs({ leftPanel: 'data' }))}>
              Open data explorer
            </Item>
            <Item icon={<History size={14} />} onSelect={act(() => useApp.getState().setPrefs({ leftPanel: 'history' }))}>
              Open query history
            </Item>
            <Item icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} onSelect={act(() => useApp.getState().setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' }))}>
              Switch to {theme === 'dark' ? 'light' : 'dark'} theme
            </Item>
            <Item icon={<Settings size={14} />} onSelect={act(() => useApp.setState({ settingsOpen: true }))}>
              Settings
            </Item>
          </Command.Group>
          <Command.Group heading="Worksheets">
            {sheets.map((w) => (
              <Item key={w.id} value={`sheet ${w.name} ${w.id}`} icon={<FileCode2 size={14} />} onSelect={act(() => useApp.getState().openWorksheet(w.id))}>
                {w.name}
              </Item>
            ))}
          </Command.Group>
          {ws && (
            <Command.Group heading="Use connection">
              {connections.map((c) => (
                <Item
                  key={c.id}
                  value={`connection ${c.name}`}
                  icon={<DbIcon type={c.type} className="h-3.5 w-3.5" />}
                  onSelect={act(() => useApp.getState().updateWorksheet(ws.id, { connectionId: c.id, database: c.config.database || undefined, schema: c.config.schema || undefined }))}
                >
                  {c.name}
                </Item>
              ))}
            </Command.Group>
          )}
          {search.length > 1 && catalog && conn && (
            <Command.Group heading={`Tables in ${ws?.database}`}>
              {catalog.slice(0, 400).map((t) => (
                <Item
                  key={`${t.schema}.${t.name}`}
                  value={`table ${t.schema ?? ''} ${t.name}`}
                  icon={t.kind === 'view' ? <Database size={14} /> : <Table2 size={14} />}
                  hint="insert"
                  onSelect={act(() => insertText(quoteIdent(t.name, conn.type)))}
                >
                  {t.schema ? <span className="text-muted">{t.schema}.</span> : null}
                  {t.name}
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>,
    document.body,
  )
}

function Item({ icon, children, onSelect, hint, value }: { icon: React.ReactNode; children: React.ReactNode; onSelect: () => void; hint?: string; value?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 text-[13px] text-fg">
      <span className="flex w-4 justify-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <Kbd>{hint}</Kbd>}
    </Command.Item>
  )
}
