import mysql from 'mysql2/promise'
import type { FieldPacket, Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise'
import type { CatalogTable, Connection, DatabaseInfo, StatementResult } from '../../shared/types.ts'
import { normalizeValue, StatementError, type Driver, type ExecContext } from './common.ts'

const SYSTEM_DBS = new Set(['mysql', 'performance_schema', 'sys'])

const FRIENDLY: Record<string, string> = {
  LONGLONG: 'BIGINT', LONG: 'INT', INT24: 'MEDIUMINT', SHORT: 'SMALLINT', TINY: 'TINYINT', NEWDECIMAL: 'DECIMAL',
  VAR_STRING: 'VARCHAR', STRING: 'CHAR', BLOB: 'TEXT', TINY_BLOB: 'TINYTEXT', MEDIUM_BLOB: 'MEDIUMTEXT', LONG_BLOB: 'LONGTEXT',
}
const typeNames: Record<number, string> = Object.fromEntries(
  Object.entries((mysql as unknown as { Types: Record<string, number> }).Types ?? {}).map(([k, v]) => [v, FRIENDLY[k] ?? k]),
)

const q = (name: string) => '`' + name.replace(/`/g, '``') + '`'

export class MysqlDriver implements Driver {
  private pool: Pool

  constructor(private conn: Connection) {
    const c = conn.config
    this.pool = mysql.createPool({
      host: c.host || 'localhost',
      port: c.port || 3306,
      user: c.user,
      password: c.password,
      database: c.database || undefined,
      ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 8,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      connectTimeout: 15000,
      enableKeepAlive: true,
    })
    if (conn.readOnly) {
      // Defence in depth: the SQL guard runs first, the server enforces read-only transactions too.
      this.pool.pool.on('connection', (raw) => raw.query('SET SESSION TRANSACTION READ ONLY'))
    }
  }

  async test() {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>('SELECT VERSION() AS v')
    return `MySQL ${rows[0]?.v ?? ''}`
  }

  async runBatch(statements: string[], ctx: ExecContext, onResult?: (r: StatementResult) => void) {
    const results: StatementResult[] = []
    let c: PoolConnection
    try {
      c = await this.pool.getConnection()
    } catch (e) {
      throw new StatementError((e as Error).message, 0, [])
    }
    let killed = false
    const onAbort = async () => {
      killed = true
      try {
        await this.pool.query(`KILL QUERY ${c.threadId}`)
      } catch {}
    }
    ctx.signal.addEventListener('abort', onAbort)
    try {
      if (ctx.database) await c.query(`USE ${q(ctx.database)}`)
      for (let i = 0; i < statements.length; i++) {
        if (ctx.signal.aborted) throw new StatementError('Query cancelled', i, results)
        const sql = statements[i]
        const t0 = performance.now()
        try {
          const [res, fields] = await c.query({ sql, rowsAsArray: true })
          // some interrupted statements (e.g. SLEEP) return normally after KILL QUERY
          if (killed) throw new Error('Query cancelled')
          const elapsedMs = Math.round(performance.now() - t0)
          let r: StatementResult
          if (Array.isArray(res) && fields) {
            const all = res as unknown[][]
            const rows = all.slice(0, ctx.maxRows).map((row) => row.map(normalizeValue))
            r = {
              statement: sql,
              kind: 'rows',
              columns: (fields as FieldPacket[]).map((f) => ({ name: f.name, type: typeNames[f.columnType ?? f.type ?? -1] ?? 'UNKNOWN' })),
              rows,
              rowCount: all.length,
              truncated: all.length > ctx.maxRows,
              elapsedMs,
            }
          } else {
            const h = res as ResultSetHeader
            r = {
              statement: sql,
              kind: 'command',
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: false,
              affectedRows: h.affectedRows,
              elapsedMs,
              message: h.info || `${h.affectedRows ?? 0} row(s) affected`,
            }
          }
          results.push(r)
          onResult?.(r)
        } catch (e) {
          const msg = killed ? 'Query cancelled' : (e as Error).message
          throw new StatementError(msg, i, results)
        }
      }
      return results
    } finally {
      ctx.signal.removeEventListener('abort', onAbort)
      c.release()
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows
      .map((r) => String(Object.values(r)[0]))
      .filter((n) => !SYSTEM_DBS.has(n))
      .sort((a, b) => Number(a === 'information_schema') - Number(b === 'information_schema') || a.localeCompare(b))
      .map((name) => ({ name }))
  }

  async catalog(database: string): Promise<CatalogTable[]> {
    const [tables] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS row_count, TABLE_COMMENT AS comment
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [database],
    )
    const [cols] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS name, COLUMN_TYPE AS type
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    )
    const byTable = new Map<string, { name: string; type: string }[]>()
    for (const c of cols) {
      const list = byTable.get(c.t) ?? []
      list.push({ name: c.name, type: String(c.type) })
      byTable.set(c.t, list)
    }
    return tables.map((t) => ({
      database,
      name: t.name,
      kind: String(t.type).includes('VIEW') ? 'view' : 'table',
      rows: t.row_count == null ? undefined : Number(t.row_count),
      comment: t.comment || undefined,
      columns: byTable.get(t.name) ?? [],
    }))
  }

  async close() {
    await this.pool.end()
  }
}
