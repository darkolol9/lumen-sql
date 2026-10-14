import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import type { AiContext, AiMessage, Connection, EditRequest, Settings, Worksheet } from '../shared/types.ts'
import { listModels, runAgent } from './ai.ts'
import { catalog, databases, invalidateConnection } from './catalog.ts'
import { cancelRun, createDriver, driverFor, evictDriver, requireConnection, runSql, StatementError } from './drivers/index.ts'
import * as store from './store.ts'

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

app.get('/api/bootstrap', (c) =>
  c.json({
    connections: store.listConnections(),
    workspaces: store.listWorkspaces(),
    worksheets: store.listWorksheets(),
    settings: store.publicSettings(),
  }),
)

// ── connections ────────────────────────────────────────────────────────────

app.post('/api/connections', async (c) => {
  const body = await c.req.json<Connection>()
  const saved = store.saveConnection(body)
  await evictDriver(saved.id)
  invalidateConnection(saved.id)
  return c.json(saved)
})

app.delete('/api/connections/:id', async (c) => {
  const id = c.req.param('id')
  store.deleteConnection(id)
  await evictDriver(id)
  invalidateConnection(id)
  return c.json({ ok: true })
})

app.post('/api/connections/test', async (c) => {
  const body = await c.req.json<Connection>()
  const existing = body.id ? store.getConnection(body.id) : undefined
  // masked secrets in the form fall back to the stored ones
  const conn = store.resolveSecrets({ ...body, id: body.id ?? 'test' }, existing)
  const driver = createDriver(conn)
  const t0 = Date.now()
  try {
    const version = await driver.test()
    return c.json({ ok: true, version, elapsedMs: Date.now() - t0 })
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message })
  } finally {
    driver.close().catch(() => {})
  }
})

app.get('/api/connections/:id/databases', async (c) => {
  return c.json(await databases(c.req.param('id'), c.req.query('refresh') === '1'))
})

app.get('/api/connections/:id/catalog', async (c) => {
  const db = c.req.query('database')
  if (!db) return c.json({ error: 'database is required' }, 400)
  return c.json(await catalog(c.req.param('id'), db, c.req.query('refresh') === '1'))
})

// ── in-place row edits ─────────────────────────────────────────────────────
// The client sends structured edits, never SQL: preview and apply build the statements the same way,
// so what the user confirms is exactly what runs.

app.post('/api/edits/preview', async (c) => {
  const body = await c.req.json<EditRequest>()
  const driver = driverFor(requireConnection(body.connectionId))
  if (!driver.buildEdits) return c.json({ error: 'Editing is not supported for this connection type' }, 400)
  try {
    return c.json({ statements: await driver.buildEdits(body.target, body.edits) })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.post('/api/edits/apply', async (c) => {
  const body = await c.req.json<EditRequest & { worksheetId?: string }>()
  const conn = requireConnection(body.connectionId)
  const driver = driverFor(conn)
  if (!driver.applyEdits) return c.json({ error: 'Editing is not supported for this connection type' }, 400)
  if (conn.readOnly) return c.json({ error: 'This connection is read-only' }, 400)
  const t0 = Date.now()
  try {
    const statements = await driver.applyEdits(body.target, body.edits)
    store.addHistory({ connectionId: conn.id, worksheetId: body.worksheetId, sql: statements.join(';\n') + ';', ok: true, elapsedMs: Date.now() - t0, source: 'user' })
    return c.json({ statements, elapsedMs: Date.now() - t0 })
  } catch (e) {
    const message = (e as Error).message
    const sql = await driver.buildEdits?.(body.target, body.edits).catch(() => [])
    if (sql?.length) store.addHistory({ connectionId: conn.id, worksheetId: body.worksheetId, sql: sql.join(';\n') + ';', ok: false, error: message, elapsedMs: Date.now() - t0, source: 'user' })
    return c.json({ error: message }, 400)
  }
})

// ── query execution ────────────────────────────────────────────────────────

app.post('/api/query', async (c) => {
  const body = await c.req.json<{
    connectionId: string
    sql: string
    database?: string
    schema?: string
    runId?: string
    worksheetId?: string
  }>()
  const runId = body.runId ?? nanoid()
  const settings = store.getSettings()
  const t0 = Date.now()
  requireConnection(body.connectionId)
  try {
    const results = await runSql({
      connectionId: body.connectionId,
      sql: body.sql,
      database: body.database,
      schema: body.schema,
      maxRows: settings.maxRows,
      runId,
      sessionKey: body.worksheetId ?? 'default',
    })
    const last = results.at(-1)
    store.addHistory({
      connectionId: body.connectionId,
      worksheetId: body.worksheetId,
      sql: body.sql,
      ok: true,
      rowCount: last?.rowCount,
      elapsedMs: Date.now() - t0,
      source: 'user',
    })
    if (results.some((r) => r.kind === 'command' || /^\s*(create|drop|alter|rename)/i.test(r.statement))) invalidateConnection(body.connectionId)
    return c.json({ runId, results, elapsedMs: Date.now() - t0 })
  } catch (e) {
    const err = e instanceof StatementError ? e : new StatementError((e as Error).message, 0, [])
    store.addHistory({
      connectionId: body.connectionId,
      worksheetId: body.worksheetId,
      sql: body.sql,
      ok: false,
      error: err.message,
      elapsedMs: Date.now() - t0,
      source: 'user',
    })
    return c.json({
      runId,
      results: err.results,
      elapsedMs: Date.now() - t0,
      error: { message: err.message, statementIndex: err.index, statement: '' },
    })
  }
})

app.post('/api/query/:runId/cancel', (c) => c.json({ cancelled: cancelRun(c.req.param('runId')) }))

// ── workspaces / worksheets ────────────────────────────────────────────────

app.post('/api/workspaces', async (c) => c.json(store.saveWorkspace(await c.req.json())))
app.delete('/api/workspaces/:id', (c) => {
  store.deleteWorkspace(c.req.param('id'))
  return c.json({ ok: true })
})
app.post('/api/worksheets', async (c) => c.json(store.saveWorksheet(await c.req.json<Worksheet>())))
app.delete('/api/worksheets/:id', (c) => {
  store.deleteWorksheet(c.req.param('id'))
  return c.json({ ok: true })
})

// ── settings & history ─────────────────────────────────────────────────────

app.get('/api/settings', (c) => c.json(store.publicSettings()))
app.put('/api/settings', async (c) => c.json(store.updateSettings(await c.req.json<Partial<Settings>>())))
app.get('/api/history', (c) => c.json(store.listHistory()))
app.delete('/api/history', (c) => {
  store.clearHistory()
  return c.json({ ok: true })
})

// ── AI ─────────────────────────────────────────────────────────────────────

app.get('/api/ai/models', async (c) => c.json(await listModels()))

app.post('/api/ai/chat', async (c) => {
  const body = await c.req.json<{ messages: AiMessage[]; context: AiContext; model?: string }>()
  return streamSSE(c, async (stream) => {
    const ac = new AbortController()
    stream.onAbort(() => ac.abort())
    try {
      for await (const ev of runAgent({ ...body, signal: ac.signal })) {
        await stream.writeSSE({ data: JSON.stringify(ev) })
      }
    } catch (e) {
      if (!ac.signal.aborted) await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: (e as Error).message }) })
    }
  })
})

// ── startup ────────────────────────────────────────────────────────────────

export interface ServerOptions {
  port: number
  hostname: string
  /** Built UI to serve alongside the API (production and desktop). */
  staticDir?: string
}

/** Starts the HTTP server and resolves with the port it actually bound (port 0 picks a free one). */
export function startServer({ port, hostname, staticDir }: ServerOptions) {
  if (staticDir && existsSync(staticDir)) {
    app.use('/*', serveStatic({ root: staticDir }))
    app.get('*', serveStatic({ path: join(staticDir, 'index.html') }))
  }
  return new Promise<{ port: number; close: () => void }>((done, fail) => {
    const server = serve({ fetch: app.fetch, port, hostname }, (info) =>
      done({
        port: info.port,
        close: () => {
          store.flush()
          server.close()
        },
      }),
    )
    server.once('error', fail)
  })
}

export const flushStore = store.flush
