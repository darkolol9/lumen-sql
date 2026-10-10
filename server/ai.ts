import { nanoid } from 'nanoid'
import type { AiContext, AiEvent, AiMessage, Connection, StatementResult } from '../shared/types.ts'
import { catalog, databases, findTable } from './catalog.ts'
import { requireConnection, runSql, StatementError } from './drivers/index.ts'
import { addHistory, getSettings } from './store.ts'

const OPENROUTER = process.env.LUMEN_OPENROUTER_URL ?? 'https://openrouter.ai/api/v1'
const MAX_STEPS = 16
const TOOL_OUTPUT_LIMIT = 8000

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

const DIALECT_NOTES: Record<Connection['type'], string> = {
  mysql: 'MySQL 8 dialect. Quote identifiers with backticks. Use LIMIT for row caps. Date funcs: DATE_FORMAT, DATE_SUB, NOW().',
  snowflake:
    'Snowflake dialect. Unquoted identifiers resolve to UPPERCASE; quote with double quotes only when needed. Use LIMIT or TOP. ' +
    'Semi-structured: col:path::type, FLATTEN, PARSE_JSON. Date funcs: DATEADD, DATEDIFF, DATE_TRUNC, CURRENT_TIMESTAMP(). QUALIFY is supported.',
  clickhouse:
    'ClickHouse dialect. Quote identifiers with backticks. Prefer specialized aggregates (uniq, quantile, countIf, sumIf, argMax). ' +
    'Date funcs: toStartOfDay, toDate, now(), INTERVAL. Use FINAL only when needed. LIMIT BY is available.',
}

function tools(autoRun: boolean) {
  const defs = [
    {
      name: 'list_databases',
      description: 'List databases available on the active connection.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'list_tables',
      description: 'List tables and views in a database (and optionally a schema), with row counts and column counts.',
      parameters: {
        type: 'object',
        properties: {
          database: { type: 'string', description: 'Database name. Defaults to the worksheet database.' },
          schema: { type: 'string', description: 'Snowflake schema filter (optional).' },
        },
      },
    },
    {
      name: 'describe_table',
      description: 'Get the columns and types of a table. Accepts qualified names like db.table or db.schema.table.',
      parameters: {
        type: 'object',
        properties: { table: { type: 'string' }, database: { type: 'string' }, schema: { type: 'string' } },
        required: ['table'],
      },
    },
    {
      name: 'search_schema',
      description: 'Search table and column names (case-insensitive substring) in a database. Use to discover where data lives.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Substring, or several separated by |' }, database: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'run_query',
      description:
        'Execute a READ-ONLY SQL query and see up to 50 rows. Use it to sample data, check value formats, validate a query before handing it to the user, or answer questions. Writes are rejected.',
      parameters: {
        type: 'object',
        properties: { sql: { type: 'string' }, purpose: { type: 'string', description: 'One short line on why you run it.' } },
        required: ['sql'],
      },
    },
    {
      name: 'write_to_editor',
      description:
        "Propose SQL for the user's worksheet editor. The user sees a diff and accepts or rejects it. Use for the final query the user asked for, including any write statements (which you cannot run yourself).",
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'Complete, formatted SQL.' },
          mode: {
            type: 'string',
            enum: ['replace', 'insert', 'replace_selection'],
            description: 'replace = whole editor, insert = at cursor, replace_selection = replace the selected text',
          },
          explanation: { type: 'string', description: 'One sentence summary of the change.' },
        },
        required: ['sql', 'mode'],
      },
    },
  ]
  return defs
    .filter((d) => autoRun || d.name !== 'run_query')
    .map((d) => ({ type: 'function' as const, function: d }))
}

function systemPrompt(conn: Connection | undefined, ctx: AiContext, autoRun: boolean) {
  const lines = [
    'You are Lumen, an expert data engineer embedded in a SQL editor. You help users explore their data, write, fix, explain and optimize SQL.',
    '',
    '## How you work',
    '- Never guess table or column names. Discover them with list_tables / search_schema / describe_table first.',
    autoRun
      ? '- Validate non-trivial queries with run_query (add a LIMIT) before proposing them. If it errors, fix it and retry.'
      : '- You cannot execute queries in this session; reason carefully from the schema.',
    '- When the user wants a query, deliver it with write_to_editor (they review a diff). Do not also paste the same SQL in your reply.',
    '- When the user asks a question about the data, answer it directly with concrete numbers from run_query.',
    '- Be concise. Use markdown. Short paragraphs, bullet points, and tables for small result summaries.',
    '- Write clean, idiomatic, readable SQL: uppercase keywords, one clause per line, meaningful aliases, CTEs over deep nesting.',
  ]
  if (conn) {
    lines.push(
      '',
      '## Active connection',
      `- Name: ${conn.name} (${conn.type}${conn.readOnly ? ', READ-ONLY connection — the user cannot run writes either' : ''})`,
      `- Worksheet context: database=${ctx.database ?? '(none)'}${conn.type === 'snowflake' ? `, schema=${ctx.schema ?? '(none)'}` : ''}`,
      `- ${DIALECT_NOTES[conn.type]}`,
    )
  } else {
    lines.push('', 'No connection is selected; you can still help write SQL but cannot inspect any database. Suggest picking a connection if needed.')
  }
  lines.push('', '## Editor', ctx.editorSql.trim() ? '```sql\n' + ctx.editorSql.slice(0, 12000) + '\n```' : '(empty)')
  if (ctx.selection?.trim()) lines.push('', '## Current selection', '```sql\n' + ctx.selection.slice(0, 6000) + '\n```')
  if (ctx.lastError) lines.push('', '## Last query error', ctx.lastError.slice(0, 2000))
  if (ctx.lastResultPreview) lines.push('', '## Last result preview', ctx.lastResultPreview.slice(0, 3000))
  return lines.join('\n')
}

function clip(s: string, n = TOOL_OUTPUT_LIMIT) {
  return s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s
}

function formatResult(r: StatementResult): string {
  if (r.kind === 'command' || !r.columns.length) return r.message ?? 'OK'
  const cell = (v: unknown) => {
    const s = v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.length > 80 ? `${s.slice(0, 77)}…` : s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }
  const head = `| ${r.columns.map((c) => `${c.name} (${c.type})`).join(' | ')} |`
  const body = r.rows.map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n')
  return `${r.rowCount} row(s)${r.truncated ? `, showing first ${r.rows.length}` : ''}\n${head}\n${body}`
}

interface ToolOutcome {
  ok: boolean
  summary: string
  content: string
  data?: unknown
  event?: AiEvent
}

async function execTool(name: string, args: Record<string, string>, conn: Connection | undefined, ctx: AiContext): Promise<ToolOutcome> {
  if (name === 'write_to_editor') {
    const mode = (['replace', 'insert', 'replace_selection'].includes(args.mode) ? args.mode : 'replace') as 'replace'
    return {
      ok: true,
      summary: args.explanation || 'Proposed SQL',
      content: 'Shown to the user as a diff in the editor. Wait for them; do not repeat the SQL.',
      event: { type: 'editor_edit', id: nanoid(8), sql: args.sql ?? '', mode, explanation: args.explanation },
    }
  }
  if (!conn) return { ok: false, summary: 'No connection selected', content: 'Error: no connection is selected in this worksheet.' }

  const db = args.database || ctx.database
  switch (name) {
    case 'list_databases': {
      const dbs = await databases(conn.id)
      return { ok: true, summary: `${dbs.length} databases`, content: dbs.map((d) => d.name).join('\n') }
    }
    case 'list_tables': {
      if (!db) return { ok: false, summary: 'No database', content: 'Error: specify a database (use list_databases).' }
      let tables = await catalog(conn.id, db)
      if (args.schema) tables = tables.filter((t) => t.schema?.toLowerCase() === args.schema.toLowerCase())
      const lines = tables.map(
        (t) => `${t.schema ? `${t.schema}.` : ''}${t.name} [${t.kind}${t.rows != null ? `, ~${t.rows} rows` : ''}, ${t.columns.length} cols]${t.comment ? ` — ${t.comment}` : ''}`,
      )
      return { ok: true, summary: `${tables.length} tables in ${db}`, content: clip(lines.join('\n') || '(no tables)') }
    }
    case 'describe_table': {
      const t = await findTable(conn.id, args.table, db, args.schema || ctx.schema)
      if (!t) return { ok: false, summary: `${args.table} not found`, content: `Error: table ${args.table} not found in ${db ?? 'any database'}.` }
      const fq = [t.database, t.schema, t.name].filter(Boolean).join('.')
      return {
        ok: true,
        summary: `${fq} · ${t.columns.length} columns`,
        content: `${fq} (${t.kind}${t.rows != null ? `, ~${t.rows} rows` : ''})${t.comment ? `\n${t.comment}` : ''}\n` +
          t.columns.map((c) => `- ${c.name}: ${c.type}`).join('\n'),
      }
    }
    case 'search_schema': {
      if (!db) return { ok: false, summary: 'No database', content: 'Error: specify a database.' }
      const terms = args.query.toLowerCase().split('|').map((s) => s.trim()).filter(Boolean)
      const hit = (s: string) => terms.some((q) => s.toLowerCase().includes(q))
      const out: string[] = []
      for (const t of await catalog(conn.id, db)) {
        const fq = `${t.schema ? `${t.schema}.` : ''}${t.name}`
        const cols = t.columns.filter((c) => hit(c.name))
        if (hit(t.name)) out.push(`table ${fq} (${t.columns.map((c) => c.name).slice(0, 30).join(', ')})`)
        else if (cols.length) out.push(`${fq}: ${cols.map((c) => `${c.name} ${c.type}`).join(', ')}`)
      }
      return { ok: true, summary: `${out.length} matches for “${args.query}”`, content: clip(out.join('\n') || 'No matches.') }
    }
    case 'run_query': {
      const t0 = Date.now()
      try {
        const results = await runSql({
          connectionId: conn.id,
          sql: args.sql,
          database: ctx.database,
          schema: ctx.schema,
          maxRows: 50,
          runId: nanoid(),
          sessionKey: 'ai',
          forceReadOnly: true,
        })
        const last = results.at(-1)
        addHistory({ connectionId: conn.id, sql: args.sql, ok: true, rowCount: last?.rowCount, elapsedMs: Date.now() - t0, source: 'ai' })
        if (!last) return { ok: true, summary: 'No statements', content: 'No statements to run.' }
        return {
          ok: true,
          summary: `${last.rowCount.toLocaleString()} rows · ${last.elapsedMs} ms`,
          content: clip(formatResult(last)),
          data: { sql: args.sql, columns: last.columns, rows: last.rows.slice(0, 20), rowCount: last.rowCount },
        }
      } catch (e) {
        const msg = e instanceof StatementError ? e.message : (e as Error).message
        addHistory({ connectionId: conn.id, sql: args.sql, ok: false, error: msg, elapsedMs: Date.now() - t0, source: 'ai' })
        return { ok: false, summary: msg.split('\n')[0].slice(0, 140), content: `Error: ${msg}`, data: { sql: args.sql } }
      }
    }
  }
  return { ok: false, summary: `Unknown tool ${name}`, content: `Error: unknown tool ${name}` }
}

export async function* runAgent(input: {
  messages: AiMessage[]
  context: AiContext
  model?: string
  signal: AbortSignal
}): AsyncGenerator<AiEvent> {
  const settings = getSettings()
  if (!settings.openrouterKey) {
    yield { type: 'error', message: 'Add your OpenRouter API key in Settings to use the assistant.' }
    return
  }
  const conn = input.context.connectionId ? requireConnection(input.context.connectionId) : undefined
  const model = input.model || settings.model
  const autoRun = settings.aiAutoRun
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(conn, input.context, autoRun) },
    ...input.messages.slice(-30).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ]
  const usage = { prompt: 0, completion: 0 }

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${settings.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Lumen SQL',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools(autoRun),
        stream: true,
        usage: { include: true },
      }),
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      let msg = text
      try {
        msg = JSON.parse(text).error?.message ?? text
      } catch {}
      yield { type: 'error', message: `OpenRouter ${res.status}: ${msg || res.statusText}` }
      return
    }

    let text = ''
    const calls: ToolCall[] = []
    for await (const chunk of sseJson(res.body)) {
      if (chunk.error) {
        yield { type: 'error', message: chunk.error.message ?? 'Model error' }
        return
      }
      if (chunk.usage) {
        usage.prompt += chunk.usage.prompt_tokens ?? 0
        usage.completion += chunk.usage.completion_tokens ?? 0
      }
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        yield { type: 'text', delta: delta.content }
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0
        calls[i] ??= { id: tc.id ?? nanoid(), type: 'function', function: { name: '', arguments: '' } }
        if (tc.id) calls[i].id = tc.id
        if (tc.function?.name) calls[i].function.name += tc.function.name
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments
      }
    }

    const toolCalls = calls.filter(Boolean)
    messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) })
    if (!toolCalls.length) break

    for (const call of toolCalls) {
      let args: Record<string, string> = {}
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: arguments were not valid JSON.' })
        continue
      }
      yield { type: 'tool_start', id: call.id, name: call.function.name, args }
      let out: ToolOutcome
      try {
        out = await execTool(call.function.name, args, conn, input.context)
      } catch (e) {
        out = { ok: false, summary: (e as Error).message.slice(0, 140), content: `Error: ${(e as Error).message}` }
      }
      if (out.event) yield out.event
      yield { type: 'tool_end', id: call.id, ok: out.ok, summary: out.summary, data: out.data }
      messages.push({ role: 'tool', tool_call_id: call.id, content: out.content })
    }
    if (step === MAX_STEPS - 1) yield { type: 'text', delta: '\n\n_(Stopped after reaching the step limit.)_' }
  }
  yield { type: 'done', usage }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* sseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        yield JSON.parse(data)
      } catch {}
    }
  }
}

let modelCache: { at: number; models: unknown[] } | undefined

export async function listModels() {
  if (modelCache && Date.now() - modelCache.at < 60 * 60_000) return modelCache.models
  const res = await fetch(`${OPENROUTER}/models`)
  if (!res.ok) throw new Error(`OpenRouter models: ${res.status}`)
  const json = (await res.json()) as {
    data: { id: string; name: string; context_length: number; pricing: { prompt: string; completion: string }; supported_parameters?: string[]; created?: number }[]
  }
  const models = json.data
    .filter((m) => !m.supported_parameters || m.supported_parameters.includes('tools'))
    .map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context_length,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1e6,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1e6,
      created: m.created ?? 0,
    }))
  modelCache = { at: Date.now(), models }
  return models
}
