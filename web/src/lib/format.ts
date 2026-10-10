export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function fmtNumber(n: number): string {
  return n.toLocaleString()
}

export function fmtCompact(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const NUMERIC = /^(u?int|tinyint|smallint|mediumint|bigint|decimal|numeric|number|float|double|real|fixed|long|longlong|newdecimal|short|tiny|int24|year|nullable\((u?int|float|decimal))/i

export const isNumericType = (type: string) => NUMERIC.test(type.replace(/^Nullable\(|^LowCardinality\(/i, ''))

const TEMPORAL = /(date|time|timestamp)/i
export const isTemporalType = (type: string) => TEMPORAL.test(type)

export function toCsv(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}

export function toTsv(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => cellText(v).replace(/[\t\n]/g, ' ')
  return [columns.join('\t'), ...rows.map((r) => r.map(esc).join('\t'))].join('\n')
}

export function toMarkdown(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => cellText(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}

export function download(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl'
