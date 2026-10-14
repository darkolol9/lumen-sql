import type { CatalogTable, DatabaseInfo, EditTarget, RowEdit, StatementResult } from '../../shared/types.ts'

export interface ExecContext {
  database?: string
  schema?: string
  maxRows: number
  signal: AbortSignal
  /** Drivers with stateful sessions (Snowflake) keep one session per key, e.g. per worksheet. */
  sessionKey: string
}

export interface Driver {
  test(): Promise<string>
  /** Runs statements in order on one session; throws StatementError on the first failure. */
  runBatch(statements: string[], ctx: ExecContext, onResult?: (r: StatementResult) => void): Promise<StatementResult[]>
  listDatabases(): Promise<DatabaseInfo[]>
  catalog(database: string): Promise<CatalogTable[]>
  /** In-place row editing, for drivers that support it: builds the UPDATE statements shown to the user. */
  buildEdits?(target: EditTarget, edits: RowEdit[]): Promise<string[]>
  /** Runs buildEdits' statements in one transaction; rolls back unless each one matches exactly one row. */
  applyEdits?(target: EditTarget, edits: RowEdit[]): Promise<string[]>
  close(): Promise<void>
}

export class StatementError extends Error {
  constructor(
    message: string,
    public index: number,
    public results: StatementResult[],
  ) {
    super(message)
  }
}

export class ReadOnlyError extends Error {}

/** Makes driver values JSON-safe and compact for the grid. */
export function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString().replace('T', ' ').replace('.000Z', '').replace('Z', '')
  if (Buffer.isBuffer(v)) return v.length <= 64 ? `0x${v.toString('hex')}` : `<binary ${v.length} bytes>`
  if (typeof v === 'object') {
    // Snowflake returns custom date objects with toJSON / toString
    const anyV = v as { toJSON?: () => unknown }
    if (typeof anyV.toJSON === 'function' && !Array.isArray(v)) return anyV.toJSON()
    return v
  }
  return v
}

