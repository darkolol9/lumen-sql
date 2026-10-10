import clsx from 'clsx'
import {
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Database,
  Eye,
  KeyRound,
  ListTree,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Table2,
  TriangleAlert,
  X,
  FileDiff,
} from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { AI_ASK, AI_FOCUS } from '../lib/aiBus'
import { appendStatement } from '../lib/editorActions'
import { cellText, modKey } from '../lib/format'
import { buildContext, useAi, type Part, type UiMessage } from '../store/ai'
import { useApp } from '../store/app'
import { ModelPicker } from './ModelPicker'
import { Button, IconButton, Input, Kbd, Spinner } from './ui'

export function AiPanel() {
  const worksheetId = useApp((s) => s.activeTabId)
  const hasKey = useApp((s) => s.settings.hasOpenrouterKey)
  const chat = useAi((s) => (worksheetId ? s.chats[worksheetId] : undefined))
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat])

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <div className="ai-gradient flex h-6 w-6 items-center justify-center rounded-md text-white shadow-[0_4px_14px_-4px_#818cf8]">
          <Sparkles size={13} />
        </div>
        <span className="text-[13px] font-semibold">Assistant</span>
        <div className="flex-1" />
        {hasKey && <ModelPicker compact />}
        {worksheetId && !!chat?.messages.length && (
          <IconButton tip="New chat" onClick={() => useAi.getState().clear(worksheetId)}>
            <RotateCcw size={14} />
          </IconButton>
        )}
        <IconButton tip="Close" onClick={() => useApp.getState().setPrefs({ aiOpen: false })}>
          <X size={15} />
        </IconButton>
      </div>

      {!hasKey ? (
        <KeySetup />
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
          >
            {!chat?.messages.length ? (
              worksheetId && <Welcome worksheetId={worksheetId} />
            ) : (
              <div className="flex flex-col gap-5">
                {chat.messages.map((m, i) => (
                  <Message key={m.id} m={m} streaming={chat.streaming && i === chat.messages.length - 1} />
                ))}
              </div>
            )}
          </div>
          {worksheetId && <Composer worksheetId={worksheetId} streaming={!!chat?.streaming} />}
        </>
      )}
    </div>
  )
}

function KeySetup() {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="relative">
        <div className="ai-gradient absolute inset-0 rounded-2xl opacity-40 blur-xl" />
        <div className="ai-gradient relative flex h-12 w-12 items-center justify-center rounded-2xl text-white">
          <KeyRound size={20} />
        </div>
      </div>
      <div>
        <div className="text-[14px] font-semibold">Connect OpenRouter</div>
        <div className="mt-1 text-[12.5px] text-muted">Paste your API key to use any model — Claude, GPT, Gemini and more. It's stored encrypted on this machine.</div>
      </div>
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!key.trim()) return
          setSaving(true)
          await useApp.getState().updateSettings({ openrouterKey: key.trim() })
          setSaving(false)
          toast.success('OpenRouter connected')
        }}
      >
        <Input type="password" placeholder="sk-or-v1-…" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        <Button variant="ai" type="submit" disabled={!key.trim() || saving}>
          {saving ? <Spinner /> : 'Save key'}
        </Button>
      </form>
      <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline">
        Get a key at openrouter.ai/keys →
      </a>
    </div>
  )
}

function Welcome({ worksheetId }: { worksheetId: string }) {
  const ws = useApp((s) => s.worksheets[worksheetId])
  const conn = useApp((s) => s.connections.find((c) => c.id === ws?.connectionId))
  const hasSql = !!ws?.sql.trim()
  const suggestions = [
    ...(conn ? ['What data is in this database? Give me a quick tour.'] : []),
    ...(hasSql ? ['Explain the query in my editor', 'Optimize the query in my editor'] : []),
    ...(conn ? ['Find the 10 largest tables and how they relate', 'Write a query for daily activity over the last 30 days'] : ['Help me write a SQL query']),
  ].slice(0, 4)
  return (
    <div className="flex h-full flex-col justify-end gap-4 pb-2">
      <div>
        <div className="ai-text text-[20px] leading-tight font-semibold">How can I help?</div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          I can explore your schema, run read-only queries to check my work, and propose changes to your editor as a reviewable diff.
          {conn && (
            <>
              {' '}
              Connected to <span className="text-fg">{conn.name}</span>
              {ws?.database && (
                <>
                  {' '}
                  · <span className="mono text-fg">{ws.database}</span>
                </>
              )}
              .
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => useAi.getState().send(worksheetId, s)}
            className="group flex items-center gap-2 rounded-lg border border-line bg-raised/60 px-3 py-2 text-left text-[12.5px] text-muted transition-colors hover:border-ai/40 hover:bg-ai-soft hover:text-fg"
          >
            <Sparkles size={12} className="shrink-0 text-ai/70 group-hover:text-ai" />
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

const Message = memo(function Message({ m, streaming }: { m: UiMessage; streaming: boolean }) {
  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[90%] rounded-2xl rounded-br-md bg-active px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{text}</div>
        {!!m.context?.length && <div className="flex gap-1 text-[10.5px] text-faint">{m.context.join(' · ')}</div>}
      </div>
    )
  }
  const empty = !m.parts.length && !m.error
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {m.parts.map((p, i) => (
        <PartView key={i} p={p} />
      ))}
      {empty && streaming && (
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ai" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </span>
          Thinking
        </div>
      )}
      {m.error && (
        <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="break-words">{m.error}</span>
        </div>
      )}
    </div>
  )
})

function PartView({ p }: { p: Part }) {
  if (p.type === 'text') return <Markdown text={p.text} />
  if (p.type === 'edit') return <EditCard p={p} />
  return <ToolCard p={p} />
}

const TOOL_META: Record<string, { icon: typeof Database; label: string }> = {
  list_databases: { icon: Database, label: 'Listed databases' },
  list_tables: { icon: ListTree, label: 'Listed tables' },
  describe_table: { icon: Table2, label: 'Inspected table' },
  search_schema: { icon: Search, label: 'Searched schema' },
  run_query: { icon: Play, label: 'Ran query' },
  write_to_editor: { icon: FileDiff, label: 'Proposed edit' },
}

function ToolCard({ p }: { p: Extract<Part, { type: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  if (p.name === 'write_to_editor') return null
  const meta = TOOL_META[p.name] ?? { icon: Sparkles, label: p.name }
  const Icon = meta.icon
  const data = p.data as { sql?: string; columns?: { name: string }[]; rows?: unknown[][] } | undefined
  const detail = p.name === 'describe_table' ? String(p.args.table ?? '') : p.name === 'search_schema' ? `“${p.args.query}”` : p.name === 'list_tables' ? String(p.args.database ?? '') : ''
  const expandable = p.name === 'run_query'
  return (
    <div className={clsx('overflow-hidden rounded-lg border text-[12px] transition-colors', p.status === 'error' ? 'border-bad/30 bg-bad-soft' : 'border-line bg-raised/50')}>
      <button onClick={() => expandable && setOpen(!open)} className={clsx('flex w-full items-center gap-2 px-2.5 py-1.5 text-left', expandable && 'hover:bg-hover/60')}>
        {p.status === 'running' ? <Spinner className="h-3 w-3 text-ai" /> : <Icon size={12} className={p.status === 'error' ? 'text-bad' : 'text-ai'} />}
        <span className="shrink-0 font-medium">{meta.label}</span>
        {detail && <span className="mono truncate text-muted">{detail}</span>}
        <span className={clsx('ml-auto shrink-0 truncate pl-2 text-[11px]', p.status === 'error' ? 'text-bad' : 'text-faint')} style={{ maxWidth: '55%' }}>
          {p.summary}
        </span>
        {expandable && <ChevronRight size={12} className={clsx('shrink-0 text-faint transition-transform', open && 'rotate-90')} />}
      </button>
      {open && (
        <div className="border-t border-line">
          <pre className="mono max-h-40 overflow-auto px-2.5 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">{String(p.args.sql ?? '')}</pre>
          {data?.columns && data.rows && data.rows.length > 0 && (
            <div className="max-h-48 overflow-auto border-t border-line">
              <table className="mono w-full text-[11px]">
                <thead className="sticky top-0 bg-raised">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c.name} className="border-r border-b border-line px-2 py-1 text-left font-semibold whitespace-nowrap">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} className={clsx('max-w-48 truncate border-r border-b border-line/60 px-2 py-0.5 whitespace-nowrap', v === null && 'text-faint italic')}>
                          {cellText(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-1 border-t border-line px-2 py-1.5">
            <Button size="sm" variant="ghost" icon={<CornerDownLeft size={12} />} onClick={() => appendStatement(String(p.args.sql).trim().replace(/;?$/, ';'))}>
              Add to editor
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditCard({ p }: { p: Extract<Part, { type: 'edit' }> }) {
  const worksheetId = useApp((s) => s.activeTabId)
  const pending = useApp((s) => (worksheetId ? s.pendingEdits[worksheetId] : undefined))
  const isPending = pending?.id === p.id
  return (
    <div className={clsx('overflow-hidden rounded-lg border', isPending ? 'border-ai/40 bg-ai-soft' : 'border-line bg-raised/50')}>
      <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
        <FileDiff size={13} className="shrink-0 text-ai" />
        <span className="min-w-0 flex-1 truncate font-medium">{p.explanation ?? 'Proposed an edit'}</span>
        {isPending ? (
          <span className="flex items-center gap-1 text-[11px] text-ai">
            <Eye size={11} /> Review in editor
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-faint">
            <Check size={11} /> Reviewed
          </span>
        )}
      </div>
      <pre className="mono max-h-36 overflow-auto border-t border-line/70 px-2.5 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">{p.sql}</pre>
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const isSql = !lang || /sql/i.test(lang)
  return (
    <div className="group my-2 overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="flex items-center gap-1 border-b border-line px-2.5 py-1 text-[10.5px] text-faint">
        <span className="flex-1 tracking-wide uppercase">{lang || 'sql'}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code)
            toast.success('Copied')
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-fg"
        >
          <Copy size={11} /> Copy
        </button>
        {isSql && (
          <button onClick={() => appendStatement(code.trim())} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-fg">
            <CornerDownLeft size={11} /> Insert
          </button>
        )}
      </div>
      <pre className="mono overflow-x-auto px-3 py-2 text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-ai text-fg/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? '')?.[1]
            const code = String(children).replace(/\n$/, '')
            if (lang || code.includes('\n')) return <CodeBlock code={code} lang={lang} />
            return <code>{children}</code>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

function Composer({ worksheetId, streaming }: { worksheetId: string; streaming: boolean }) {
  const [text, setText] = useState('')
  const [chips, setChips] = useState<string[]>([])
  const ta = useRef<HTMLTextAreaElement>(null)

  const refreshChips = () => setChips(buildContext(worksheetId).chips)
  useEffect(() => {
    refreshChips()
    const onFocus = () => {
      refreshChips()
      ta.current?.focus()
    }
    const onAsk = (e: Event) => void useAi.getState().send(worksheetId, (e as CustomEvent<string>).detail)
    window.addEventListener(AI_FOCUS, onFocus)
    window.addEventListener(AI_ASK, onAsk)
    return () => {
      window.removeEventListener(AI_FOCUS, onFocus)
      window.removeEventListener(AI_ASK, onAsk)
    }
  }, [worksheetId])

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  const send = () => {
    if (!text.trim() || streaming) return
    void useAi.getState().send(worksheetId, text.trim())
    setText('')
  }

  return (
    <div className="shrink-0 p-3 pt-0">
      <div className="rounded-xl border border-line-strong bg-canvas transition-colors focus-within:border-ai/60 focus-within:shadow-[0_0_0_3px_var(--c-ai-soft)]">
        {!!chips.length && (
          <div className="flex flex-wrap gap-1 px-2.5 pt-2">
            {chips.map((c) => (
              <span key={c} className={clsx('rounded px-1.5 py-0.5 text-[10.5px] font-medium', c === 'Last error' ? 'bg-bad-soft text-bad' : 'bg-hover text-muted')}>
                {c}
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          value={text}
          onFocus={refreshChips}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          placeholder="Ask about your data, or describe a query…"
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className="flex items-center gap-1 text-[10.5px] text-faint">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd> from editor
          </span>
          <div className="flex-1" />
          {streaming ? (
            <button onClick={() => useAi.getState().stop(worksheetId)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-fg text-canvas hover:opacity-85" aria-label="Stop">
              <Square size={11} className="fill-current" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim()}
              aria-label="Send"
              className="ai-gradient flex h-7 w-7 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
