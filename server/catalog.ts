import type { CatalogTable, DatabaseInfo } from '../shared/types.ts'
import { driverFor, requireConnection } from './drivers/index.ts'

const TTL = 10 * 60_000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cached<T>(key: string, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && !force && Date.now() - hit.at < TTL) return hit.value as Promise<T>
  const value = load()
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

export function databases(connectionId: string, force = false): Promise<DatabaseInfo[]> {
  return cached(`${connectionId}::dbs`, force, () => driverFor(requireConnection(connectionId)).listDatabases())
}

export function catalog(connectionId: string, database: string, force = false): Promise<CatalogTable[]> {
  return cached(`${connectionId}::cat::${database}`, force, () => driverFor(requireConnection(connectionId)).catalog(database))
}

export function invalidateConnection(connectionId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${connectionId}::`)) cache.delete(k)
}

/** Finds a table by (possibly partially qualified) name. Case-insensitive. */
export async function findTable(connectionId: string, name: string, database?: string, schema?: string) {
  const parts = name.split('.').map((p) => p.replace(/^[`"]|[`"]$/g, ''))
  const table = parts.pop()!
  if (parts.length === 2) [database, schema] = parts
  else if (parts.length === 1) {
    const conn = requireConnection(connectionId)
    if (conn.type === 'snowflake') schema = parts[0]
    else database = parts[0]
  }
  if (!database) return undefined
  const tables = await catalog(connectionId, database)
  const eq = (a?: string, b?: string) => !b || a?.toLowerCase() === b.toLowerCase()
  return (
    tables.find((t) => eq(t.name, table) && eq(t.schema, schema)) ?? tables.find((t) => t.name.toLowerCase() === table.toLowerCase())
  )
}
