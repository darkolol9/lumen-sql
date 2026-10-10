import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'
import type { CatalogTable, DbType } from '../../../shared/types'
import { quoteIdent, statementAt } from '../../../shared/sql'
import { catalogKey, useApp } from '../store/app'
import { aliasFor, analyze, guessJoin, resolveTable } from './completion'
import { functionsFor, keywordsFor } from './dialect'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

export { monaco }
export type Editor = monaco.editor.IStandaloneCodeEditor

/** Live editor instances by worksheet id (used by the AI panel, palette, etc). */
export const editors = new Map<string, Editor>()

export const worksheetUri = (id: string) => monaco.Uri.parse(`inmemory://worksheet/${id}.sql`)
const worksheetIdOf = (model: monaco.editor.ITextModel) => model.uri.path.replace(/^\//, '').replace(/\.sql$/, '')

monaco.editor.defineTheme('lumen-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e7eaf3' },
    { token: 'keyword', foreground: '7dd3fc', fontStyle: 'bold' },
    { token: 'operator', foreground: '94a3b8' },
    { token: 'string', foreground: 'a5e3a0' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'comment', foreground: '5d667c', fontStyle: 'italic' },
    { token: 'predefined', foreground: 'd8b4fe' },
    { token: 'identifier.quote', foreground: 'fda4af' },
    { token: 'delimiter', foreground: '7c8599' },
  ],
  colors: {
    'editor.background': '#0c1018',
    'editor.foreground': '#e7eaf3',
    'editorLineNumber.foreground': '#3a4256',
    'editorLineNumber.activeForeground': '#9098ad',
    'editor.lineHighlightBackground': '#121722',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#38bdf840',
    'editor.inactiveSelectionBackground': '#38bdf820',
    'editorCursor.foreground': '#38bdf8',
    'editorIndentGuide.background1': '#1b2130',
    'editorWhitespace.foreground': '#283044',
    'editorSuggestWidget.background': '#121722',
    'editorSuggestWidget.border': '#283044',
    'editorSuggestWidget.selectedBackground': '#1e2636',
    'editorSuggestWidget.highlightForeground': '#38bdf8',
    'editorSuggestWidget.focusHighlightForeground': '#7dd3fc',
    'editorHoverWidget.background': '#121722',
    'editorHoverWidget.border': '#283044',
    'editorWidget.background': '#121722',
    'editorWidget.border': '#283044',
    'input.background': '#0c1018',
    'scrollbarSlider.background': '#28304480',
    'scrollbarSlider.hoverBackground': '#3a4256',
    'diffEditor.insertedTextBackground': '#34d39926',
    'diffEditor.removedTextBackground': '#f8717126',
    'diffEditor.insertedLineBackground': '#34d39914',
    'diffEditor.removedLineBackground': '#f8717114',
    'editorGutter.background': '#0c1018',
  },
})

monaco.editor.defineTheme('lumen-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0369a1', fontStyle: 'bold' },
    { token: 'string', foreground: '15803d' },
    { token: 'number', foreground: 'b45309' },
    { token: 'comment', foreground: '98a1b3', fontStyle: 'italic' },
    { token: 'predefined', foreground: '7c3aed' },
    { token: 'identifier.quote', foreground: 'be123c' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editorLineNumber.foreground': '#c3cad8',
    'editorLineNumber.activeForeground': '#5b6477',
    'editor.lineHighlightBackground': '#f6f8fb',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#0e8fd6',
    'editor.selectionBackground': '#0e8fd630',
  },
})

/** Catalog lookup for completion; kicks off loading of anything missing. */
function lookupFor(connectionId: string) {
  return (database: string): CatalogTable[] | undefined => {
    const c = useApp.getState().catalogs[catalogKey(connectionId, database)]
    if (!c) void useApp.getState().loadCatalog(connectionId, database)
    return c?.data
  }
}

const K = monaco.languages.CompletionItemKind

monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: ['.', ' '],
  async provideCompletionItems(model, position, context) {
    const state = useApp.getState()
    const ws = state.worksheets[worksheetIdOf(model)]
    const conn = state.connections.find((c) => c.id === ws?.connectionId)
    const dialect: DbType = conn?.type ?? 'mysql'
    const text = model.getValue()
    const offset = model.getOffsetAt(position)
    const word = model.getWordUntilPosition(position)
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    let stmt = statementAt(text, offset, dialect) ?? { text: '', start: offset, end: offset }
    // cursor sits after a `;` → we're starting a fresh statement
    if (offset > stmt.end && text.slice(stmt.end, offset).includes(';')) stmt = { text: '', start: offset, end: offset }
    const wordStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn }) - stmt.start
    const a = analyze(stmt.text, wordStart, dialect)

    // Space only triggers inside FROM/JOIN (table names); elsewhere it'd be noise.
    if (context.triggerCharacter === ' ' && a.clause !== 'from') return { suggestions: [] }

    const suggestions: monaco.languages.CompletionItem[] = []
    const ctx = { database: ws?.database, schema: ws?.schema }
    const lookup = conn ? lookupFor(conn.id) : () => undefined
    if (conn && ws?.database) await state.loadCatalog(conn.id, ws.database)

    const scope = a.refs
      .map((r) => ({ ref: r, table: resolveTable(r.parts, dialect, ctx, lookup) }))
      .filter((x): x is { ref: typeof x.ref; table: CatalogTable } => !!x.table)

    const pushColumns = (t: CatalogTable, sort: string, qualifierLabel?: string) => {
      for (const c of t.columns) {
        suggestions.push({
          label: { label: c.name, description: c.type, detail: qualifierLabel ? `  ${qualifierLabel}` : undefined },
          kind: K.Field,
          insertText: quoteIdent(c.name, dialect),
          detail: `${t.name}.${c.name} · ${c.type}`,
          sortText: `${sort}${c.name}`,
          range,
        })
      }
    }
    const pushTables = (tables: CatalogTable[], sort: string, qualified = false) => {
      for (const t of tables) {
        const path = [t.schema, t.name].filter(Boolean).join('.')
        suggestions.push({
          label: { label: t.name, description: t.kind === 'view' ? 'view' : `${t.columns.length} cols`, detail: t.schema && !qualified ? `  ${t.schema}` : undefined },
          kind: t.kind === 'view' ? K.Interface : K.Class,
          insertText:
            dialect === 'snowflake' && t.schema && !qualified && t.schema.toLowerCase() !== ws?.schema?.toLowerCase()
              ? `${quoteIdent(t.schema, dialect)}.${quoteIdent(t.name, dialect)}`
              : quoteIdent(t.name, dialect),
          detail: `${t.kind.toUpperCase()} ${t.database}.${path}${t.rows != null ? ` · ~${t.rows.toLocaleString()} rows` : ''}`,
          documentation: t.comment,
          sortText: `${sort}${t.name}`,
          range,
        })
      }
    }

    // ── qualified: alias.col, db.table, schema.table, db.schema.table
    if (a.qualifier.length) {
      const q = a.qualifier
      if (q.length === 1) {
        const byAlias = scope.find((s) => s.ref.alias?.toLowerCase() === q[0].toLowerCase()) ??
          scope.find((s) => s.ref.parts[s.ref.parts.length - 1].toLowerCase() === q[0].toLowerCase())
        if (byAlias) {
          pushColumns(byAlias.table, '0')
          return { suggestions }
        }
        const direct = resolveTable(q, dialect, ctx, lookup)
        if (direct && a.clause !== 'from') pushColumns(direct, '0')
      }
      if (conn) {
        const dbs = (await state.loadDatabases(conn.id)) ?? []
        if (dialect === 'snowflake') {
          const dbMatch = dbs.find((d) => d.name.toLowerCase() === q[0].toLowerCase())
          if (q.length === 1 && dbMatch) {
            const tables = (await state.loadCatalog(conn.id, dbMatch.name)) ?? []
            for (const s of new Set(tables.map((t) => t.schema!)))
              suggestions.push({ label: s, kind: K.Module, insertText: quoteIdent(s, dialect), detail: `schema in ${dbMatch.name}`, range, sortText: `0${s}` })
          } else {
            const [db, schema] = q.length === 2 ? q : [ws?.database, q[0]]
            if (db) {
              const tables = ((await state.loadCatalog(conn.id, db)) ?? []).filter((t) => t.schema?.toLowerCase() === schema.toLowerCase())
              pushTables(tables, '1', true)
            }
          }
        } else if (q.length === 1) {
          const dbMatch = dbs.find((d) => d.name.toLowerCase() === q[0].toLowerCase())
          if (dbMatch) pushTables((await state.loadCatalog(conn.id, dbMatch.name)) ?? [], '1', true)
        }
      }
      return { suggestions }
    }

    // ── table position
    if (a.clause === 'from' || a.clause === 'insert') {
      const current = ws?.database ? (lookup(ws.database) ?? []) : []
      if (a.afterJoin && scope.length) {
        const taken = new Set(scope.map((s) => s.ref.alias ?? s.table.name))
        const scoped = scope.map((s) => ({ table: s.table, alias: s.ref.alias ?? s.table.name }))
        for (const t of current) {
          const alias = aliasFor(t.name, taken)
          const on = guessJoin(t, scoped, alias)
          if (!on) continue
          suggestions.push({
            label: { label: `${t.name} ${alias} ON ${on}`, description: 'join' },
            kind: K.Snippet,
            insertText: `${quoteIdent(t.name, dialect)} ${alias} ON ${on}`,
            filterText: t.name,
            detail: 'Join on matching key',
            sortText: `0${t.name}`,
            range,
          })
        }
      }
      pushTables(current, '1')
      for (const c of a.ctes) suggestions.push({ label: { label: c, description: 'CTE' }, kind: K.Reference, insertText: c, range, sortText: `0${c}` })
      if (conn) {
        for (const d of (state.databases[conn.id]?.data ?? []))
          suggestions.push({ label: { label: d.name, description: 'database' }, kind: K.Module, insertText: quoteIdent(d.name, dialect), range, sortText: `2${d.name}` })
        if (!state.databases[conn.id]) void state.loadDatabases(conn.id)
      }
      return { suggestions }
    }

    // ── expression position: columns in scope first
    const multi = scope.length > 1
    for (const s of scope) pushColumns(s.table, '0', multi ? (s.ref.alias ?? s.table.name) : s.table.name)
    for (const s of scope) {
      if (s.ref.alias)
        suggestions.push({ label: { label: s.ref.alias, description: s.table.name }, kind: K.Variable, insertText: s.ref.alias, range, sortText: `1${s.ref.alias}` })
    }
    for (const [name, sig, doc] of functionsFor(dialect)) {
      suggestions.push({
        label: { label: name, detail: sig },
        kind: K.Function,
        insertText: `${name}($0)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: doc,
        sortText: `3${name}`,
        range,
      })
    }
    for (const kw of keywordsFor(dialect)) suggestions.push({ label: kw, kind: K.Keyword, insertText: kw, sortText: `4${kw}`, range })
    if (!scope.length && ws?.database) pushTables(lookup(ws.database) ?? [], '2')
    return { suggestions }
  },
})

monaco.languages.registerHoverProvider('sql', {
  provideHover(model, position) {
    const word = model.getWordAtPosition(position)
    if (!word) return null
    const state = useApp.getState()
    const ws = state.worksheets[worksheetIdOf(model)]
    if (!ws?.connectionId || !ws.database) return null
    const tables = state.catalogs[catalogKey(ws.connectionId, ws.database)]?.data ?? []
    const t = tables.find((t) => t.name.toLowerCase() === word.word.toLowerCase())
    if (!t) return null
    const cols = t.columns
      .slice(0, 40)
      .map((c) => `| \`${c.name}\` | ${c.type} |`)
      .join('\n')
    return {
      range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      contents: [
        { value: `**${t.kind === 'view' ? 'View' : 'Table'}** \`${[t.database, t.schema, t.name].filter(Boolean).join('.')}\`${t.rows != null ? ` · ~${t.rows.toLocaleString()} rows` : ''}` },
        ...(t.comment ? [{ value: t.comment }] : []),
        { value: `| column | type |\n|---|---|\n${cols}${t.columns.length > 40 ? `\n\n…and ${t.columns.length - 40} more` : ''}` },
      ],
    }
  },
})
