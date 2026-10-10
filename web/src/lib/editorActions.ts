import { format } from 'sql-formatter'
import { toast } from 'sonner'
import { dangerOf, splitStatements, statementAt } from '../../../shared/sql'
import type { DbType } from '../../../shared/types'
import { connectionById, useApp } from '../store/app'
import { DB_META } from './dialect'
import { editors, monaco } from './monaco'

const activeEditor = () => {
  const id = useApp.getState().activeTabId
  return id ? { id, editor: editors.get(id) } : undefined
}

export function insertText(text: string, worksheetId = useApp.getState().activeTabId) {
  const ed = worksheetId ? editors.get(worksheetId) : undefined
  if (!ed) return
  const sel = ed.getSelection()
  if (!sel) return
  ed.executeEdits('lumen', [{ range: sel, text, forceMoveMarkers: true }])
  ed.focus()
}

/** Appends SQL as a new statement at the end of the editor and selects it. */
export function appendStatement(sql: string, worksheetId = useApp.getState().activeTabId) {
  const ed = worksheetId ? editors.get(worksheetId) : undefined
  const model = ed?.getModel()
  if (!ed || !model) return
  const current = model.getValue()
  const sep = !current.trim() ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
  const end = model.getFullModelRange().getEndPosition()
  ed.executeEdits('lumen', [{ range: new monaco.Range(end.lineNumber, end.column, end.lineNumber, end.column), text: sep + sql }])
  const last = model.getFullModelRange().getEndPosition()
  const startPos = model.getPositionAt(current.length + sep.length)
  ed.setSelection(new monaco.Range(startPos.lineNumber, startPos.column, last.lineNumber, last.column))
  ed.revealLineInCenter(last.lineNumber)
  ed.focus()
}

export function dialectOf(worksheetId?: string): DbType {
  const ws = worksheetId ? useApp.getState().worksheets[worksheetId] : undefined
  return connectionById(ws?.connectionId)?.type ?? 'mysql'
}

/** What Ctrl+Enter runs: the selection, or the statement under the cursor. */
export function currentStatement(worksheetId: string): { sql: string; offset: number } | undefined {
  const ed = editors.get(worksheetId)
  const model = ed?.getModel()
  if (!ed || !model) return
  const sel = ed.getSelection()
  if (sel && !sel.isEmpty()) return { sql: model.getValueInRange(sel), offset: model.getOffsetAt(sel.getStartPosition()) }
  const s = statementAt(model.getValue(), model.getOffsetAt(ed.getPosition()!), dialectOf(worksheetId))
  return s && { sql: s.text, offset: s.start }
}

export async function runCurrent(worksheetId = activeEditor()?.id, all = false) {
  if (!worksheetId) return
  const ed = editors.get(worksheetId)
  const model = ed?.getModel()
  if (!model) return
  const target = all ? { sql: model.getValue(), offset: 0 } : currentStatement(worksheetId)
  if (!target?.sql.trim()) return toast.message('Nothing to run')
  const conn = connectionById(useApp.getState().worksheets[worksheetId]?.connectionId)
  if (conn && !conn.readOnly) {
    for (const s of splitStatements(target.sql, conn.type)) {
      const d = dangerOf(s.text, conn.type)
      if (
        d &&
        !(await useApp.getState().askConfirm({
          title: 'Run destructive statement?',
          body: `${d.reason}.\n\n${s.text.slice(0, 400)}\n\nConnection: ${conn.name}`,
          action: 'Run anyway',
        }))
      )
        return
    }
  }
  await useApp.getState().run(worksheetId, target.sql, target.offset)
}

export function formatEditor(worksheetId = activeEditor()?.id) {
  const ed = worksheetId ? editors.get(worksheetId) : undefined
  const model = ed?.getModel()
  if (!ed || !model) return
  const language = DB_META[dialectOf(worksheetId)].sqlFormatter as 'mysql'
  const sel = ed.getSelection()
  const whole = !sel || sel.isEmpty()
  const range = whole ? model.getFullModelRange() : sel
  try {
    const out = format(model.getValueInRange(range), { language, keywordCase: 'upper', tabWidth: 2, linesBetweenQueries: 2 })
    ed.executeEdits('format', [{ range, text: whole ? `${out}\n` : out }])
    ed.pushUndoStop()
  } catch (e) {
    toast.error(`Could not format: ${(e as Error).message.split('\n')[0]}`)
  }
}
