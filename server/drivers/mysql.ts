import mysql from 'mysql2/promise'
import type { FieldPacket, Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise'
import type { CatalogTable, Column, Connection, DatabaseInfo, EditTarget, RowEdit, StatementResult } from '../../shared/types.ts'
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

const BINARY_CHARSET = 63
const T = (mysql as unknown as { Types: Record<string, number> }).Types
const STRINGISH = new Set([T.VARCHAR, T.VAR_STRING, T.STRING, T.TINY_BLOB, T.MEDIUM_BLOB, T.LONG_BLOB, T.BLOB])
/** Values the grid can't send back as a plain literal: binary strings, bits, geometry. */
const isBinaryField = (f: FieldPacket) => {
  const type = f.columnType ?? f.type ?? -1
  return type === T.BIT || type === T.GEOMETRY || (STRINGISH.has(type) && f.characterSet === BINARY_CHARSET)
}
const UNEDITABLE_TYPES = new Set(['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'bit', 'geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection'])
/** Key columns must compare exactly in a WHERE clause. */
const UNKEYABLE_TYPES = new Set([...UNEDITABLE_TYPES, 'float', 'double', 'json'])

interface TableMeta {
  key: string[]
  /** column name -> DATA_TYPE */
  columns: Map<string, string>
  at: number
}
const META_TTL = 60_000

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
              columns: (fields as FieldPacket[]).map((f) => this.column(f)),
              rows,
              rowCount: all.length,
              truncated: all.length > ctx.maxRows,
              elapsedMs,
              editTarget: await this.editTarget(fields as FieldPacket[]).catch(() => undefined),
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

  private column(f: FieldPacket): Column {
    const col: Column = { name: f.name, type: typeNames[f.columnType ?? f.type ?? -1] ?? 'UNKNOWN' }
    if (f.orgTable && f.orgName) {
      col.source = f.orgName
      col.editable = !isBinaryField(f)
    }
    return col
  }

  private meta = new Map<string, TableMeta>()

  private async tableMeta(database: string, table: string): Promise<TableMeta> {
    const k = `${database}.${table}`
    const cached = this.meta.get(k)
    if (cached && Date.now() - cached.at < META_TTL) return cached
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type, k.ORDINAL_POSITION AS keyPos
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
       LEFT JOIN information_schema.KEY_COLUMN_USAGE k
         ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME AND k.CONSTRAINT_NAME = 'PRIMARY'
       WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?`,
      [database, table],
    )
    const meta: TableMeta = {
      key: rows.filter((r) => r.keyPos != null).sort((a, b) => a.keyPos - b.keyPos).map((r) => String(r.name)),
      columns: new Map(rows.map((r) => [String(r.name), String(r.type).toLowerCase()])),
      at: Date.now(),
    }
    this.meta.set(k, meta)
    return meta
  }

  /** A result is editable when every table column comes from one base table and its whole primary key is present. */
  private async editTarget(fields: FieldPacket[]): Promise<EditTarget | undefined> {
    const real = fields.filter((f) => f.orgTable && f.orgName)
    if (!real.length) return
    const { db, table, orgTable } = real[0]
    // same table *and* alias, so a self-join doesn't pass as one table
    if (!db || real.some((f) => f.db !== db || f.orgTable !== orgTable || f.table !== table)) return
    const meta = await this.tableMeta(db, orgTable!)
    if (!meta.key.length) return
    const present = new Set(real.filter((f) => !isBinaryField(f)).map((f) => f.orgName))
    if (meta.key.some((k) => !present.has(k) || UNKEYABLE_TYPES.has(meta.columns.get(k) ?? ''))) return
    return { database: db, table: orgTable!, key: meta.key }
  }

  async buildEdits(target: EditTarget, edits: RowEdit[]): Promise<string[]> {
    const meta = await this.tableMeta(target.database, target.table)
    if (!meta.key.length) throw new Error(`${target.database}.${target.table} has no primary key`)
    if (meta.key.join('\0') !== target.key.join('\0')) throw new Error(`The primary key of ${target.table} has changed; re-run the query`)
    if (!edits.length) throw new Error('No changes to apply')
    return edits.map((e, i) => {
      const changes = Object.entries(e.changes)
      if (!changes.length) throw new Error(`Row ${i + 1} has no changes`)
      for (const [col, v] of changes) {
        const type = meta.columns.get(col)
        if (type === undefined) throw new Error(`Unknown column ${col}`)
        if (UNEDITABLE_TYPES.has(type)) throw new Error(`Column ${col} (${type}) can't be edited here`)
        if (v !== null && typeof v !== 'string') throw new Error(`Bad value for ${col}`)
      }
      for (const k of meta.key) {
        const v = e.key[k]
        if (v === null || v === undefined || typeof v === 'object') throw new Error(`Row ${i + 1} is missing its ${k} key value`)
      }
      const set = changes.map(([col, v]) => mysql.format(`${q(col)} = ?`, [v]))
      const where = meta.key.map((k) => mysql.format(`${q(k)} = ?`, [e.key[k] as string | number]))
      return `UPDATE ${q(target.database)}.${q(target.table)} SET ${set.join(', ')} WHERE ${where.join(' AND ')} LIMIT 1`
    })
  }

  async applyEdits(target: EditTarget, edits: RowEdit[]): Promise<string[]> {
    if (this.conn.readOnly) throw new Error('This connection is read-only')
    const statements = await this.buildEdits(target, edits)
    const c = await this.pool.getConnection()
    try {
      await c.beginTransaction()
      for (let i = 0; i < statements.length; i++) {
        const [h] = await c.query<ResultSetHeader>(statements[i])
        const matched = Number(/Rows matched:\s*(\d+)/.exec(h.info ?? '')?.[1] ?? h.affectedRows)
        if (matched !== 1) throw new Error(`Statement ${i + 1} matched ${matched} rows instead of 1 (the row was changed or deleted since you loaded it). Nothing was saved.`)
        if (h.warningStatus) {
          const [w] = await c.query<mysql.RowDataPacket[]>('SHOW WARNINGS')
          throw new Error(`Statement ${i + 1} raised a warning: ${w.map((x) => x.Message).join('; ')}. Nothing was saved.`)
        }
      }
      await c.commit()
      return statements
    } catch (e) {
      await c.rollback().catch(() => {})
      throw e
    } finally {
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
