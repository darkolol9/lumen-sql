import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { DbType } from '../../../shared/types'
import { DB_META } from '../lib/dialect'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }
>(function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-all duration-150 select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_6px_18px_-6px_var(--c-accent)]',
        variant === 'secondary' && 'bg-raised text-fg border border-line-strong hover:bg-hover hover:border-faint/40',
        variant === 'ghost' && 'text-muted hover:text-fg hover:bg-hover',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        variant === 'ai' && 'ai-gradient text-white hover:brightness-110 shadow-[0_6px_20px_-8px_#818cf8]',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export function IconButton({
  className,
  active,
  tip,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tip?: string }) {
  return (
    <Tooltip tip={tip}>
      <button
        aria-label={tip}
        className={clsx(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40',
          active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-8 w-full rounded-md border border-line-strong bg-canvas px-2.5 text-[13px] text-fg placeholder:text-faint',
        'transition-colors outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...rest}
    />
  )
})

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="group flex w-full items-start gap-3 text-left">
      <span
        className={clsx(
          'relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong group-hover:bg-faint/50',
        )}
      >
        <span className={clsx('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[16px]' : 'translate-x-[2px]')} />
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] font-medium">{label}</span>
        {description && <span className="text-[12px] text-muted">{description}</span>}
      </span>
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-strong bg-raised px-1 font-sans text-[10.5px] font-medium text-muted">
      {children}
    </kbd>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'h-3.5 w-3.5')} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function DbIcon({ type, className }: { type: DbType; className?: string }) {
  const c = DB_META[type].color
  if (type === 'snowflake')
    return (
      <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', className)} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5" />
      </svg>
    )
  if (type === 'clickhouse')
    return (
      <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', className)} fill={c}>
        <rect x="3" y="3" width="2.6" height="18" rx="0.6" />
        <rect x="7.6" y="3" width="2.6" height="18" rx="0.6" />
        <rect x="12.2" y="3" width="2.6" height="18" rx="0.6" />
        <rect x="16.8" y="3" width="2.6" height="18" rx="0.6" />
        <rect x="21" y="9.5" width="2" height="5" rx="0.5" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" className={clsx('h-4 w-4', className)} fill="none" stroke={c} strokeWidth="2">
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  )
}

/** Hover tooltip rendered in a portal so it never gets clipped. */
export function Tooltip({ tip, children, side = 'bottom' }: { tip?: ReactNode; children: ReactNode; side?: 'bottom' | 'right' | 'top' }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  if (!tip) return <>{children}</>
  const show = () => {
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos(
        side === 'right'
          ? { x: r.right + 8, y: r.top + r.height / 2 }
          : side === 'top'
            ? { x: r.left + r.width / 2, y: r.top - 8 }
            : { x: r.left + r.width / 2, y: r.bottom + 6 },
      )
    }, 350)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setPos(null)
  }
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="contents">
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] animate-fade-in rounded-md border border-line-strong bg-raised px-2 py-1 text-[11.5px] whitespace-nowrap text-fg shadow-lg"
            style={{
              left: pos.x,
              top: pos.y,
              transform: side === 'right' ? 'translateY(-50%)' : side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
            }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </span>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-[8vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="flex max-h-[84vh] flex-col overflow-hidden rounded-xl border border-line-strong bg-panel"
            style={{ width, boxShadow: 'var(--shadow-pop)' }}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.9, 0.3, 1] }}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
              {icon}
              <div className="flex-1 text-[14px] font-semibold">{title}</div>
              <IconButton onClick={onClose} tip="Close">
                <X size={15} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-raised/50 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Anchored dropdown menu / popover. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  side = 'bottom',
  width,
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end'
  /** 'right' opens beside the anchor, bottom-aligned with it (for buttons low on the rail). */
  side?: 'bottom' | 'right'
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y?: number; bottom?: number; maxH: number }>()
  useLayoutEffect(() => {
    if (!open || !anchor) return
    const r = anchor.getBoundingClientRect()
    const w = width ?? 240
    if (side === 'right') {
      setPos({ x: Math.min(r.right + 8, window.innerWidth - w - 8), bottom: Math.max(8, window.innerHeight - r.bottom), maxH: r.bottom - 16 })
      return
    }
    let x = align === 'end' ? r.right - w : r.left
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    setPos({ x, y: r.bottom + 4, maxH: window.innerHeight - r.bottom - 16 })
  }, [open, anchor, align, side, width])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, anchor, onClose])
  if (!open || !pos) return null
  return createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="fixed z-50 animate-pop overflow-y-auto rounded-lg border border-line-strong bg-raised py-1"
      style={{ left: pos.x, top: pos.y, bottom: pos.bottom, width: width ?? 240, maxHeight: pos.maxH, boxShadow: 'var(--shadow-pop)' }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function MenuItem({
  icon,
  children,
  hint,
  onClick,
  danger,
  active,
}: {
  icon?: ReactNode
  children: ReactNode
  hint?: ReactNode
  onClick?: () => void
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-hover',
        danger ? 'text-bad' : 'text-fg',
        active && 'bg-accent-soft',
      )}
    >
      {icon && <span className="flex w-4 justify-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'ok' | 'bad' | 'accent' | 'ai'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10.5px] font-semibold tracking-wide uppercase',
        tone === 'neutral' && 'bg-hover text-muted',
        tone === 'warn' && 'bg-warn/12 text-warn',
        tone === 'ok' && 'bg-ok/12 text-ok',
        tone === 'bad' && 'bg-bad/12 text-bad',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'ai' && 'bg-ai-soft text-ai',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Inline text that turns into an input on double click. */
export function EditableText({ value, onSave, className, editing: editingProp, onEditingChange }: { value: string; onSave: (v: string) => void; className?: string; editing?: boolean; onEditingChange?: (v: boolean) => void }) {
  const [editingState, setEditingState] = useState(false)
  const editing = editingProp ?? editingState
  const setEditing = (v: boolean) => (onEditingChange ? onEditingChange(v) : setEditingState(v))
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value, editing])
  if (!editing)
    return (
      <span className={clsx('truncate', className)} onDoubleClick={() => setEditing(true)}>
        {value}
      </span>
    )
  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== value) onSave(draft.trim())
  }
  return (
    <input
      autoFocus
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
        e.stopPropagation()
      }}
      className={clsx('min-w-0 rounded border border-accent bg-canvas px-1 outline-none', className)}
    />
  )
}
