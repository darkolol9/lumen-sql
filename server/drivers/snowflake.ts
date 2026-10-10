import snowflake from 'snowflake-sdk'
import type { CatalogTable, Connection, DatabaseInfo, StatementResult } from '../../shared/types.ts'
import { normalizeValue, StatementError, type Driver, type ExecContext } from './common.ts'

snowflake.configure({ logLevel: 'ERROR' })

type SfConn = snowflake.Connection
type SfStatement = snowflake.RowStatement

const qi = (name: string) => `"${name.replace(/"/g, '""')}"`

interface Session {
  conn: Promise<SfConn>
  /** Snowflake sessions are stateful (USE …), so statements on one session are serialized. */
  queue: Promise<unknown>
}

export class SnowflakeDriver implements Driver {
  private sessions = new Map<string, Session>()

  constructor(private conn: Connection) {}

  private connect(): Promise<SfConn> {
    const c = this.conn.config
    const auth = c.auth ?? 'password'
    const opts: snowflake.ConnectionOptions = {
      account: c.account!.replace(/\.snowflakecomputing\.com.*$/, '').replace(/^https?:\/\//, ''),
      username: c.user,
      warehouse: c.warehouse || undefined,
      role: c.role || undefined,
      database: c.database || undefined,
      schema: c.schema || undefined,
      application: 'LumenSQL',
      clientSessionKeepAlive: true,
    }
    if (auth === 'password') opts.password = c.password
    if (auth === 'keypair') Object.assign(opts, { authenticator: 'SNOWFLAKE_JWT', privateKey: c.privateKey, privateKeyPass: c.privateKeyPass || undefined })
    if (auth === 'pat') Object.assign(opts, { authenticator: 'PROGRAMMATIC_ACCESS_TOKEN', token: c.token })
    if (auth === 'sso') Object.assign(opts, { authenticator: 'EXTERNALBROWSER', clientStoreTemporaryCredential: true })
    return snowflake.createConnection(opts).connectAsync()
  }

  private session(key: string): Session {
    // SSO pops a browser window per login, so all worksheets share a single session there.
    const k = this.conn.config.auth === 'sso' ? 'shared' : key
    let s = this.sessions.get(k)
    if (!s) {
      s = { conn: this.connect(), queue: Promise.resolve() }
      s.conn.catch(() => this.sessions.delete(k))
      this.sessions.set(k, s)
    }
    return s
  }

  private withSession<T>(key: string, fn: (c: SfConn) => Promise<T>): Promise<T> {
    const s = this.session(key)
    const run = s.queue.then(() => s.conn).then(fn)
    s.queue = run.catch(() => {})
    return run
  }

  private exec(
    c: SfConn,
    sqlText: string,
    opts: { maxRows?: number; rowMode?: 'array' | 'object'; onStatement?: (s: SfStatement) => void } = {},
  ): Promise<{ stmt: SfStatement; rows: unknown[] }> {
    return new Promise((resolve, reject) => {
      const stmt = c.execute({
        sqlText,
        streamResult: true,
        rowMode: opts.rowMode ?? 'array',
        fetchAsString: ['Date', 'Number'],
        complete: (err, st) => {
          if (err) return reject(err)
          const total = st.getNumRows() ?? 0
          const limit = Math.min(total, opts.maxRows ?? Infinity)
          if (limit <= 0) return resolve({ stmt: st, rows: [] })
          const rows: unknown[] = []
          st.streamRows({ start: 0, end: limit - 1 })
            .on('data', (r: unknown) => rows.push(r))
            .on('error', reject)
            .on('end', () => resolve({ stmt: st, rows }))
        },
      })
      opts.onStatement?.(stmt)
    })
  }

  async test() {
    return this.withSession('meta', async (c) => {
      const { rows } = await this.exec(c, 'SELECT CURRENT_VERSION(), CURRENT_ROLE(), CURRENT_WAREHOUSE()')
      const [v, role, wh] = rows[0] as string[]
      return `Snowflake ${v} · role ${role ?? '—'} · warehouse ${wh ?? 'none'}`
    })
  }

  runBatch(statements: string[], ctx: ExecContext, onResult?: (r: StatementResult) => void) {
    return this.withSession(ctx.sessionKey, async (c) => {
      const results: StatementResult[] = []
      let current: SfStatement | undefined
      const onAbort = () => current?.cancel(() => {})
      ctx.signal.addEventListener('abort', onAbort)
      try {
        try {
          if (ctx.database) await this.exec(c, `USE DATABASE ${qi(ctx.database)}`)
          if (ctx.database && ctx.schema) await this.exec(c, `USE SCHEMA ${qi(ctx.database)}.${qi(ctx.schema)}`)
        } catch (e) {
          throw new StatementError(`Could not set context: ${(e as Error).message}`, 0, results)
        }
        for (let i = 0; i < statements.length; i++) {
          if (ctx.signal.aborted) throw new StatementError('Query cancelled', i, results)
          const sql = statements[i]
          const t0 = performance.now()
          try {
            const { stmt, rows } = await this.exec(c, sql, { maxRows: ctx.maxRows, onStatement: (s) => (current = s) })
            const cols = stmt.getColumns() ?? []
            const total = stmt.getNumRows() ?? rows.length
            const updated = stmt.getNumUpdatedRows()
            const r: StatementResult = {
              statement: sql,
              kind: 'rows',
              columns: cols.map((col) => ({ name: col.getName(), type: describeType(col) })),
              rows: (rows as unknown[][]).map((row) => row.map(normalizeValue)),
              rowCount: total,
              truncated: total > rows.length,
              affectedRows: updated ?? undefined,
              elapsedMs: Math.round(performance.now() - t0),
              queryId: stmt.getQueryId(),
            }
            results.push(r)
            onResult?.(r)
          } catch (e) {
            throw new StatementError(ctx.signal.aborted ? 'Query cancelled' : (e as Error).message, i, results)
          }
        }
        return results
      } finally {
        ctx.signal.removeEventListener('abort', onAbort)
      }
    })
  }

  listDatabases(): Promise<DatabaseInfo[]> {
    return this.withSession('meta', async (c) => {
      const { rows } = await this.exec(c, 'SHOW TERSE DATABASES', { rowMode: 'object' })
      return (rows as { name: string }[]).map((r) => ({ name: r.name })).sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  catalog(database: string): Promise<CatalogTable[]> {
    return this.withSession('meta', async (c) => {
      const db = qi(database)
      try {
        const [{ rows: tables }, { rows: cols }] = [
          await this.exec(
            c,
            `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ROW_COUNT, COMMENT FROM ${db}.INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA' ORDER BY TABLE_SCHEMA, TABLE_NAME`,
            { rowMode: 'object' },
          ),
          await this.exec(
            c,
            `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ${db}.INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA' ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
            { rowMode: 'object' },
          ),
        ]
        const byTable = new Map<string, { name: string; type: string }[]>()
        for (const col of cols as Record<string, string>[]) {
          const k = `${col.TABLE_SCHEMA}.${col.TABLE_NAME}`
          const list = byTable.get(k) ?? []
          list.push({ name: col.COLUMN_NAME, type: col.DATA_TYPE })
          byTable.set(k, list)
        }
        return (tables as Record<string, string>[]).map((t) => ({
          database,
          schema: t.TABLE_SCHEMA,
          name: t.TABLE_NAME,
          kind: /VIEW/.test(t.TABLE_TYPE) ? 'view' : 'table',
          rows: t.ROW_COUNT == null ? undefined : Number(t.ROW_COUNT),
          comment: t.COMMENT || undefined,
          columns: byTable.get(`${t.TABLE_SCHEMA}.${t.TABLE_NAME}`) ?? [],
        }))
      } catch {
        // No warehouse available: SHOW commands run on cloud services only.
        const { rows: objs } = await this.exec(c, `SHOW TERSE OBJECTS IN DATABASE ${db}`, { rowMode: 'object' })
        const { rows: cols } = await this.exec(c, `SHOW COLUMNS IN DATABASE ${db}`, { rowMode: 'object' })
        const byTable = new Map<string, { name: string; type: string }[]>()
        for (const col of cols as Record<string, string>[]) {
          const k = `${col.schema_name}.${col.table_name}`
          let type = col.data_type
          try {
            type = JSON.parse(col.data_type).type
          } catch {}
          const list = byTable.get(k) ?? []
          list.push({ name: col.column_name, type })
          byTable.set(k, list)
        }
        return (objs as Record<string, string>[])
          .filter((o) => o.schema_name !== 'INFORMATION_SCHEMA')
          .map((o) => ({
            database,
            schema: o.schema_name,
            name: o.name,
            kind: /VIEW/.test(o.kind) ? ('view' as const) : ('table' as const),
            columns: byTable.get(`${o.schema_name}.${o.name}`) ?? [],
          }))
      }
    })
  }

  async close() {
    const conns = [...this.sessions.values()].map((s) => s.conn)
    this.sessions.clear()
    await Promise.all(
      conns.map((p) => p.then((c) => new Promise<void>((res) => c.destroy(() => res()))).catch(() => {})),
    )
  }
}

function describeType(col: snowflake.Column): string {
  const t = col.getType().toUpperCase()
  if (t === 'FIXED') return col.getScale() ? `NUMBER(${col.getPrecision()},${col.getScale()})` : 'NUMBER'
  return t
}
