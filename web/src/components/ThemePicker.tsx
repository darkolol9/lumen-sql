import clsx from 'clsx'
import { Check, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { THEMES, type ThemeDef } from '../lib/themes'
import { useApp } from '../store/app'

const preview = (id?: string) => useApp.setState({ themePreview: id })
const choose = (id: string) => {
  preview(undefined)
  useApp.getState().setPrefs({ theme: id })
}

/** A tiny editor mock drawn in the theme's own colors. */
function Swatch({ t, className }: { t: ThemeDef; className?: string }) {
  const { ui, syntax } = t
  return (
    <div className={clsx('flex overflow-hidden rounded-md', className)} style={{ background: ui.canvas, boxShadow: `inset 0 0 0 1px ${ui.lineStrong}` }}>
      <div className="flex w-[18%] flex-col items-center gap-[3px] pt-[5px]" style={{ borderRight: `1px solid ${ui.line}` }}>
        <span className="h-[4px] w-[4px] rounded-full" style={{ background: ui.accent }} />
        <span className="h-[4px] w-[4px] rounded-full" style={{ background: ui.faint }} />
        <span className="h-[4px] w-[4px] rounded-full" style={{ background: ui.ai }} />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-[3px] px-[6px]" style={{ background: ui.panel }}>
        <div className="flex gap-[3px]">
          <span className="h-[3px] w-[22%] rounded-full" style={{ background: syntax.keyword }} />
          <span className="h-[3px] w-[30%] rounded-full" style={{ background: ui.fg }} />
        </div>
        <div className="flex gap-[3px] pl-[10%]">
          <span className="h-[3px] w-[18%] rounded-full" style={{ background: syntax.keyword }} />
          <span className="h-[3px] w-[34%] rounded-full" style={{ background: syntax.string }} />
        </div>
        <div className="flex gap-[3px] pl-[10%]">
          <span className="h-[3px] w-[26%] rounded-full" style={{ background: syntax.predefined }} />
          <span className="h-[3px] w-[12%] rounded-full" style={{ background: syntax.number }} />
        </div>
        <span className="h-[3px] w-[40%] rounded-full" style={{ background: syntax.comment }} />
      </div>
    </div>
  )
}

function useFiltered(query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = THEMES.filter((t) => !q || t.name.toLowerCase().includes(q) || (q === 'dark' ? t.dark : q === 'light' ? !t.dark : false))
    return [
      { label: 'Dark', items: list.filter((t) => t.dark) },
      { label: 'Light', items: list.filter((t) => !t.dark) },
    ].filter((g) => g.items.length)
  }, [query])
}

/** Compact searchable list for the rail popover. Hover previews, click applies, arrow keys move through themes. */
export function ThemeList({ onPicked }: { onPicked?: () => void }) {
  const theme = useApp((s) => s.theme)
  const [query, setQuery] = useState('')
  const groups = useFiltered(query)
  const flat = groups.flatMap((g) => g.items)
  const [cursor, setCursor] = useState(-1)
  useEffect(() => () => preview(undefined), [])
  useEffect(() => setCursor(-1), [query])

  const move = (d: number) => {
    if (!flat.length) return
    const i = (cursor + d + flat.length) % flat.length
    setCursor(i)
    preview(flat[i].id)
    document.getElementById(`theme-opt-${flat[i].id}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="flex flex-col" onMouseLeave={() => cursor < 0 && preview(undefined)}>
      <div className="relative px-2 pt-1 pb-1.5">
        <Search size={13} className="absolute top-1/2 left-4.5 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
            else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
            else if (e.key === 'Enter' && flat[Math.max(cursor, 0)]) (choose(flat[Math.max(cursor, 0)].id), onPicked?.())
          }}
          placeholder="Search themes"
          className="h-7 w-full rounded-md border border-line bg-canvas/60 pr-2 pl-7 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
        />
      </div>
      <div className="max-h-[min(460px,70vh)] overflow-y-auto pb-1">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-faint uppercase">{g.label}</div>
            {g.items.map((t) => {
              const i = flat.indexOf(t)
              return (
                <button
                  key={t.id}
                  id={`theme-opt-${t.id}`}
                  onMouseEnter={() => (setCursor(-1), preview(t.id))}
                  onClick={() => (choose(t.id), onPicked?.())}
                  className={clsx('flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] hover:bg-hover', cursor === i && 'bg-hover')}
                >
                  <Swatch t={t} className="h-6 w-10 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {theme === t.id && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>
        ))}
        {!flat.length && <div className="px-3 py-6 text-center text-[12px] text-faint">No themes match</div>}
      </div>
    </div>
  )
}

/** Card grid for the settings dialog. */
export function ThemeGrid() {
  const theme = useApp((s) => s.theme)
  const groups = useFiltered('')
  useEffect(() => () => preview(undefined), [])
  return (
    <div className="flex flex-col gap-3" onMouseLeave={() => preview(undefined)}>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 text-[11px] font-medium text-muted">{g.label}</div>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((t) => (
              <button
                key={t.id}
                onMouseEnter={() => preview(t.id)}
                onClick={() => choose(t.id)}
                className={clsx(
                  'group flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors',
                  theme === t.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-hover',
                )}
              >
                <Swatch t={t} className="h-12 w-full" />
                <span className="flex items-center gap-1 px-0.5 text-[11.5px] font-medium">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {theme === t.id && <Check size={12} className="shrink-0 text-accent" />}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
