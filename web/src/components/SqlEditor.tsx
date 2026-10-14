import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Check, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { splitStatements, statementAt } from '../../../shared/sql'
import { askAi, focusAi } from '../lib/aiBus'
import { dialectOf, formatEditor, runCurrent } from '../lib/editorActions'
import { editors, monaco, worksheetUri, type Editor as Ed } from '../lib/monaco'
import { modKey } from '../lib/format'
import { useApp } from '../store/app'
import { Button, Kbd } from './ui'
import { monacoThemeId } from '../lib/themes'

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
  fontSize: 13.5,
  lineHeight: 22,
  fontLigatures: false,
  minimap: { enabled: false },
  padding: { top: 14, bottom: 14 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'all',
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  roundedSelection: true,
  wordBasedSuggestions: 'off',
  quickSuggestions: { other: true, comments: false, strings: false },
  quickSuggestionsDelay: 40,
  suggestOnTriggerCharacters: true,
  // 'smart' only accepts on Enter when it changes text, so Enter after a fully typed word still inserts a newline
  acceptSuggestionOnEnter: 'smart',
  tabCompletion: 'on',
  suggest: { showWords: false, preview: true, showStatusBar: false, selectionMode: 'always', localityBonus: true },
  fixedOverflowWidgets: true,
  automaticLayout: true,
  tabSize: 2,
  bracketPairColorization: { enabled: true },
  guides: { indentation: false },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  showFoldingControls: 'mouseover',
  stickyScroll: { enabled: false },
  inlineSuggest: { enabled: true },
}

export function SqlEditor({ worksheetId }: { worksheetId: string }) {
  const sql = useApp((s) => s.worksheets[worksheetId]?.sql ?? '')
  const theme = useApp((s) => s.themePreview ?? s.theme)
  const pending = useApp((s) => s.pendingEdits[worksheetId])
  const run = useApp((s) => s.runs[worksheetId])
  const edRef = useRef<Ed | null>(null)
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const idRef = useRef(worksheetId)
  idRef.current = worksheetId

  const updateStatementHighlight = () => {
    const ed = edRef.current
    const model = ed?.getModel()
    const pos = ed?.getPosition()
    if (!ed || !model || !pos) return
    const stmts = splitStatements(model.getValue(), dialectOf(idRef.current))
    const sel = ed.getSelection()
    if (stmts.length < 2 || (sel && !sel.isEmpty())) {
      decorations.current?.clear()
      return
    }
    const s = statementAt(model.getValue(), model.getOffsetAt(pos), dialectOf(idRef.current))
    if (!s) return decorations.current?.clear()
    const a = model.getPositionAt(s.start)
    const b = model.getPositionAt(s.end)
    decorations.current?.set([
      {
        range: new monaco.Range(a.lineNumber, 1, b.lineNumber, 1),
        options: { isWholeLine: true, linesDecorationsClassName: 'current-statement-gutter' },
      },
    ])
  }

  const onMount: OnMount = (ed) => {
    edRef.current = ed
    editors.set(idRef.current, ed)
    decorations.current = ed.createDecorationsCollection()
    ed.onDidChangeCursorPosition(updateStatementHighlight)
    ed.onDidChangeModel(() => {
      for (const [k, v] of editors) if (v === ed) editors.delete(k)
      editors.set(idRef.current, ed)
      updateStatementHighlight()
    })

    const KM = monaco.KeyMod
    const KC = monaco.KeyCode
    ed.addAction({ id: 'lumen.run', label: 'Run statement', keybindings: [KM.CtrlCmd | KC.Enter], contextMenuGroupId: '0_lumen', contextMenuOrder: 1, run: () => void runCurrent(idRef.current) })
    ed.addAction({ id: 'lumen.runAll', label: 'Run all', keybindings: [KM.CtrlCmd | KM.Shift | KC.Enter], contextMenuGroupId: '0_lumen', contextMenuOrder: 2, run: () => void runCurrent(idRef.current, true) })
    ed.addAction({ id: 'lumen.format', label: 'Format SQL', keybindings: [KM.Shift | KM.Alt | KC.KeyF], contextMenuGroupId: '0_lumen', contextMenuOrder: 3, run: () => formatEditor(idRef.current) })
    ed.addAction({ id: 'lumen.ai', label: 'Ask AI…', keybindings: [KM.CtrlCmd | KC.KeyK], contextMenuGroupId: '1_ai', contextMenuOrder: 1, run: () => focusAi() })
    ed.addAction({
      id: 'lumen.ai.explain',
      label: 'AI: Explain this query',
      contextMenuGroupId: '1_ai',
      contextMenuOrder: 2,
      run: () => askAi('Explain what the selected query (or the statement under my cursor) does, step by step, and point out anything suspicious.'),
    })
    ed.addAction({
      id: 'lumen.ai.optimize',
      label: 'AI: Optimize this query',
      contextMenuGroupId: '1_ai',
      contextMenuOrder: 3,
      run: () => askAi('Optimize the selected query (or the statement under my cursor) for performance on this engine. Check the schema, then propose the improved version in the editor and explain the changes briefly.'),
    })
    ed.addAction({
      id: 'lumen.ai.comment',
      label: 'AI: Document with comments',
      contextMenuGroupId: '1_ai',
      contextMenuOrder: 4,
      run: () => askAi('Add concise SQL comments documenting the current query (header comment + key steps). Propose it with replace_selection if I selected text, otherwise replace.'),
    })
    updateStatementHighlight()
  }

  useEffect(() => () => void editors.delete(idRef.current), [])

  // error marker on the failing statement
  useEffect(() => {
    const model = monaco.editor.getModel(worksheetUri(worksheetId))
    if (!model) return
    if (!run?.error || run.running || run.sql == null) {
      monaco.editor.setModelMarkers(model, 'lumen', [])
      return
    }
    const stmts = splitStatements(run.sql, dialectOf(worksheetId))
    const s = stmts[run.error.statementIndex] ?? stmts[0]
    if (!s) return
    const base = run.offset ?? 0
    if (model.getValue().slice(base + s.start, base + s.end) !== s.text) return // edited since
    const a = model.getPositionAt(base + s.start)
    const b = model.getPositionAt(base + s.end)
    monaco.editor.setModelMarkers(model, 'lumen', [
      { severity: monaco.MarkerSeverity.Error, message: run.error.message, startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column },
    ])
  }, [run?.error, run?.running, run?.sql, run?.offset, worksheetId])

  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const accept = () => {
    const ed = edRef.current
    const model = ed?.getModel()
    if (!ed || !model || !pending) return
    const finalText = diffRef.current?.getModifiedEditor().getValue() ?? pending.proposed
    ed.pushUndoStop()
    ed.executeEdits('ai', [{ range: model.getFullModelRange(), text: finalText }])
    ed.pushUndoStop()
    useApp.getState().setPendingEdit(worksheetId, undefined)
    ed.focus()
  }

  const reject = () => {
    useApp.getState().setPendingEdit(worksheetId, undefined)
    edRef.current?.focus()
  }

  // dispose the diff models once the diff view has unmounted
  useEffect(() => {
    if (!pending) return
    const id = pending.id
    return () => {
      setTimeout(() => {
        for (const side of ['original', 'modified']) monaco.editor.getModel(monaco.Uri.parse(`inmemory://diff/${id}/${side}.sql`))?.dispose()
      }, 0)
    }
  }, [pending?.id])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reject()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        accept()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const monacoTheme = monacoThemeId(theme)
  return (
    <div className="relative h-full w-full">
      <Editor
        path={worksheetUri(worksheetId).toString()}
        defaultLanguage="sql"
        defaultValue={sql}
        theme={monacoTheme}
        options={EDITOR_OPTIONS}
        onMount={onMount}
        keepCurrentModel
        loading={<div className="h-full w-full bg-panel" />}
        onChange={(v) => useApp.getState().updateWorksheet(idRef.current, { sql: v ?? '' })}
      />
      {pending && (
        <div className="absolute inset-0 z-10 flex animate-fade-in flex-col bg-panel">
          <div className="flex items-center gap-3 border-b border-ai/25 bg-ai-soft px-3 py-2">
            <div className="ai-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white">
              <Sparkles size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">AI suggested a change</div>
              {pending.explanation && <div className="truncate text-[12px] text-muted">{pending.explanation}</div>}
            </div>
            <span className="hidden items-center gap-1 text-[11px] text-faint md:flex">
              <Kbd>Esc</Kbd> reject · <Kbd>{modKey}</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd> accept
            </span>
            <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={reject}>
              Reject
            </Button>
            <Button size="sm" variant="ai" icon={<Check size={13} />} onClick={accept}>
              Accept
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              original={pending.original}
              modified={pending.proposed}
              language="sql"
              theme={monacoTheme}
              onMount={(d) => (diffRef.current = d)}
              // the wrapper disposes models before the widget detaches them; own their lifecycle instead
              originalModelPath={`inmemory://diff/${pending.id}/original.sql`}
              modifiedModelPath={`inmemory://diff/${pending.id}/modified.sql`}
              keepCurrentOriginalModel
              keepCurrentModifiedModel
              options={{
                ...EDITOR_OPTIONS,
                renderSideBySide: false,
                originalEditable: false,
                readOnly: false,
                renderIndicators: true,
                renderOverviewRuler: false,
                diffWordWrap: 'on',
                hideUnchangedRegions: { enabled: false },
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
