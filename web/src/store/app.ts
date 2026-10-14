import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  CatalogTable,
  Connection,
  DatabaseInfo,
  PublicSettings,
  RunResponse,
  Settings,
  StatementResult,
  Workspace,
  Worksheet,
} from '../../../shared/types'
import { api } from '../lib/api'
import { DEFAULT_THEME, themeById } from '../lib/themes'

export type LeftPanel = 'worksheets' | 'data' | 'connections' | 'history' | null

export interface RunState {
  running: boolean
  runId?: string
  startedAt?: number
  results: StatementResult[]
  error?: RunResponse['error']
  activeResult: number
  elapsedMs?: number
  /** Offset in the editor where the executed SQL began (for error highlighting). */
  offset?: number
  sql?: string
  /** Connection the results came from; row edits must go back to it, even if the worksheet has switched since. */
  connectionId?: string
}

export interface PendingEdit {
  id: string
  sql: string
  mode: 'replace' | 'insert' | 'replace_selection'
  explanation?: string
  /** Full editor text before / after applying the edit, for the diff view. */
  original: string
  proposed: string
}

type Loadable<T> = { status: 'loading' | 'ready' | 'error'; data?: T; error?: string }

interface UiPrefs {
  activeWorkspaceId?: string
  openTabs: string[]
  activeTabId?: string
  leftPanel: LeftPanel
  aiOpen: boolean
  /** Theme id from the registry in lib/themes.ts */
  theme: string
}

const PREFS_KEY = 'lumen.ui'
const loadPrefs = (): UiPrefs => {
  try {
    const p: UiPrefs = { openTabs: [], leftPanel: 'worksheets', aiOpen: true, theme: DEFAULT_THEME, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
    return { ...p, theme: themeById(p.theme).id }
  } catch {
    return { openTabs: [], leftPanel: 'worksheets', aiOpen: true, theme: DEFAULT_THEME }
  }
}

interface AppState extends UiPrefs {
  loaded: boolean
  connections: Connection[]
  workspaces: Workspace[]
  worksheets: Record<string, Worksheet>
  settings: PublicSettings
  runs: Record<string, RunState>
  pendingEdits: Record<string, PendingEdit | undefined>
  databases: Record<string, Loadable<DatabaseInfo[]>>
  catalogs: Record<string, Loadable<CatalogTable[]>>
  connectionDialog: { open: boolean; editing?: Connection }
  settingsOpen: boolean
  paletteOpen: boolean
  /** Theme shown while hovering a theme picker, without saving it. */
  themePreview?: string
  confirm?: { title: string; body: string; action: string; resolve: (ok: boolean) => void }

  bootstrap(): Promise<void>
  setPrefs(p: Partial<UiPrefs>): void

  createWorksheet(opts?: Partial<Worksheet>): Promise<Worksheet>
  openWorksheet(id: string): void
  closeTab(id: string): void
  updateWorksheet(id: string, patch: Partial<Worksheet>): void
  deleteWorksheet(id: string): Promise<void>
  duplicateWorksheet(id: string): Promise<void>

  createWorkspace(name: string): Promise<void>
  renameWorkspace(id: string, name: string): Promise<void>
  deleteWorkspace(id: string): Promise<void>

  saveConnection(c: Partial<Connection>): Promise<Connection>
  deleteConnection(id: string): Promise<void>
  openConnectionDialog(editing?: Connection): void

  loadDatabases(connectionId: string, refresh?: boolean): Promise<DatabaseInfo[] | undefined>
  loadCatalog(connectionId: string, database: string, refresh?: boolean): Promise<CatalogTable[] | undefined>

  run(worksheetId: string, sql: string, offset?: number): Promise<void>
  cancel(worksheetId: string): Promise<void>
  setActiveResult(worksheetId: string, i: number): void

  setPendingEdit(worksheetId: string, edit?: PendingEdit): void
  updateSettings(patch: Partial<Settings>): Promise<void>
  askConfirm(opts: { title: string; body: string; action: string }): Promise<boolean>
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const catalogKey = (connectionId: string, database: string) => `${connectionId}::${database}`

export const useApp = create<AppState>((set, get) => ({
  ...loadPrefs(),
  loaded: false,
  connections: [],
  workspaces: [],
  worksheets: {},
  settings: { model: '', maxRows: 10000, aiAutoRun: true, hasOpenrouterKey: false },
  runs: {},
  pendingEdits: {},
  databases: {},
  catalogs: {},
  connectionDialog: { open: false },
  settingsOpen: false,
  paletteOpen: false,

  async bootstrap() {
    const data = await api.bootstrap()
    const worksheets = Object.fromEntries(data.worksheets.map((w) => [w.id, w]))
    let { activeWorkspaceId, openTabs, activeTabId } = get()
    if (!data.workspaces.some((w) => w.id === activeWorkspaceId)) activeWorkspaceId = data.workspaces[0]?.id
    openTabs = openTabs.filter((id) => worksheets[id])
    if (!openTabs.length) {
      const first = data.worksheets.find((w) => w.workspaceId === activeWorkspaceId)
      if (first) openTabs = [first.id]
    }
    if (!activeTabId || !openTabs.includes(activeTabId)) activeTabId = openTabs[0]
    set({ ...data, worksheets, activeWorkspaceId, openTabs, activeTabId, loaded: true })
    get().setPrefs({})
  },

  setPrefs(p) {
    set(p)
    const { activeWorkspaceId, openTabs, activeTabId, leftPanel, aiOpen, theme } = get()
    localStorage.setItem(PREFS_KEY, JSON.stringify({ activeWorkspaceId, openTabs, activeTabId, leftPanel, aiOpen, theme }))
  },

  async createWorksheet(opts = {}) {
    const { activeWorkspaceId, activeTabId, worksheets, connections } = get()
    const current = activeTabId ? worksheets[activeTabId] : undefined
    const ws = await api.saveWorksheet({
      workspaceId: opts.workspaceId ?? activeWorkspaceId!,
      name: opts.name ?? `Worksheet ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      sql: opts.sql ?? '',
      // inherit context from the current worksheet, so new tabs "just work"
      connectionId: opts.connectionId ?? current?.connectionId ?? connections[0]?.id,
      database: opts.database ?? current?.database,
      schema: opts.schema ?? current?.schema,
    })
    set((s) => ({ worksheets: { ...s.worksheets, [ws.id]: ws } }))
    get().openWorksheet(ws.id)
    return ws
  },

  openWorksheet(id) {
    const { openTabs, worksheets } = get()
    const ws = worksheets[id]
    get().setPrefs({
      openTabs: openTabs.includes(id) ? openTabs : [...openTabs, id],
      activeTabId: id,
      activeWorkspaceId: ws?.workspaceId ?? get().activeWorkspaceId,
    })
  },

  closeTab(id) {
    const { openTabs, activeTabId } = get()
    const idx = openTabs.indexOf(id)
    const next = openTabs.filter((t) => t !== id)
    get().setPrefs({
      openTabs: next,
      activeTabId: activeTabId === id ? next[Math.min(idx, next.length - 1)] : activeTabId,
    })
  },

  updateWorksheet(id, patch) {
    set((s) => ({ worksheets: { ...s.worksheets, [id]: { ...s.worksheets[id], ...patch, updatedAt: Date.now() } } }))
    clearTimeout(saveTimers.get(id))
    saveTimers.set(
      id,
      setTimeout(() => {
        const ws = get().worksheets[id]
        if (ws) api.saveWorksheet(ws).catch((e) => toast.error(`Autosave failed: ${e.message}`))
      }, 500),
    )
  },

  async deleteWorksheet(id) {
    get().closeTab(id)
    await api.deleteWorksheet(id)
    set((s) => {
      const { [id]: _, ...rest } = s.worksheets
      return { worksheets: rest }
    })
  },

  async duplicateWorksheet(id) {
    const src = get().worksheets[id]
    if (!src) return
    await get().createWorksheet({ ...src, id: undefined, name: `${src.name} (copy)` })
  },

  async createWorkspace(name) {
    const ws = await api.saveWorkspace({ name })
    set((s) => ({ workspaces: [...s.workspaces, ws] }))
    get().setPrefs({ activeWorkspaceId: ws.id })
    await get().createWorksheet({ workspaceId: ws.id, name: 'Untitled' })
  },

  async renameWorkspace(id, name) {
    const ws = await api.saveWorkspace({ id, name })
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? ws : w)) }))
  },

  async deleteWorkspace(id) {
    await api.deleteWorkspace(id)
    const removed = Object.values(get().worksheets).filter((w) => w.workspaceId === id).map((w) => w.id)
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      worksheets: Object.fromEntries(Object.entries(s.worksheets).filter(([k]) => !removed.includes(k))),
    }))
    const { openTabs, activeTabId, workspaces } = get()
    const tabs = openTabs.filter((t) => !removed.includes(t))
    get().setPrefs({
      openTabs: tabs,
      activeTabId: activeTabId && removed.includes(activeTabId) ? tabs[0] : activeTabId,
      activeWorkspaceId: workspaces[0]?.id,
    })
  },

  async saveConnection(c) {
    const saved = await api.saveConnection(c)
    set((s) => ({
      connections: s.connections.some((x) => x.id === saved.id)
        ? s.connections.map((x) => (x.id === saved.id ? saved : x))
        : [...s.connections, saved],
      databases: Object.fromEntries(Object.entries(s.databases).filter(([k]) => k !== saved.id)),
      catalogs: Object.fromEntries(Object.entries(s.catalogs).filter(([k]) => !k.startsWith(`${saved.id}::`))),
    }))
    // first connection: attach it to every worksheet that has none
    for (const ws of Object.values(get().worksheets)) if (!ws.connectionId) get().updateWorksheet(ws.id, { connectionId: saved.id })
    return saved
  },

  async deleteConnection(id) {
    await api.deleteConnection(id)
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      worksheets: Object.fromEntries(
        Object.entries(s.worksheets).map(([k, w]) => [k, w.connectionId === id ? { ...w, connectionId: undefined } : w]),
      ),
    }))
  },

  openConnectionDialog(editing) {
    set({ connectionDialog: { open: true, editing } })
  },

  async loadDatabases(connectionId, refresh = false) {
    const cur = get().databases[connectionId]
    if (cur && !refresh && cur.status !== 'error') return cur.data
    set((s) => ({ databases: { ...s.databases, [connectionId]: { status: 'loading', data: cur?.data } } }))
    try {
      const data = await api.databases(connectionId, refresh)
      set((s) => ({ databases: { ...s.databases, [connectionId]: { status: 'ready', data } } }))
      return data
    } catch (e) {
      set((s) => ({ databases: { ...s.databases, [connectionId]: { status: 'error', error: (e as Error).message } } }))
    }
  },

  async loadCatalog(connectionId, database, refresh = false) {
    const key = catalogKey(connectionId, database)
    const cur = get().catalogs[key]
    if (cur && !refresh && cur.status !== 'error') {
      if (cur.status === 'ready') return cur.data
      // already loading: wait for it
      return new Promise((resolve) => {
        const unsub = useApp.subscribe((s) => {
          const c = s.catalogs[key]
          if (c?.status !== 'loading') {
            unsub()
            resolve(c?.data)
          }
        })
      })
    }
    set((s) => ({ catalogs: { ...s.catalogs, [key]: { status: 'loading', data: cur?.data } } }))
    try {
      const data = await api.catalog(connectionId, database, refresh)
      set((s) => ({ catalogs: { ...s.catalogs, [key]: { status: 'ready', data } } }))
      return data
    } catch (e) {
      set((s) => ({ catalogs: { ...s.catalogs, [key]: { status: 'error', error: (e as Error).message } } }))
    }
  },

  async run(worksheetId, sql, offset = 0) {
    const ws = get().worksheets[worksheetId]
    if (!ws?.connectionId) {
      toast.error('Pick a connection for this worksheet first')
      return
    }
    if (get().runs[worksheetId]?.running) return
    const runId = crypto.randomUUID()
    const patch = (p: Partial<RunState>) =>
      set((s) => ({ runs: { ...s.runs, [worksheetId]: { ...(s.runs[worksheetId] ?? { results: [], activeResult: 0 }), ...p } } }))
    patch({ running: true, runId, startedAt: Date.now(), error: undefined, offset, sql, connectionId: ws.connectionId })
    try {
      const res = await api.run({ connectionId: ws.connectionId, sql, database: ws.database, schema: ws.schema, runId, worksheetId })
      const lastRows = res.results.map((r) => r.kind).lastIndexOf('rows')
      patch({
        running: false,
        results: res.results,
        error: res.error,
        elapsedMs: res.elapsedMs,
        activeResult: res.error ? res.results.length : Math.max(lastRows, 0),
      })
      // USE statements change context; DDL changes the catalog
      const ddl = res.results.some((r) => /^\s*(create|drop|alter|rename)\b/i.test(r.statement))
      if (ddl && ws.database) get().loadCatalog(ws.connectionId, ws.database, true)
    } catch (e) {
      patch({ running: false, results: [], error: { message: (e as Error).message, statementIndex: 0, statement: '' } })
    }
  },

  async cancel(worksheetId) {
    const runId = get().runs[worksheetId]?.runId
    if (runId) await api.cancel(runId).catch(() => {})
  },

  setActiveResult(worksheetId, i) {
    set((s) => ({ runs: { ...s.runs, [worksheetId]: { ...s.runs[worksheetId], activeResult: i } } }))
  },

  setPendingEdit(worksheetId, edit) {
    set((s) => ({ pendingEdits: { ...s.pendingEdits, [worksheetId]: edit } }))
  },

  async updateSettings(patch) {
    const settings = await api.updateSettings(patch)
    set({ settings })
  },

  askConfirm(opts) {
    return new Promise((resolve) => set({ confirm: { ...opts, resolve: (ok) => (set({ confirm: undefined }), resolve(ok)) } }))
  },
}))

export const useActiveWorksheet = () => useApp((s) => (s.activeTabId ? s.worksheets[s.activeTabId] : undefined))
export const connectionById = (id?: string) => (id ? useApp.getState().connections.find((c) => c.id === id) : undefined)
