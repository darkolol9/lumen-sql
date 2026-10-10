import type { DbType } from './types.ts'

export type TokenKind = 'word' | 'string' | 'ident' | 'number' | 'punct' | 'comment' | 'space'

export interface Token {
  kind: TokenKind
  text: string
  start: number
  end: number
}

/**
 * Small dialect-aware SQL lexer. It only needs to be good enough to tell code
 * apart from strings / comments / quoted identifiers, which is what statement
 * splitting, the read-only guard and autocomplete context all depend on.
 */
export function tokenize(sql: string, dialect: DbType = 'mysql'): Token[] {
  const tokens: Token[] = []
  const n = sql.length
  const hashComments = dialect !== 'snowflake'
  let i = 0
  const push = (kind: TokenKind, start: number, end: number) =>
    tokens.push({ kind, text: sql.slice(start, end), start, end })

  while (i < n) {
    const c = sql[i]
    const c2 = sql[i + 1]
    const start = i

    if (/\s/.test(c)) {
      while (i < n && /\s/.test(sql[i])) i++
      push('space', start, i)
    } else if ((c === '-' && c2 === '-') || (hashComments && c === '#') || (c === '/' && c2 === '/' && dialect === 'snowflake')) {
      while (i < n && sql[i] !== '\n') i++
      push('comment', start, i)
    } else if (c === '/' && c2 === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? n : close + 2
      push('comment', start, i)
    } else if (c === '$' && c2 === '$') {
      const close = sql.indexOf('$$', i + 2)
      i = close === -1 ? n : close + 2
      push('string', start, i)
    } else if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < n) {
        if (sql[i] === '\\' && c === "'") {
          i += 2
          continue
        }
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      push(c === "'" ? 'string' : 'ident', start, Math.min(i, n))
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 ?? ''))) {
      while (i < n && /[0-9a-fA-FxX._eE]/.test(sql[i])) i++
      push('number', start, i)
    } else if (/[A-Za-z_À-￿@]/.test(c)) {
      i++
      while (i < n && /[A-Za-z0-9_$À-￿]/.test(sql[i])) i++
      push('word', start, i)
    } else {
      i++
      push('punct', start, i)
    }
  }
  return tokens
}

export interface Statement {
  text: string
  start: number
  end: number
}

/** Split a script into statements on top-level semicolons. Comment-only chunks are dropped. */
export function splitStatements(sql: string, dialect: DbType = 'mysql'): Statement[] {
  const tokens = tokenize(sql, dialect)
  const out: Statement[] = []
  let chunkStart = 0
  let hasCode = false
  let firstCode = -1
  let lastCode = -1

  const flush = (endExclusive: number) => {
    if (hasCode) out.push({ text: sql.slice(firstCode, lastCode), start: firstCode, end: lastCode })
    hasCode = false
    firstCode = -1
    lastCode = -1
    chunkStart = endExclusive
  }

  for (const t of tokens) {
    if (t.kind === 'punct' && t.text === ';') {
      flush(t.end)
      continue
    }
    if (t.kind === 'space' || t.kind === 'comment') continue
    if (!hasCode) firstCode = t.start
    hasCode = true
    lastCode = t.end
  }
  flush(sql.length)
  void chunkStart
  return out
}

/** The statement the cursor is in (or the closest one before it). */
export function statementAt(sql: string, offset: number, dialect: DbType = 'mysql'): Statement | undefined {
  const stmts = splitStatements(sql, dialect)
  if (!stmts.length) return undefined
  let best: Statement | undefined
  for (const s of stmts) {
    if (offset >= s.start && offset <= s.end + 1) return s
    if (s.start <= offset) best = s
  }
  return best ?? stmts[0]
}

const codeWords = (stmt: string, dialect: DbType) =>
  tokenize(stmt, dialect)
    .filter((t) => t.kind === 'word' || t.kind === 'punct')
    .map((t) => (t.kind === 'word' ? t.text.toUpperCase() : t.text))

export function firstKeyword(stmt: string, dialect: DbType = 'mysql'): string {
  return codeWords(stmt, dialect).find((w) => /^[A-Z]/.test(w)) ?? ''
}

const READ_LEADERS = new Set(['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'USE', 'VALUES', 'TABLE', 'EXISTS', 'LIST', 'LS', 'SET'])

/** Words that turn an otherwise read-leading statement into a write (WITH … INSERT, SELECT … INTO OUTFILE, FOR UPDATE). */
const WRITE_WORDS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'INTO', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'CALL', 'LOCK',
])

export interface GuardResult {
  ok: boolean
  reason?: string
}

/**
 * Conservative allow-list check: a statement is read-only only if it starts with a
 * read keyword and contains no write keyword anywhere outside strings/comments.
 */
export function checkReadOnly(stmt: string, dialect: DbType = 'mysql'): GuardResult {
  const words = codeWords(stmt, dialect)
  const lead = words.find((w) => /^[A-Z]/.test(w))
  if (!lead) return { ok: true }
  if (!READ_LEADERS.has(lead) && words[0] !== '(') {
    return { ok: false, reason: `${lead} statements are not allowed on a read-only connection` }
  }
  if (lead === 'SET') {
    const next = words[1]
    if (['GLOBAL', 'PERSIST', 'PERSIST_ONLY', 'PASSWORD', 'ROLE', 'DEFAULT'].includes(next ?? '')) {
      return { ok: false, reason: `SET ${next} is not allowed on a read-only connection` }
    }
    return { ok: true }
  }
  for (const w of words) {
    if (WRITE_WORDS.has(w)) return { ok: false, reason: `"${w}" is not allowed on a read-only connection` }
  }
  return { ok: true }
}

/** Statements that produce a result set (vs. commands). */
export function returnsRows(stmt: string, dialect: DbType = 'mysql'): boolean {
  const lead = firstKeyword(stmt, dialect)
  return ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'VALUES', 'TABLE', 'EXISTS', 'LIST', 'LS'].includes(lead) ||
    stmt.trimStart().startsWith('(')
}

export type Danger = { level: 'high'; reason: string } | null

/** Flags statements worth a confirmation dialog on writable connections. */
export function dangerOf(stmt: string, dialect: DbType = 'mysql'): Danger {
  const words = codeWords(stmt, dialect)
  const lead = words.find((w) => /^[A-Z]/.test(w))
  if (lead === 'DROP' || lead === 'TRUNCATE') return { level: 'high', reason: `${lead} permanently removes data` }
  if ((lead === 'DELETE' || lead === 'UPDATE') && !words.includes('WHERE')) {
    return { level: 'high', reason: `${lead} without a WHERE clause affects every row` }
  }
  if (lead === 'ALTER' && words.includes('DROP')) return { level: 'high', reason: 'ALTER … DROP removes objects or columns' }
  return null
}

export function quoteIdent(name: string, dialect: DbType): string {
  if (dialect === 'snowflake') return /^[A-Z_][A-Z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : '`' + name.replace(/`/g, '``') + '`'
}
