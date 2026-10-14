import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { nanoid } from 'nanoid'
import type { CatalogTable, Connection, DatabaseInfo, StatementResult } from '../../shared/types.ts'
import { returnsRows } from '../../shared/sql.ts'
import { normalizeValue, StatementError, type Driver, type ExecContext } from './common.ts'

interface CompactResult {
  meta: { name: string; type: string }[]
  data: unknown[][]
  rows: number
  statistics?: { elapsed: number; rows_read: number; bytes_read: number }
}

export class ClickhouseDriver implements Driver {
  /** The HTTP interface has no session-free USE, so keep one client per default database. */
  private clients = new Map<string, ClickHouseClient>()

  constructor(private conn: Connection) {}

  private client(database?: string): ClickHouseClient {
    const key = database || this.conn.config.database || 'default'
    let cl = this.clients.get(key)
    if (cl) return cl
    const c = this.conn.config
    const host = (c.host || 'localhost').replace(/^https?:\/\//, '').replace(/\/$/, '')
    const port = c.port || (c.ssl ? 8443 : 8123)
    cl = createClient({
      url: `${c.ssl ? 'https' : 'http'}://${host}:${port}`,
      username: c.user || 'default',
      password: c.password || '',
      database: key,
      application: 'lumen-sql',
      request_timeout: 30 * 60_000,
      // readonly=2: server rejects writes but still lets us tune per-query settings
      clickhouse_settings: this.conn.readOnly ? { readonly: '2' } : {},
    })
    this.clients.set(key, cl)
    return cl
  }

  async test() {
    try {
      const rs = await this.client().query({ query: 'SELECT version() AS v', format: 'JSONEachRow' })
      const rows = (await rs.json()) as { v: string }[]
      return `ClickHouse ${rows[0]?.v ?? ''}`
    } catch (e) {
      const msg = (e as Error).message
      // the server took the TCP connection but never answered HTTP: wrong host/port/protocol, not bad credentials
      if (/socket hang up|ECONNRESET|EPROTO|Timeout error|wrong version number/i.test(msg))
        throw new Error(
          `${msg}: the server accepted the connection but didn't answer as ClickHouse's HTTP interface. ` +
            `Check that the host is the ClickHouse server itself (not a web UI or load balancer), the port is the HTTP port ` +
            `(8123, or 8443 with HTTPS, never the native 9000), and the HTTPS toggle matches the port.`,
        )
      throw e
    }
  }

  async runBatch(statements: string[], ctx: ExecContext, onResult?: (r: StatementResult) => void) {
    const results: StatementResult[] = []
    const client = this.client(ctx.database)
    for (let i = 0; i < statements.length; i++) {
      if (ctx.signal.aborted) throw new StatementError('Query cancelled', i, results)
      const sql = statements[i].replace(/;\s*$/, '')
      const queryId = nanoid()
      const onAbort = () => {
        this.client()
          .command({ query: `KILL QUERY WHERE query_id = {id:String} ASYNC`, query_params: { id: queryId } })
          .catch(() => {})
      }
      ctx.signal.addEventListener('abort', onAbort)
      const t0 = performance.now()
      try {
        let r: StatementResult
        if (returnsRows(sql, 'clickhouse') && !/\bFORMAT\s+\w+\s*$/i.test(sql)) {
          const rs = await client.query({
            query: sql,
            format: 'JSONCompact',
            query_id: queryId,
            abort_signal: ctx.signal,
            clickhouse_settings: {
              max_result_rows: String(ctx.maxRows + 1),
              result_overflow_mode: 'break',
            },
          })
          const json = (await rs.json()) as unknown as CompactResult
          const truncated = json.data.length > ctx.maxRows
          r = {
            statement: sql,
            kind: 'rows',
            columns: json.meta.map((m) => ({ name: m.name, type: m.type })),
            rows: json.data.slice(0, ctx.maxRows).map((row) => row.map(normalizeValue)),
            rowCount: json.rows,
            truncated,
            elapsedMs: Math.round(performance.now() - t0),
            queryId,
            message: json.statistics
              ? `${json.statistics.rows_read.toLocaleString()} rows read · ${formatBytes(json.statistics.bytes_read)}`
              : undefined,
          }
        } else {
          const res = await client.command({ query: sql, query_id: queryId, abort_signal: ctx.signal })
          const written = Number(res.summary?.written_rows ?? 0)
          r = {
            statement: sql,
            kind: 'command',
            columns: [],
            rows: [],
            rowCount: 0,
            truncated: false,
            affectedRows: written,
            elapsedMs: Math.round(performance.now() - t0),
            queryId,
            message: written ? `${written.toLocaleString()} row(s) written` : 'Statement executed',
          }
        }
        results.push(r)
        onResult?.(r)
      } catch (e) {
        throw new StatementError(ctx.signal.aborted ? 'Query cancelled' : cleanError(e), i, results)
      } finally {
        ctx.signal.removeEventListener('abort', onAbort)
      }
    }
    return results
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const rs = await this.client().query({
      query: `SELECT name FROM system.databases WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema') ORDER BY name = 'system', name`,
      format: 'JSONEachRow',
    })
    return ((await rs.json()) as { name: string }[]).map((r) => ({ name: r.name }))
  }

  async catalog(database: string): Promise<CatalogTable[]> {
    const client = this.client()
    const [tables, cols] = await Promise.all([
      client
        .query({
          query: `SELECT name, engine, total_rows, comment FROM system.tables WHERE database = {db:String} ORDER BY name`,
          query_params: { db: database },
          format: 'JSONEachRow',
        })
        .then((r) => r.json() as Promise<{ name: string; engine: string; total_rows: string | null; comment: string }[]>),
      client
        .query({
          query: `SELECT table, name, type FROM system.columns WHERE database = {db:String} ORDER BY table, position`,
          query_params: { db: database },
          format: 'JSONEachRow',
        })
        .then((r) => r.json() as Promise<{ table: string; name: string; type: string }[]>),
    ])
    const byTable = new Map<string, { name: string; type: string }[]>()
    for (const c of cols) {
      const list = byTable.get(c.table) ?? []
      list.push({ name: c.name, type: c.type })
      byTable.set(c.table, list)
    }
    return tables.map((t) => ({
      database,
      name: t.name,
      kind: /View/i.test(t.engine) ? 'view' : 'table',
      rows: t.total_rows == null ? undefined : Number(t.total_rows),
      comment: t.comment || undefined,
      columns: byTable.get(t.name) ?? [],
    }))
  }

  async close() {
    await Promise.all([...this.clients.values()].map((c) => c.close()))
    this.clients.clear()
  }
}

function cleanError(e: unknown): string {
  const msg = (e as Error).message ?? String(e)
  // ClickHouse appends a long stack trace / version suffix to messages
  return msg.replace(/\s*\(version [^)]*\)\s*$/, '').replace(/Stack trace:[\s\S]*$/, '').trim()
}

function formatBytes(b: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024
    i++
  }
  return `${b.toFixed(i ? 1 : 0)} ${units[i]}`
}
