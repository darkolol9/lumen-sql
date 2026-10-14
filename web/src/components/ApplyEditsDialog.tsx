import { AlertTriangle, Copy, PencilLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { RowEdit, StatementResult } from '../../../shared/types'
import { api } from '../lib/api'
import { useApp } from '../store/app'
import type { CellEdits } from './ResultsGrid'
import { Button, Dialog, IconButton, Spinner } from './ui'

/** Turns grid cell edits into per-row edits keyed by table column, using each row's original key values. */
export function toRowEdits(result: StatementResult, edits: CellEdits): RowEdit[] {
  const target = result.editTarget!
  const keyIdx = target.key.map((k) => result.columns.findIndex((c) => c.source === k && c.editable))
  return Object.entries(edits).map(([r, cols]) => {
    const row = result.rows[Number(r)]
    const changes: Record<string, string | null> = {}
    for (const [c, v] of Object.entries(cols)) {
      const src = result.columns[Number(c)].source!
      if (src in changes && changes[src] !== v) throw new Error(`Row ${Number(r) + 1} sets ${src} to two different values`)
      changes[src] = v
    }
    return { key: Object.fromEntries(target.key.map((k, i) => [k, row[keyIdx[i]]])), changes }
  })
}

export function ApplyEditsDialog({
  open,
  onClose,
  worksheetId,
  connectionId,
  resultIndex,
  result,
  edits,
  onApplied,
}: {
  open: boolean
  onClose: () => void
  worksheetId: string
  /** The connection the rows were loaded from (not necessarily the worksheet's current one). */
  connectionId: string
  resultIndex: number
  result: StatementResult
  edits: CellEdits
  onApplied: () => void
}) {
  const conn = useApp((s) => s.connections.find((c) => c.id === connectionId))
  const [statements, setStatements] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [applying, setApplying] = useState(false)
  const target = result.editTarget!

  const request = () => ({ connectionId, target, edits: toRowEdits(result, edits) })

  useEffect(() => {
    if (!open) return
    setStatements(undefined)
    setError(undefined)
    try {
      api
        .previewEdits(request())
        .then((r) => setStatements(r.statements))
        .catch((e) => setError(e.message))
    } catch (e) {
      setError((e as Error).message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sql = statements?.map((s) => `${s};`).join('\n') ?? ''

  const apply = async () => {
    setApplying(true)
    setError(undefined)
    try {
      const req = request()
      await api.applyEdits({ ...req, worksheetId })
      // reflect the saved values in the grid, including duplicate columns of the same source
      const rows = result.rows.slice()
      for (const [r, e] of Object.entries(edits).map(([r], i) => [Number(r), req.edits[i]] as const)) {
        rows[r] = rows[r].map((v, ci) => {
          const src = result.columns[ci].source
          return src && result.columns[ci].editable && src in e.changes ? e.changes[src] : v
        })
      }
      useApp.setState((s) => {
        const run = s.runs[worksheetId]
        if (!run || run.results[resultIndex] !== result) return {}
        const results = run.results.slice()
        results[resultIndex] = { ...result, rows }
        return { runs: { ...s.runs, [worksheetId]: { ...run, results } } }
      })
      toast.success(`Saved ${req.edits.length} row${req.edits.length === 1 ? '' : 's'} in ${target.table}`)
      onApplied()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const n = Object.keys(edits).length
  return (
    <Dialog
      open={open}
      onClose={() => !applying && onClose()}
      width={680}
      icon={<PencilLine size={16} className="text-warn" />}
      title="Review changes"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} disabled={!statements || applying} icon={applying ? <Spinner className="h-3 w-3" /> : undefined}>
            Apply {n} update{n === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-[12.5px] text-muted">
          These statements will run on{' '}
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <span className="h-2 w-2 rounded-full" style={{ background: conn?.color }} />
            {conn?.name ?? 'unknown connection'}
          </span>{' '}
          · <span className="mono text-fg">{`${target.database}.${target.table}`}</span> in a single transaction. If any row was changed or deleted since you
          loaded it, or MySQL raises a warning, everything is rolled back.
        </div>
        <div className="relative rounded-lg border border-line bg-canvas">
          {statements ? (
            <>
              <pre className="mono max-h-[45vh] overflow-auto p-3 pr-10 text-[12px] leading-relaxed whitespace-pre-wrap break-all">{sql}</pre>
              <IconButton
                tip="Copy SQL"
                className="absolute top-1.5 right-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(sql)
                  toast.success('Copied')
                }}
              >
                <Copy size={13} />
              </IconButton>
            </>
          ) : (
            !error && (
              <div className="flex items-center gap-2 p-3 text-[12px] text-muted">
                <Spinner className="h-3 w-3" /> Building statements…
              </div>
            )
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft p-3 text-[12.5px] text-bad">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>
    </Dialog>
  )
}
