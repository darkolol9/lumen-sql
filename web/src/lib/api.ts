import type {
  AiContext,
  AiEvent,
  AiMessage,
  CatalogTable,
  Connection,
  DatabaseInfo,
  EditRequest,
  HistoryEntry,
  PublicSettings,
  RunResponse,
  Settings,
  Workspace,
  Worksheet,
} from '../../../shared/types'

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText)
  return json as T
}

export interface ModelInfo {
  id: string
  name: string
  context: number
  promptPrice: number
  completionPrice: number
  created: number
}

export const api = {
  bootstrap: () =>
    req<{ connections: Connection[]; workspaces: Workspace[]; worksheets: Worksheet[]; settings: PublicSettings }>('GET', '/api/bootstrap'),

  saveConnection: (c: Partial<Connection>) => req<Connection>('POST', '/api/connections', c),
  deleteConnection: (id: string) => req('DELETE', `/api/connections/${id}`),
  testConnection: (c: Partial<Connection>) =>
    req<{ ok: boolean; version?: string; error?: string; elapsedMs?: number }>('POST', '/api/connections/test', c),
  databases: (id: string, refresh = false) => req<DatabaseInfo[]>('GET', `/api/connections/${id}/databases${refresh ? '?refresh=1' : ''}`),
  catalog: (id: string, database: string, refresh = false) =>
    req<CatalogTable[]>('GET', `/api/connections/${id}/catalog?database=${encodeURIComponent(database)}${refresh ? '&refresh=1' : ''}`),

  run: (body: { connectionId: string; sql: string; database?: string; schema?: string; runId: string; worksheetId: string }) =>
    req<RunResponse>('POST', '/api/query', body),
  cancel: (runId: string) => req('POST', `/api/query/${runId}/cancel`),
  previewEdits: (body: EditRequest) => req<{ statements: string[] }>('POST', '/api/edits/preview', body),
  applyEdits: (body: EditRequest & { worksheetId?: string }) => req<{ statements: string[]; elapsedMs: number }>('POST', '/api/edits/apply', body),

  saveWorkspace: (w: Partial<Workspace>) => req<Workspace>('POST', '/api/workspaces', w),
  deleteWorkspace: (id: string) => req('DELETE', `/api/workspaces/${id}`),
  saveWorksheet: (w: Partial<Worksheet>) => req<Worksheet>('POST', '/api/worksheets', w),
  deleteWorksheet: (id: string) => req('DELETE', `/api/worksheets/${id}`),

  updateSettings: (s: Partial<Settings>) => req<PublicSettings>('PUT', '/api/settings', s),
  history: () => req<HistoryEntry[]>('GET', '/api/history'),
  clearHistory: () => req('DELETE', '/api/history'),

  models: () => req<ModelInfo[]>('GET', '/api/ai/models'),

  async *chat(body: { messages: AiMessage[]; context: AiContext; model?: string }, signal: AbortSignal): AsyncGenerator<AiEvent> {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) throw new Error(`Assistant unavailable (${res.status})`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (data) yield JSON.parse(data) as AiEvent
      }
    }
  },
}
