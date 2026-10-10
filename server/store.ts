import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import {
  SECRET_FIELDS,
  SECRET_MASK,
  type Connection,
  type HistoryEntry,
  type PublicSettings,
  type Settings,
  type Workspace,
  type Worksheet,
} from '../shared/types.ts'

const DATA_DIR = resolve(process.env.LUMEN_DATA_DIR ?? join(process.cwd(), 'data'))
const DB_FILE = join(DATA_DIR, 'lumen.json')
const KEY_FILE = join(DATA_DIR, '.secret.key')
const HISTORY_LIMIT = 1000

interface DbShape {
  connections: Connection[]
  workspaces: Workspace[]
  worksheets: Worksheet[]
  settings: Settings
  history: HistoryEntry[]
}

mkdirSync(DATA_DIR, { recursive: true })

function loadKey(): Buffer {
  if (process.env.LUMEN_SECRET) return Buffer.from(process.env.LUMEN_SECRET.padEnd(32, '0').slice(0, 32))
  if (!existsSync(KEY_FILE)) {
    writeFileSync(KEY_FILE, randomBytes(32).toString('base64'))
    try {
      chmodSync(KEY_FILE, 0o600)
    } catch {}
  }
  return Buffer.from(readFileSync(KEY_FILE, 'utf8'), 'base64')
}
const KEY = loadKey()

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `enc:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`
}

export function decrypt(value: string): string {
  if (!value.startsWith('enc:')) return value
  const raw = Buffer.from(value.slice(4), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}

const defaults = (): DbShape => {
  const now = Date.now()
  const ws: Workspace = { id: nanoid(10), name: 'My Workspace', createdAt: now }
  return {
    connections: [],
    workspaces: [ws],
    worksheets: [
      {
        id: nanoid(10),
        workspaceId: ws.id,
        name: 'Untitled',
        sql: '-- Welcome to Lumen ✨\n-- Add a connection from the left rail, then press Ctrl+Enter to run.\n\nSELECT 1 AS hello;\n',
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: { model: 'anthropic/claude-sonnet-5.5', maxRows: 10000, aiAutoRun: true },
    history: [],
  }
}

let db: DbShape = existsSync(DB_FILE) ? { ...defaults(), ...JSON.parse(readFileSync(DB_FILE, 'utf8')) } : defaults()

let saveTimer: NodeJS.Timeout | undefined
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 150)
}
export function flush() {
  clearTimeout(saveTimer)
  const tmp = `${DB_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(db, null, 2))
  renameSync(tmp, DB_FILE)
}
if (!existsSync(DB_FILE)) flush()

// ── connections ────────────────────────────────────────────────────────────

/** Connection with secrets decrypted, for drivers only. Never send to the browser. */
export function getConnection(id: string): Connection | undefined {
  const c = db.connections.find((x) => x.id === id)
  if (!c) return undefined
  const config = { ...c.config }
  for (const f of SECRET_FIELDS) if (config[f]) config[f] = decrypt(config[f] as string)
  return { ...c, config }
}

export function publicConnection(c: Connection): Connection {
  const config = { ...c.config }
  for (const f of SECRET_FIELDS) if (config[f]) config[f] = SECRET_MASK
  return { ...c, config }
}

export const listConnections = () => db.connections.map(publicConnection)

/** Merges incoming config with stored secrets (mask = keep existing), then encrypts. */
export function resolveSecrets(incoming: Connection, existing?: Connection): Connection {
  const config = { ...incoming.config }
  for (const f of SECRET_FIELDS) {
    const v = config[f]
    if (v === SECRET_MASK) config[f] = existing?.config[f] ? decrypt(existing.config[f] as string) : undefined
  }
  return { ...incoming, config }
}

export function saveConnection(input: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Connection {
  const now = Date.now()
  const existing = input.id ? db.connections.find((c) => c.id === input.id) : undefined
  const resolved = resolveSecrets({ ...input, id: input.id ?? nanoid(10), createdAt: existing?.createdAt ?? now, updatedAt: now } as Connection, existing)
  for (const f of SECRET_FIELDS) {
    if (resolved.config[f]) resolved.config[f] = encrypt(resolved.config[f] as string)
    else delete resolved.config[f]
  }
  db.connections = existing ? db.connections.map((c) => (c.id === resolved.id ? resolved : c)) : [...db.connections, resolved]
  persist()
  return publicConnection(resolved)
}

export function deleteConnection(id: string) {
  db.connections = db.connections.filter((c) => c.id !== id)
  db.worksheets = db.worksheets.map((w) => (w.connectionId === id ? { ...w, connectionId: undefined } : w))
  persist()
}

// ── workspaces & worksheets ────────────────────────────────────────────────

export const listWorkspaces = () => db.workspaces
export const listWorksheets = () => db.worksheets

export function saveWorkspace(input: Partial<Workspace> & { name: string }): Workspace {
  const existing = input.id && db.workspaces.find((w) => w.id === input.id)
  if (existing) {
    Object.assign(existing, { name: input.name })
    persist()
    return existing
  }
  const ws: Workspace = { id: nanoid(10), name: input.name, createdAt: Date.now() }
  db.workspaces.push(ws)
  persist()
  return ws
}

export function deleteWorkspace(id: string) {
  db.workspaces = db.workspaces.filter((w) => w.id !== id)
  db.worksheets = db.worksheets.filter((w) => w.workspaceId !== id)
  persist()
}

export function saveWorksheet(input: Partial<Worksheet> & { workspaceId: string }): Worksheet {
  const now = Date.now()
  const existing = input.id ? db.worksheets.find((w) => w.id === input.id) : undefined
  if (existing) {
    Object.assign(existing, input, { updatedAt: now })
    persist()
    return existing
  }
  const ws: Worksheet = { name: 'Untitled', sql: '', ...input, id: input.id ?? nanoid(10), createdAt: now, updatedAt: now }
  db.worksheets.push(ws)
  persist()
  return ws
}

export function deleteWorksheet(id: string) {
  db.worksheets = db.worksheets.filter((w) => w.id !== id)
  persist()
}

// ── settings ───────────────────────────────────────────────────────────────

export const getSettings = (): Settings => ({
  ...db.settings,
  openrouterKey: db.settings.openrouterKey ? decrypt(db.settings.openrouterKey) : undefined,
})

export function publicSettings(): PublicSettings {
  const { openrouterKey, ...rest } = db.settings
  return { ...rest, hasOpenrouterKey: !!openrouterKey }
}

export function updateSettings(patch: Partial<Settings>): PublicSettings {
  const { openrouterKey, ...rest } = patch
  db.settings = { ...db.settings, ...rest }
  if (openrouterKey !== undefined) db.settings.openrouterKey = openrouterKey ? encrypt(openrouterKey) : undefined
  persist()
  return publicSettings()
}

// ── history ────────────────────────────────────────────────────────────────

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'at'>) {
  db.history.unshift({ ...entry, sql: entry.sql.slice(0, 20000), id: nanoid(10), at: Date.now() })
  if (db.history.length > HISTORY_LIMIT) db.history.length = HISTORY_LIMIT
  persist()
}

export const listHistory = (limit = 300) => db.history.slice(0, limit)

export function clearHistory() {
  db.history = []
  persist()
}
