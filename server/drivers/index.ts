import type { Connection, StatementResult } from '../../shared/types.ts'
import { StatementError, type Driver } from './common.ts'
import { checkReadOnly, splitStatements } from '../../shared/sql.ts'
import { getConnection } from '../store.ts'
import { MysqlDriver } from './mysql.ts'
import { SnowflakeDriver } from './snowflake.ts'
import { ClickhouseDriver } from './clickhouse.ts'

export * from './common.ts'

const drivers = new Map<string, Driver>()

export function driverFor(conn: Connection): Driver {
  let d = drivers.get(conn.id)
  if (d) return d
  d = createDriver(conn)
  drivers.set(conn.id, d)
  return d
}

export function createDriver(conn: Connection): Driver {
  switch (conn.type) {
    case 'mysql':
      return new MysqlDriver(conn)
    case 'snowflake':
      return new SnowflakeDriver(conn)
    case 'clickhouse':
      return new ClickhouseDriver(conn)
  }
}

export async function evictDriver(id: string) {
  const d = drivers.get(id)
  drivers.delete(id)
  await d?.close().catch(() => {})
}

export function requireConnection(id: string): Connection {
  const conn = getConnection(id)
  if (!conn) throw new Error('Connection not found')
  return conn
}

const running = new Map<string, AbortController>()

export interface RunOptions {
  connectionId: string
  sql: string
  database?: string
  schema?: string
  maxRows: number
  runId: string
  sessionKey: string
  /** Force read-only regardless of the connection setting (used by the AI). */
  forceReadOnly?: boolean
}

export async function runSql(opts: RunOptions): Promise<StatementResult[]> {
  const conn = requireConnection(opts.connectionId)
  const statements = splitStatements(opts.sql, conn.type).map((s) => s.text)
  if (!statements.length) return []

  if (conn.readOnly || opts.forceReadOnly) {
    for (let i = 0; i < statements.length; i++) {
      const g = checkReadOnly(statements[i], conn.type)
      if (!g.ok) {
        throw new StatementError(
          `${g.reason}${opts.forceReadOnly && !conn.readOnly ? ' (AI queries are read-only)' : ''}`,
          i,
          [],
        )
      }
    }
  }

  const ac = new AbortController()
  running.set(opts.runId, ac)
  try {
    return await driverFor(conn).runBatch(statements, {
      database: opts.database,
      schema: opts.schema,
      maxRows: opts.maxRows,
      signal: ac.signal,
      sessionKey: opts.sessionKey,
    })
  } finally {
    running.delete(opts.runId)
  }
}

export function cancelRun(runId: string): boolean {
  const ac = running.get(runId)
  ac?.abort()
  return !!ac
}
