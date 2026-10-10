import clsx from 'clsx'
import { CheckCircle2, Lock, PlugZap, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SECRET_MASK, type Connection, type ConnectionConfig, type DbType, type SnowflakeAuth } from '../../../shared/types'
import { api } from '../lib/api'
import { DB_META } from '../lib/dialect'
import { useApp } from '../store/app'
import { Button, DbIcon, Dialog, Field, Input, Spinner, Toggle } from './ui'

const COLORS = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#94a3b8']

const blank = (type: DbType): Partial<Connection> => ({
  name: '',
  type,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  readOnly: false,
  config: type === 'snowflake' ? { auth: 'password' } : { host: 'localhost', port: DB_META[type].defaultPort },
})

type TestState = { status: 'idle' | 'testing' } | { status: 'ok'; message: string } | { status: 'error'; message: string }

export function ConnectionDialog() {
  const { open, editing } = useApp((s) => s.connectionDialog)
  const close = () => useApp.setState({ connectionDialog: { open: false } })
  const [draft, setDraft] = useState<Partial<Connection> | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(editing ? structuredClone(editing) : null)
      setTest({ status: 'idle' })
    }
  }, [open, editing])

  const set = (patch: Partial<Connection>) => setDraft((d) => ({ ...d!, ...patch }))
  const setCfg = (patch: Partial<ConnectionConfig>) => {
    setDraft((d) => ({ ...d!, config: { ...d!.config, ...patch } }))
    setTest({ status: 'idle' })
  }

  const runTest = async () => {
    if (!draft) return
    setTest({ status: 'testing' })
    try {
      const r = await api.testConnection(draft)
      setTest(r.ok ? { status: 'ok', message: `${r.version} · ${r.elapsedMs}ms` } : { status: 'error', message: r.error ?? 'Failed' })
    } catch (e) {
      setTest({ status: 'error', message: (e as Error).message })
    }
  }

  const save = async () => {
    if (!draft) return
    const name = draft.name?.trim() || defaultName(draft)
    setSaving(true)
    try {
      const saved = await useApp.getState().saveConnection({ ...draft, name })
      toast.success(`${editing ? 'Updated' : 'Added'} ${saved.name}`)
      // point the active worksheet at a brand new connection
      const s = useApp.getState()
      const ws = s.activeTabId ? s.worksheets[s.activeTabId] : undefined
      if (!editing && ws) s.updateWorksheet(ws.id, { connectionId: saved.id, database: saved.config.database || undefined, schema: saved.config.schema || undefined })
      close()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    if (!(await useApp.getState().askConfirm({ title: 'Delete connection?', body: `“${editing.name}” will be removed. Worksheets using it are kept.`, action: 'Delete' }))) return
    await useApp.getState().deleteConnection(editing.id)
    close()
  }

  const c = draft?.config ?? {}
  const valid = draft?.type === 'snowflake' ? !!(c.account && c.user) : !!c.host

  return (
    <Dialog
      open={open}
      onClose={close}
      width={draft ? 560 : 600}
      icon={<PlugZap size={16} className="text-accent" />}
      title={editing ? `Edit ${editing.name}` : draft ? `New ${DB_META[draft.type!].label} connection` : 'New connection'}
      footer={
        draft && (
          <>
            {editing && (
              <Button variant="ghost" className="mr-auto text-bad hover:text-bad" icon={<Trash2 size={13} />} onClick={remove}>
                Delete
              </Button>
            )}
            {!editing && (
              <Button variant="ghost" className="mr-auto" onClick={() => setDraft(null)}>
                Back
              </Button>
            )}
            <Button onClick={runTest} disabled={!valid || test.status === 'testing'}>
              {test.status === 'testing' ? <Spinner /> : null} Test
            </Button>
            <Button variant="primary" onClick={save} disabled={!valid || saving}>
              {saving ? <Spinner /> : null} {editing ? 'Save' : 'Connect'}
            </Button>
          </>
        )
      }
    >
      {!draft ? (
        <div className="grid grid-cols-3 gap-3 py-2">
          {(Object.keys(DB_META) as DbType[]).map((t) => (
            <button
              key={t}
              onClick={() => setDraft(blank(t))}
              className="group flex flex-col items-center gap-3 rounded-xl border border-line-strong bg-raised px-4 py-6 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-hover hover:shadow-[0_10px_30px_-12px_var(--c-accent)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas ring-1 ring-line-strong transition-transform group-hover:scale-105">
                <DbIcon type={t} className="h-6 w-6" />
              </div>
              <span className="text-[13.5px] font-semibold">{DB_META[t].label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Field label="Name" className="flex-1">
              <Input autoFocus value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder={defaultName(draft)} />
            </Field>
            <Field label="Color">
              <div className="flex h-8 items-center gap-1">
                {COLORS.slice(0, 7).map((col) => (
                  <button
                    key={col}
                    onClick={() => set({ color: col })}
                    className={clsx('h-5 w-5 rounded-full transition-transform hover:scale-110', draft.color === col && 'ring-2 ring-fg ring-offset-2 ring-offset-panel')}
                    style={{ background: col }}
                  />
                ))}
              </div>
            </Field>
          </div>

          {draft.type === 'snowflake' ? <SnowflakeFields c={c} setCfg={setCfg} /> : <HostFields type={draft.type!} c={c} setCfg={setCfg} />}

          <div className={clsx('rounded-lg border p-3 transition-colors', draft.readOnly ? 'border-warn/40 bg-warn/5' : 'border-line bg-raised/50')}>
            <Toggle
              checked={!!draft.readOnly}
              onChange={(v) => set({ readOnly: v })}
              label="Read-only connection"
              description={
                draft.type === 'clickhouse'
                  ? 'Only SELECT/SHOW/DESCRIBE/EXPLAIN run. Also enforced server-side with readonly=2.'
                  : draft.type === 'mysql'
                    ? 'Only SELECT/SHOW/DESCRIBE/EXPLAIN run. Sessions also use READ ONLY transactions.'
                    : 'Only SELECT/SHOW/DESCRIBE/EXPLAIN/LIST run. Pair with a read-only role for full protection.'
              }
            />
          </div>

          {test.status === 'ok' && (
            <div className="flex animate-fade-in items-center gap-2 rounded-lg border border-ok/30 bg-ok/8 px-3 py-2 text-[12.5px] text-ok">
              <CheckCircle2 size={15} /> Connected · {test.message}
            </div>
          )}
          {test.status === 'error' && (
            <div className="flex animate-fade-in items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
              <XCircle size={15} className="mt-0.5 shrink-0" />
              <span className="break-words">{test.message}</span>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function defaultName(d: Partial<Connection>) {
  const c = d.config ?? {}
  if (d.type === 'snowflake') return c.account ? `${c.account}` : 'Snowflake'
  return `${DB_META[d.type!].label} · ${c.host ?? 'localhost'}`
}

/** Password-like input that shows "saved" for stored secrets without ever receiving them. */
function SecretInput({ value, onChange, placeholder, multiline }: { value?: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const saved = value === SECRET_MASK
  if (multiline)
    return (
      <textarea
        value={saved ? '' : (value ?? '')}
        onChange={(e) => onChange(e.target.value || (saved ? SECRET_MASK : ''))}
        placeholder={saved ? '•••••• saved — paste to replace' : placeholder}
        rows={4}
        className="mono w-full rounded-md border border-line-strong bg-canvas px-2.5 py-2 text-[11.5px] outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    )
  return (
    <div className="relative">
      <Input
        type="password"
        value={saved ? '' : (value ?? '')}
        onChange={(e) => onChange(e.target.value || (saved ? SECRET_MASK : ''))}
        placeholder={saved ? '•••••••• (saved)' : placeholder}
        autoComplete="new-password"
      />
      {saved && <Lock size={12} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint" />}
    </div>
  )
}

function HostFields({ type, c, setCfg }: { type: DbType; c: ConnectionConfig; setCfg: (p: Partial<ConnectionConfig>) => void }) {
  return (
    <>
      <div className="flex gap-3">
        <Field label={type === 'clickhouse' ? 'Host' : 'Host'} className="flex-1">
          <Input value={c.host ?? ''} onChange={(e) => setCfg({ host: e.target.value })} placeholder={type === 'clickhouse' ? 'abc123.eu-west-1.aws.clickhouse.cloud' : 'localhost'} />
        </Field>
        <Field label="Port" className="w-24">
          <Input type="number" value={c.port ?? ''} onChange={(e) => setCfg({ port: e.target.value ? Number(e.target.value) : undefined })} placeholder={String(type === 'clickhouse' && c.ssl ? 8443 : DB_META[type].defaultPort)} />
        </Field>
      </div>
      <div className="flex gap-3">
        <Field label="User" className="flex-1">
          <Input value={c.user ?? ''} onChange={(e) => setCfg({ user: e.target.value })} placeholder={type === 'clickhouse' ? 'default' : 'root'} autoComplete="off" />
        </Field>
        <Field label="Password" className="flex-1">
          <SecretInput value={c.password} onChange={(v) => setCfg({ password: v })} />
        </Field>
      </div>
      <div className="flex items-end gap-3">
        <Field label="Default database" className="flex-1" hint="Optional — you can switch per worksheet.">
          <Input value={c.database ?? ''} onChange={(e) => setCfg({ database: e.target.value })} placeholder={type === 'clickhouse' ? 'default' : 'optional'} />
        </Field>
        <div className="flex-1 pb-6">
          <Toggle
            checked={!!c.ssl}
            onChange={(v) => setCfg({ ssl: v, ...(type === 'clickhouse' && (!c.port || c.port === 8123 || c.port === 8443) ? { port: v ? 8443 : 8123 } : {}) })}
            label={type === 'clickhouse' ? 'HTTPS' : 'Use SSL/TLS'}
          />
        </div>
      </div>
    </>
  )
}

const AUTHS: [SnowflakeAuth, string][] = [
  ['password', 'Password'],
  ['keypair', 'Key pair'],
  ['pat', 'Access token'],
  ['sso', 'Browser SSO'],
]

function SnowflakeFields({ c, setCfg }: { c: ConnectionConfig; setCfg: (p: Partial<ConnectionConfig>) => void }) {
  const auth = c.auth ?? 'password'
  return (
    <>
      <div className="flex gap-3">
        <Field label="Account identifier" className="flex-1" hint="e.g. myorg-myaccount or xy12345.eu-west-1">
          <Input value={c.account ?? ''} onChange={(e) => setCfg({ account: e.target.value.trim() })} placeholder="myorg-myaccount" />
        </Field>
        <Field label="User" className="flex-1">
          <Input value={c.user ?? ''} onChange={(e) => setCfg({ user: e.target.value })} autoComplete="off" />
        </Field>
      </div>
      <Field label="Authentication">
        <div className="flex gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line">
          {AUTHS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCfg({ auth: k })}
              className={clsx('flex-1 rounded-md py-1 text-[12px] font-medium transition-colors', auth === k ? 'bg-active text-fg shadow-sm' : 'text-muted hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      {auth === 'password' && (
        <Field label="Password">
          <SecretInput value={c.password} onChange={(v) => setCfg({ password: v })} />
        </Field>
      )}
      {auth === 'keypair' && (
        <>
          <Field label="Private key (PEM)">
            <SecretInput multiline value={c.privateKey} onChange={(v) => setCfg({ privateKey: v })} placeholder={'-----BEGIN PRIVATE KEY-----\n…'} />
          </Field>
          <Field label="Key passphrase" hint="Only for encrypted keys">
            <SecretInput value={c.privateKeyPass} onChange={(v) => setCfg({ privateKeyPass: v })} />
          </Field>
        </>
      )}
      {auth === 'pat' && (
        <Field label="Programmatic access token">
          <SecretInput value={c.token} onChange={(v) => setCfg({ token: v })} />
        </Field>
      )}
      {auth === 'sso' && <div className="rounded-lg bg-raised px-3 py-2 text-[12px] text-muted">A browser window opens for your identity provider on first use. The session is shared across worksheets.</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Warehouse">
          <Input value={c.warehouse ?? ''} onChange={(e) => setCfg({ warehouse: e.target.value })} placeholder="COMPUTE_WH" />
        </Field>
        <Field label="Role">
          <Input value={c.role ?? ''} onChange={(e) => setCfg({ role: e.target.value })} placeholder="default role" />
        </Field>
        <Field label="Database">
          <Input value={c.database ?? ''} onChange={(e) => setCfg({ database: e.target.value })} placeholder="optional" />
        </Field>
        <Field label="Schema">
          <Input value={c.schema ?? ''} onChange={(e) => setCfg({ schema: e.target.value })} placeholder="optional" />
        </Field>
      </div>
    </>
  )
}
