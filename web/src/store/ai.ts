import { create } from 'zustand'
import { statementAt } from '../../../shared/sql'
import type { AiContext, AiMessage } from '../../../shared/types'
import { api } from '../lib/api'
import { dialectOf } from '../lib/editorActions'
import { cellText } from '../lib/format'
import { editors } from '../lib/monaco'
import { useApp } from './app'

export type Part =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; args: Record<string, unknown>; status: 'running' | 'ok' | 'error'; summary?: string; data?: unknown }
  | { type: 'edit'; id: string; sql: string; explanation?: string }

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  parts: Part[]
  error?: string
  /** Context chips shown on user messages. */
  context?: string[]
}

interface Chat {
  messages: UiMessage[]
  streaming: boolean
}

interface AiState {
  chats: Record<string, Chat>
  send(worksheetId: string, prompt: string): Promise<void>
  stop(worksheetId: string): void
  clear(worksheetId: string): void
}

const controllers = new Map<string, AbortController>()
const empty: Chat = { messages: [], streaming: false }

/** Flatten a UI message into plain text the model can read back next turn. */
function toApiMessage(m: UiMessage): AiMessage {
  const content = m.parts
    .map((p) => {
      if (p.type === 'text') return p.text
      if (p.type === 'edit') return `[proposed in editor]\n\`\`\`sql\n${p.sql}\n\`\`\``
      if (p.type === 'tool' && p.name === 'run_query') return `[ran query: ${String(p.args.sql).slice(0, 300)} → ${p.summary}]`
      return `[${p.name}: ${p.summary ?? ''}]`
    })
    .join('\n')
  return { role: m.role, content: content || '(no content)' }
}

export function buildContext(worksheetId: string): { ctx: AiContext; chips: string[] } {
  const state = useApp.getState()
  const ws = state.worksheets[worksheetId]
  const ed = editors.get(worksheetId)
  const model = ed?.getModel()
  const sel = ed?.getSelection()
  const selection = sel && !sel.isEmpty() && model ? model.getValueInRange(sel) : undefined
  const run = state.runs[worksheetId]
  const result = run?.results[run.activeResult]
  let lastResultPreview: string | undefined
  if (result?.kind === 'rows' && !run?.running) {
    lastResultPreview =
      `${result.rowCount} rows. Columns: ${result.columns.map((c) => `${c.name} ${c.type}`).join(', ')}\n` +
      result.rows
        .slice(0, 8)
        .map((r) => r.map((v) => cellText(v).slice(0, 40)).join(' | '))
        .join('\n')
  }
  const chips: string[] = []
  const editorSql = model?.getValue() ?? ws?.sql ?? ''
  if (selection) chips.push(`Selection · ${selection.split('\n').length} lines`)
  else if (editorSql.trim()) chips.push('Editor')
  if (run?.error && !run.running) chips.push('Last error')
  else if (lastResultPreview) chips.push('Last result')
  return {
    ctx: {
      connectionId: ws?.connectionId,
      database: ws?.database,
      schema: ws?.schema,
      editorSql,
      selection,
      lastError: run?.error && !run.running ? run.error.message : undefined,
      lastResultPreview: run?.error ? undefined : lastResultPreview,
    },
    chips,
  }
}

/** Compute the full editor text after applying an AI edit, for the diff view. */
function applyEdit(worksheetId: string, sql: string, mode: 'replace' | 'insert' | 'replace_selection') {
  const ed = editors.get(worksheetId)
  const model = ed?.getModel()
  const original = model?.getValue() ?? useApp.getState().worksheets[worksheetId]?.sql ?? ''
  if (!ed || !model || mode === 'replace') return { original, proposed: sql.endsWith('\n') ? sql : `${sql}\n` }
  const sel = ed.getSelection()
  if (mode === 'replace_selection') {
    if (sel && !sel.isEmpty()) {
      const a = model.getOffsetAt(sel.getStartPosition())
      const b = model.getOffsetAt(sel.getEndPosition())
      return { original, proposed: original.slice(0, a) + sql + original.slice(b) }
    }
    // no selection: replace the statement under the cursor
    const s = statementAt(original, model.getOffsetAt(ed.getPosition()!), dialectOf(worksheetId))
    if (s) return { original, proposed: original.slice(0, s.start) + sql.replace(/;\s*$/, '') + original.slice(s.end) }
    return { original, proposed: sql }
  }
  const at = sel ? model.getOffsetAt(sel.getEndPosition()) : original.length
  const before = original.slice(0, at)
  const pad = before && !before.endsWith('\n') ? '\n\n' : ''
  return { original, proposed: before + pad + sql + original.slice(at) }
}

export const useAi = create<AiState>((set, get) => {
  const update = (wsId: string, fn: (c: Chat) => Chat) => set((s) => ({ chats: { ...s.chats, [wsId]: fn(s.chats[wsId] ?? empty) } }))
  const updateLast = (wsId: string, fn: (m: UiMessage) => UiMessage) =>
    update(wsId, (c) => ({ ...c, messages: c.messages.map((m, i) => (i === c.messages.length - 1 ? fn(m) : m)) }))

  return {
    chats: {},

    async send(worksheetId, prompt) {
      if (get().chats[worksheetId]?.streaming) return
      const { ctx, chips } = buildContext(worksheetId)
      const user: UiMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }], context: chips }
      const assistant: UiMessage = { id: crypto.randomUUID(), role: 'assistant', parts: [] }
      const history = [...(get().chats[worksheetId]?.messages ?? []), user]
      update(worksheetId, () => ({ messages: [...history, assistant], streaming: true }))

      const ac = new AbortController()
      controllers.set(worksheetId, ac)
      try {
        for await (const ev of api.chat({ messages: history.map(toApiMessage), context: ctx }, ac.signal)) {
          switch (ev.type) {
            case 'text':
              updateLast(worksheetId, (m) => {
                const last = m.parts[m.parts.length - 1]
                if (last?.type === 'text') return { ...m, parts: [...m.parts.slice(0, -1), { ...last, text: last.text + ev.delta }] }
                return { ...m, parts: [...m.parts, { type: 'text', text: ev.delta }] }
              })
              break
            case 'tool_start':
              updateLast(worksheetId, (m) => ({ ...m, parts: [...m.parts, { type: 'tool', id: ev.id, name: ev.name, args: ev.args, status: 'running' }] }))
              break
            case 'tool_end':
              updateLast(worksheetId, (m) => ({
                ...m,
                parts: m.parts.map((p) => (p.type === 'tool' && p.id === ev.id ? { ...p, status: ev.ok ? 'ok' : 'error', summary: ev.summary, data: ev.data } : p)),
              }))
              break
            case 'editor_edit': {
              const { original, proposed } = applyEdit(worksheetId, ev.sql, ev.mode)
              useApp.getState().setPendingEdit(worksheetId, { id: ev.id, sql: ev.sql, mode: ev.mode, explanation: ev.explanation, original, proposed })
              updateLast(worksheetId, (m) => ({ ...m, parts: [...m.parts, { type: 'edit', id: ev.id, sql: ev.sql, explanation: ev.explanation }] }))
              break
            }
            case 'error':
              updateLast(worksheetId, (m) => ({ ...m, error: ev.message }))
              break
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) updateLast(worksheetId, (m) => ({ ...m, error: (e as Error).message }))
      } finally {
        controllers.delete(worksheetId)
        update(worksheetId, (c) => ({ ...c, streaming: false }))
      }
    },

    stop(worksheetId) {
      controllers.get(worksheetId)?.abort()
    },

    clear(worksheetId) {
      get().stop(worksheetId)
      update(worksheetId, () => empty)
    },
  }
})
