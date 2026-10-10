import type { CatalogTable, DbType } from '../../../shared/types'
import { tokenize, type Token } from '../../../shared/sql'
import { keywordsFor } from './dialect'

export type Clause = 'select' | 'from' | 'where' | 'group' | 'order' | 'set' | 'insert' | 'other'

export interface TableRef {
  parts: string[]
  alias?: string
  start: number
}

export interface Analysis {
  clause: Clause
  /** Qualifier typed before the current word, e.g. ["o"] for `o.na|` or ["db","sch"] for `db.sch.|`. */
  qualifier: string[]
  refs: TableRef[]
  ctes: string[]
  /** True right after JOIN (to offer join snippets). */
  afterJoin: boolean
}

const CLAUSE_WORDS: Record<string, Clause> = {
  SELECT: 'select',
  FROM: 'from',
  JOIN: 'from',
  UPDATE: 'from',
  INTO: 'insert',
  TABLE: 'from',
  DESCRIBE: 'from',
  DESC: 'from',
  WHERE: 'where',
  ON: 'where',
  AND: 'where',
  OR: 'where',
  HAVING: 'where',
  QUALIFY: 'where',
  PREWHERE: 'where',
  BY: 'group',
  SET: 'set',
  USING: 'where',
  WHEN: 'where',
  THEN: 'select',
  ELSE: 'select',
  CASE: 'select',
}

const unquote = (s: string) => (/^[`"].*[`"]$/.test(s) ? s.slice(1, -1).replace(/""/g, '"').replace(/``/g, '`') : s)

const isIdent = (t?: Token) => !!t && (t.kind === 'word' || t.kind === 'ident')

export function analyze(stmt: string, wordStart: number, dialect: DbType): Analysis {
  const all = tokenize(stmt, dialect).filter((t) => t.kind !== 'space' && t.kind !== 'comment')
  const keywords = new Set(keywordsFor(dialect).map((k) => k.toUpperCase()))

  // qualifier chain before the word being typed: a.b.|
  const qualifier: string[] = []
  {
    const before = all.filter((t) => t.end <= wordStart)
    let i = before.length - 1
    while (i >= 1 && before[i].text === '.' && before[i].end === (qualifier.length ? before[i + 1]?.start : wordStart) && isIdent(before[i - 1])) {
      qualifier.unshift(unquote(before[i - 1].text))
      i -= 2
    }
  }

  // table references: FROM a [AS] x, b y JOIN c ON …
  const refs: TableRef[] = []
  const ctes: string[] = []
  for (let i = 0; i < all.length; i++) {
    const w = all[i].kind === 'word' ? all[i].text.toUpperCase() : ''
    // WITH name AS (   /   , name AS (
    if (isIdent(all[i]) && all[i + 1]?.text.toUpperCase() === 'AS' && all[i + 2]?.text === '(' && ['WITH', ','].includes(all[i - 1]?.text.toUpperCase() ?? '')) {
      ctes.push(unquote(all[i].text))
    }
    if (!['FROM', 'JOIN', 'UPDATE', 'INTO'].includes(w)) continue
    let j = i + 1
    while (j < all.length) {
      if (!isIdent(all[j])) break
      const start = all[j].start
      const parts = [unquote(all[j].text)]
      j++
      while (all[j]?.text === '.' && isIdent(all[j + 1])) {
        parts.push(unquote(all[j + 1].text))
        j += 2
      }
      let alias: string | undefined
      if (all[j]?.kind === 'word' && all[j].text.toUpperCase() === 'AS') j++
      if (isIdent(all[j]) && !keywords.has(all[j].text.toUpperCase())) {
        alias = unquote(all[j].text)
        j++
      }
      refs.push({ parts, alias, start })
      if (all[j]?.text !== ',' || w === 'JOIN') break
      j++
    }
  }

  // clause = nearest clause keyword before the cursor
  let clause: Clause = 'other'
  let afterJoin = false
  const prev = all.filter((t) => t.end <= wordStart)
  for (let i = prev.length - 1; i >= 0; i--) {
    const t = prev[i]
    if (t.kind !== 'word') continue
    const up = t.text.toUpperCase()
    if (up === 'BY') {
      const before = prev[i - 1]?.text.toUpperCase()
      clause = before === 'ORDER' ? 'order' : 'group'
      break
    }
    if (CLAUSE_WORDS[up]) {
      clause = CLAUSE_WORDS[up]
      afterJoin = up === 'JOIN' && i === prev.length - 1
      break
    }
  }
  // `FROM orders o |` – after a complete table ref we are no longer naming a table
  if (clause === 'from' && !qualifier.length) {
    const last = prev[prev.length - 1]
    const lastUp = last?.text.toUpperCase()
    if (last && !['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE', ',', 'DESCRIBE', 'DESC'].includes(lastUp ?? '')) clause = 'other'
  }

  return { clause, qualifier, refs, ctes, afterJoin }
}

/** Resolve a reference (1–3 parts) to a catalog table. */
export function resolveTable(
  parts: string[],
  dialect: DbType,
  ctx: { database?: string; schema?: string },
  lookup: (database: string) => CatalogTable[] | undefined,
): CatalogTable | undefined {
  const eq = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()
  const name = parts[parts.length - 1]
  let db = ctx.database
  let schema: string | undefined = dialect === 'snowflake' ? ctx.schema : undefined
  if (dialect === 'snowflake') {
    if (parts.length === 3) [db, schema] = parts
    else if (parts.length === 2) schema = parts[0]
  } else if (parts.length >= 2) db = parts[parts.length - 2]
  if (!db) return undefined
  const tables = lookup(db) ?? []
  return (
    tables.find((t) => eq(t.name, name) && (!schema || eq(t.schema, schema))) ??
    (parts.length === 1 ? tables.find((t) => eq(t.name, name)) : undefined)
  )
}

/** Short alias for a table name: order_items -> oi, customers -> c */
export function aliasFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .split(/[_\s]+|(?=[A-Z])/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('') || 't'
  let alias = base
  let n = 2
  while (taken.has(alias)) alias = `${base}${n++}`
  return alias
}

const singular = (s: string) => s.toLowerCase().replace(/ies$/, 'y').replace(/(ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '')

/** Guess join conditions between a candidate table and tables already in scope (naming-convention FKs). */
export function guessJoin(
  candidate: CatalogTable,
  scope: { table: CatalogTable; alias: string }[],
  candAlias: string,
): string | undefined {
  const cols = (t: CatalogTable) => new Map(t.columns.map((c) => [c.name.toLowerCase(), c.name]))
  const cc = cols(candidate)
  const candKey = singular(candidate.name)
  for (const { table, alias } of scope) {
    const sc = cols(table)
    const scopeKey = singular(table.name)
    // scope.candidate_id = candidate.id
    const fk1 = sc.get(`${candKey}_id`) ?? sc.get(`${candKey}id`)
    const pk1 = cc.get('id')
    if (fk1 && pk1) return `${candAlias}.${pk1} = ${alias}.${fk1}`
    // candidate.scope_id = scope.id
    const fk2 = cc.get(`${scopeKey}_id`) ?? cc.get(`${scopeKey}id`)
    const pk2 = sc.get('id')
    if (fk2 && pk2) return `${candAlias}.${fk2} = ${alias}.${pk2}`
    // shared *_id column (not for self-joins, where it is almost never what you want)
    if (table.name === candidate.name) continue
    for (const [lc, orig] of cc) {
      if (lc.endsWith('_id') && sc.has(lc)) return `${candAlias}.${orig} = ${alias}.${sc.get(lc)}`
    }
  }
  return undefined
}
