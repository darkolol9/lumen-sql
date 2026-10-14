export type DbType = 'mysql' | 'snowflake' | 'clickhouse'

export type SnowflakeAuth = 'password' | 'keypair' | 'pat' | 'sso'

export interface ConnectionConfig {
  // mysql / clickhouse
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
  // snowflake
  account?: string
  warehouse?: string
  role?: string
  schema?: string
  auth?: SnowflakeAuth
  privateKey?: string
  privateKeyPass?: string
  token?: string
}

export const SECRET_FIELDS = ['password', 'privateKey', 'privateKeyPass', 'token'] as const
/** Placeholder sent to the browser in place of a stored secret. */
export const SECRET_MASK = '__unchanged__'

export interface Connection {
  id: string
  name: string
  type: DbType
  color: string
  readOnly: boolean
  config: ConnectionConfig
  createdAt: number
  updatedAt: number
}

export interface Workspace {
  id: string
  name: string
  createdAt: number
}

export interface Worksheet {
  id: string
  workspaceId: string
  name: string
  sql: string
  connectionId?: string
  database?: string
  schema?: string
  createdAt: number
  updatedAt: number
}

export interface Settings {
  openrouterKey?: string
  model: string
  maxRows: number
  aiAutoRun: boolean
}

export interface PublicSettings extends Omit<Settings, 'openrouterKey'> {
  hasOpenrouterKey: boolean
}

export interface HistoryEntry {
  id: string
  worksheetId?: string
  connectionId: string
  sql: string
  ok: boolean
  error?: string
  rowCount?: number
  elapsedMs: number
  at: number
  source: 'user' | 'ai'
}

export interface Column {
  name: string
  type: string
  /** Underlying table column, when this result column maps 1:1 onto one (MySQL only). */
  source?: string
  /** Set when the value can be written back as a plain literal (not binary, not an expression). */
  editable?: boolean
}

/** A result whose rows can be edited in place: one base table, with its full primary key in the result. */
export interface EditTarget {
  database: string
  table: string
  /** Primary key columns of the table, in key order. */
  key: string[]
}

/** One edited row: the original primary key values and the new column values (null = SQL NULL). */
export interface RowEdit {
  key: Record<string, unknown>
  changes: Record<string, string | null>
}

export interface EditRequest {
  connectionId: string
  target: EditTarget
  edits: RowEdit[]
}

export interface StatementResult {
  statement: string
  kind: 'rows' | 'command'
  columns: Column[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  affectedRows?: number
  elapsedMs: number
  queryId?: string
  message?: string
  editTarget?: EditTarget
}

export interface RunResponse {
  runId: string
  results: StatementResult[]
  error?: { message: string; statementIndex: number; statement: string }
  elapsedMs: number
}

export interface CatalogColumn {
  name: string
  type: string
}

export interface CatalogTable {
  database: string
  schema?: string
  name: string
  kind: 'table' | 'view'
  columns: CatalogColumn[]
  rows?: number
  comment?: string
}

export interface DatabaseInfo {
  name: string
  schemas?: string[]
}

/** Server -> client events streamed by the AI agent. */
export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_end'; id: string; ok: boolean; summary: string; data?: unknown }
  | { type: 'editor_edit'; id: string; sql: string; mode: 'replace' | 'insert' | 'replace_selection'; explanation?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: { prompt: number; completion: number } }

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiContext {
  connectionId?: string
  database?: string
  schema?: string
  editorSql: string
  selection?: string
  lastError?: string
  lastResultPreview?: string
}
