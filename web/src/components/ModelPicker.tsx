import clsx from 'clsx'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type ModelInfo } from '../lib/api'
import { useApp } from '../store/app'
import { Popover, Spinner } from './ui'

let cache: Promise<ModelInfo[]> | undefined
export const loadModels = () => (cache ??= api.models().catch((e) => ((cache = undefined), Promise.reject(e))))

const FEATURED = /^(anthropic\/claude|openai\/gpt-5|openai\/o\d|google\/gemini-[3-9]|x-ai\/grok|deepseek|qwen\/qwen3-coder|moonshotai\/kimi)/

export const shortModel = (id: string) => id.split('/').pop()?.replace(/-\d{8}$/, '') ?? id

const price = (n: number) => (n === 0 ? 'free' : n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 1 : 0)}`)

export function ModelPicker({ compact }: { compact?: boolean }) {
  const model = useApp((s) => s.settings.model)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>()
  const [error, setError] = useState<string>()
  const [q, setQ] = useState('')
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    loadModels()
      .then((m) => {
        setModels(m)
        // configured model missing from the catalogue → pick the newest Claude Sonnet
        if (!m.some((x) => x.id === useApp.getState().settings.model)) {
          const fallback = [...m].filter((x) => /^anthropic\/claude-sonnet/.test(x.id)).sort((a, b) => b.created - a.created)[0] ?? m[0]
          if (fallback) void useApp.getState().updateSettings({ model: fallback.id })
        }
      })
      .catch((e) => setError(e.message))
  }, [])

  const list = useMemo(() => {
    if (!models) return []
    const f = q.toLowerCase()
    const matched = models.filter((m) => !f || m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f))
    return matched.sort((a, b) => Number(FEATURED.test(b.id)) - Number(FEATURED.test(a.id)) || b.created - a.created).slice(0, 150)
  }, [models, q])

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(true)}
        className={clsx('flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-[12px] text-muted hover:bg-hover hover:text-fg', !compact && 'border border-line-strong bg-canvas')}
      >
        <span className="truncate">{shortModel(model || 'choose model')}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={360} align="end">
        <div className="relative border-b border-line px-2 pb-1.5">
          <Search size={12} className="absolute top-1/2 left-4 -translate-y-[60%] text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search OpenRouter models…"
            className="h-7 w-full rounded-md bg-canvas/70 pr-2 pl-6 text-[12.5px] outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto py-1">
          {!models && !error && (
            <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-faint">
              <Spinner /> Loading models
            </div>
          )}
          {error && <div className="px-3 py-3 text-[12px] text-bad">{error}</div>}
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setOpen(false)
                void useApp.getState().updateSettings({ model: m.id })
              }}
              className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover', m.id === model && 'bg-accent-soft')}
            >
              <span className="w-3.5 shrink-0">{m.id === model && <Check size={13} className="text-accent" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{m.name}</span>
                <span className="mono block truncate text-[10.5px] text-faint">{m.id}</span>
              </span>
              <span className="shrink-0 text-right text-[10.5px] text-faint tabular-nums">
                <span className="block">{Math.round(m.context / 1000)}k ctx</span>
                <span className="block">
                  {price(m.promptPrice)}/{price(m.completionPrice)}
                </span>
              </span>
            </button>
          ))}
          {models && !list.length && <div className="px-3 py-4 text-center text-[12px] text-faint">No models match</div>}
        </div>
        <div className="border-t border-line px-3 py-1.5 text-[10.5px] text-faint">Prices per 1M tokens (input/output). Only tool-capable models are listed.</div>
      </Popover>
    </>
  )
}
