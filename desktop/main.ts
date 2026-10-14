import { app, BrowserWindow, Menu, nativeImage, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Fixed port so the page origin (and its localStorage) is stable across launches; 7431 is the web version's. */
const PREFERRED_PORT = 7432
/** `pnpm dev:desktop` points the window at Vite and uses the separately running dev API instead of an embedded one. */
const DEV_URL = process.env.LUMEN_DEV_URL

app.setName('Lumen SQL')

if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | undefined
let server: { port: number; close: () => void } | undefined

async function startEmbeddedServer() {
  // the store reads LUMEN_DATA_DIR when it loads, so set it before importing the server
  process.env.LUMEN_DATA_DIR ??= join(app.getPath('userData'), 'data')
  const { startServer } = await import('../server/index.ts')
  const opts = { hostname: '127.0.0.1', staticDir: join(__dirname, 'ui') }
  try {
    return await startServer({ ...opts, port: PREFERRED_PORT })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e
    return startServer({ ...opts, port: 0 })
  }
}

// ── window state ───────────────────────────────────────────────────────────

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

const stateFile = () => join(app.getPath('userData'), 'window.json')

function loadState(): WindowState {
  const fallback = { width: 1440, height: 900 }
  try {
    const s = JSON.parse(readFileSync(stateFile(), 'utf8')) as WindowState
    // drop the position if it's on a monitor that's no longer connected
    if (s.x != null && s.y != null) {
      const visible = screen.getAllDisplays().some(({ workArea: a }) => s.x! >= a.x && s.y! >= a.y && s.x! < a.x + a.width && s.y! < a.y + a.height)
      if (!visible) delete s.x, delete s.y
    }
    return { ...fallback, ...s }
  } catch {
    return fallback
  }
}

function saveState(w: BrowserWindow) {
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...w.getNormalBounds(), maximized: w.isMaximized() }))
  } catch {}
}

// ── window ─────────────────────────────────────────────────────────────────

function iconPath() {
  return [join(__dirname, 'icon.png'), join(__dirname, '../desktop/icon.png')].find(existsSync)
}

async function createWindow(url: string) {
  const state = loadState()
  const icon = iconPath()
  win = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 560,
    title: 'Lumen SQL',
    icon: icon ? nativeImage.createFromPath(icon) : undefined,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', () => win && saveState(win))
  win.on('closed', () => (win = undefined))

  const origin = new URL(url).origin
  // links to other sites open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, target) => {
    if (new URL(target).origin === origin) return
    e.preventDefault()
    if (/^https?:/.test(target)) shell.openExternal(target)
  })

  // in dev, Vite may still be starting
  for (let attempt = 0; ; attempt++) {
    try {
      await win.loadURL(url)
      return
    } catch (e) {
      if (!DEV_URL || attempt > 40 || !win) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

/** Kept small on purpose: no Ctrl+W or Ctrl+R, so a stray shortcut can't close or reload the app mid-query. */
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: 'File', submenu: [{ role: 'quit' }] },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'F5', click: () => win?.webContents.reload() },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Open data folder', click: () => shell.openPath(process.env.LUMEN_DATA_DIR ?? app.getPath('userData')) },
          { label: 'Toggle developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win?.webContents.toggleDevTools() },
        ],
      },
    ]),
  )
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => server?.close())

app.whenReady().then(async () => {
  buildMenu()
  try {
    let url = DEV_URL
    if (!url) {
      server = await startEmbeddedServer()
      url = `http://127.0.0.1:${server.port}`
    }
    await createWindow(url)
  } catch (e) {
    const { dialog } = await import('electron')
    dialog.showErrorBox('Lumen SQL failed to start', (e as Error).stack ?? String(e))
    app.quit()
  }
})
