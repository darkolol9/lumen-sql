import clsx from 'clsx'
import { Database, FileCode2, History, Moon, Plug, Plus, Search, Settings, Sparkles, Sun, X } from 'lucide-react'
import { useAi } from '../store/ai'
import { useApp, type LeftPanel } from '../store/app'
import { modKey } from '../lib/format'
import { EditableText, Kbd, Spinner, Tooltip } from './ui'

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="lumen-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lumen-g)" />
      <path d="M11 9v14h10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.5" cy="11" r="2.4" fill="white" fillOpacity="0.9" />
    </svg>
  )
}

function RailButton({ icon, tip, active, onClick, badge }: { icon: React.ReactNode; tip: string; active?: boolean; onClick: () => void; badge?: boolean }) {
  return (
    <Tooltip tip={tip} side="right">
      <button
        onClick={onClick}
        aria-label={tip}
        className={clsx(
          'relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150',
          active ? 'bg-accent-soft text-accent' : 'text-faint hover:bg-hover hover:text-fg',
        )}
      >
        {active && <span className="absolute top-2 bottom-2 -left-[9px] w-[3px] rounded-r bg-accent" />}
        {icon}
        {badge && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-ai" />}
      </button>
    </Tooltip>
  )
}

export function Rail() {
  const leftPanel = useApp((s) => s.leftPanel)
  const aiOpen = useApp((s) => s.aiOpen)
  const theme = useApp((s) => s.theme)
  const { setPrefs } = useApp.getState()
  const toggle = (p: LeftPanel) => setPrefs({ leftPanel: leftPanel === p ? null : p })
  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2.5">
      <div className="mb-2">
        <Logo />
      </div>
      <RailButton icon={<FileCode2 size={18} />} tip="Worksheets" active={leftPanel === 'worksheets'} onClick={() => toggle('worksheets')} />
      <RailButton icon={<Database size={18} />} tip="Data" active={leftPanel === 'data'} onClick={() => toggle('data')} />
      <RailButton icon={<History size={18} />} tip="Query history" active={leftPanel === 'history'} onClick={() => toggle('history')} />
      <div className="flex-1" />
      <RailButton icon={<Sparkles size={18} />} tip="AI assistant" active={aiOpen} onClick={() => setPrefs({ aiOpen: !aiOpen })} />
      <RailButton icon={<Plug size={18} />} tip="New connection" onClick={() => useApp.getState().openConnectionDialog()} />
      <RailButton icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} tip={`${theme === 'dark' ? 'Light' : 'Dark'} theme`} onClick={() => setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' })} />
      <RailButton icon={<Settings size={18} />} tip="Settings" onClick={() => useApp.setState({ settingsOpen: true })} />
    </div>
  )
}

export function TabBar() {
  const openTabs = useApp((s) => s.openTabs)
  const activeTabId = useApp((s) => s.activeTabId)
  const worksheets = useApp((s) => s.worksheets)
  const connections = useApp((s) => s.connections)
  const runs = useApp((s) => s.runs)
  const chats = useAi((s) => s.chats)
  const { openWorksheet, closeTab, createWorksheet, updateWorksheet } = useApp.getState()
  return (
    <div className="flex h-10 shrink-0 items-end gap-0.5 border-b border-line bg-canvas pr-2 pl-1.5">
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {openTabs.map((id) => {
          const w = worksheets[id]
          if (!w) return null
          const active = id === activeTabId
          const conn = connections.find((c) => c.id === w.connectionId)
          const running = runs[id]?.running
          const thinking = chats[id]?.streaming
          return (
            <div
              key={id}
              onClick={() => openWorksheet(id)}
              onMouseDown={(e) => e.button === 1 && (e.preventDefault(), closeTab(id))}
              className={clsx(
                'group relative flex h-[34px] max-w-56 min-w-28 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 pr-1.5 pl-3 text-[12.5px] transition-colors',
                active ? 'border-line bg-panel text-fg' : 'border-transparent text-muted hover:bg-hover/60 hover:text-fg',
              )}
            >
              {active && <span className="absolute -bottom-px left-0 h-px w-full bg-panel" />}
              {running ? <Spinner className="h-3 w-3 shrink-0 text-accent" /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: conn?.color ?? 'var(--c-line-strong)' }} />}
              <EditableText value={w.name} onSave={(v) => updateWorksheet(id, { name: v })} className="min-w-0 flex-1" />
              {thinking && <Sparkles size={11} className="shrink-0 animate-pulse text-ai" />}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(id)
                }}
                className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-active hover:text-fg', !active && 'opacity-0 group-hover:opacity-100')}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <Tooltip tip="New worksheet">
          <button onClick={() => createWorksheet()} className="mb-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-fg">
            <Plus size={15} />
          </button>
        </Tooltip>
      </div>
      <button
        onClick={() => useApp.setState({ paletteOpen: true })}
        className="mb-1.5 flex h-7 w-56 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[12px] text-faint transition-colors hover:border-line-strong hover:text-muted"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search everything</span>
        <Kbd>{modKey}</Kbd>
        <Kbd>P</Kbd>
      </button>
    </div>
  )
}
