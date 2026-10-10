import { FilePlus2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { Toaster } from 'sonner'
import { AiPanel } from './components/AiPanel'
import { CommandPalette } from './components/CommandPalette'
import { ConnectionDialog } from './components/ConnectionDialog'
import { DataExplorer } from './components/DataExplorer'
import { ConfirmDialog, SettingsDialog } from './components/Dialogs'
import { HistoryPanel } from './components/HistoryPanel'
import { Logo, Rail, TabBar } from './components/Shell'
import { Button, Spinner } from './components/ui'
import { WorksheetsPanel } from './components/WorksheetsPanel'
import { WorksheetView } from './components/WorksheetView'
import { focusAi } from './lib/aiBus'
import { useApp } from './store/app'

export default function App() {
  const loaded = useApp((s) => s.loaded)
  const theme = useApp((s) => s.theme)
  const leftPanel = useApp((s) => s.leftPanel)
  const aiOpen = useApp((s) => s.aiOpen)
  const activeTabId = useApp((s) => s.activeTabId)
  const [error, setError] = useState<string>()

  useEffect(() => {
    useApp.getState().bootstrap().catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // global shortcuts outside the editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k' && !(e.target as HTMLElement).closest('.monaco-editor')) {
        e.preventDefault()
        focusAi()
      }
      if (mod && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void useApp.getState().createWorksheet()
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const s = useApp.getState()
        s.setPrefs({ leftPanel: s.leftPanel ? null : 'worksheets' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const panelIds = ['left', 'main', 'ai'].filter((p) => (p === 'left' ? !!leftPanel : p === 'ai' ? aiOpen : true))
  const layout = useDefaultLayout({ id: 'lumen-main', panelIds, storage: localStorage })

  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Logo size={40} />
        <div className="text-[15px] font-semibold">Can't reach the Lumen server</div>
        <div className="max-w-md text-[13px] text-muted">{error}. Start it with <code className="mono">pnpm dev</code>.</div>
      </div>
    )
  if (!loaded)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
    )

  return (
    <div className="app-glow flex h-full">
      <Rail />
      <Group orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged} className="min-w-0 flex-1">
        {leftPanel && (
          <>
            <Panel id="left" defaultSize={280} minSize={200} maxSize={520} className="bg-panel">
              {leftPanel === 'worksheets' && <WorksheetsPanel />}
              {leftPanel === 'data' && <DataExplorer />}
              {leftPanel === 'history' && <HistoryPanel />}
            </Panel>
            <Separator className="w-px" />
          </>
        )}
        <Panel id="main" minSize={420}>
          <div className="flex h-full min-w-0 flex-col">
            <TabBar />
            <div className="min-h-0 flex-1 bg-panel">{activeTabId ? <WorksheetView worksheetId={activeTabId} /> : <NoTabs />}</div>
          </div>
        </Panel>
        {aiOpen && (
          <>
            <Separator className="w-px" />
            <Panel id="ai" defaultSize={400} minSize={320} maxSize={760}>
              <AiPanel />
            </Panel>
          </>
        )}
      </Group>

      <ConnectionDialog />
      <SettingsDialog />
      <ConfirmDialog />
      <CommandPalette />
      <Toaster theme={theme} position="bottom-right" toastOptions={{ style: { background: 'var(--c-raised)', border: '1px solid var(--c-line-strong)', color: 'var(--c-fg)' } }} />
    </div>
  )
}

function NoTabs() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Logo size={44} />
      <div className="text-center">
        <div className="text-[15px] font-semibold">No worksheet open</div>
        <div className="mt-1 text-[12.5px] text-muted">Pick one from the sidebar or start fresh.</div>
      </div>
      <Button variant="primary" icon={<FilePlus2 size={14} />} onClick={() => useApp.getState().createWorksheet()}>
        New worksheet
      </Button>
    </div>
  )
}
