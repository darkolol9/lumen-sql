import { AlertTriangle, KeyRound, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '../store/app'
import { ModelPicker } from './ModelPicker'
import { Button, Dialog, Field, Input, Toggle } from './ui'

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen)
  const settings = useApp((s) => s.settings)
  const theme = useApp((s) => s.theme)
  const close = () => useApp.setState({ settingsOpen: false })
  const [key, setKey] = useState('')
  const [maxRows, setMaxRows] = useState(settings.maxRows)
  useEffect(() => {
    if (open) {
      setKey('')
      setMaxRows(settings.maxRows)
    }
  }, [open, settings.maxRows])

  const save = async () => {
    await useApp.getState().updateSettings({ ...(key.trim() ? { openrouterKey: key.trim() } : {}), maxRows: Math.max(1, Math.min(maxRows || 10000, 500000)) })
    toast.success('Settings saved')
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<Settings size={16} className="text-accent" />}
      title="Settings"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold tracking-wide text-faint uppercase">AI assistant</h3>
          <Field
            label="OpenRouter API key"
            hint={
              settings.hasOpenrouterKey ? (
                <span className="flex items-center gap-2">
                  A key is saved (encrypted).
                  <button className="text-bad hover:underline" onClick={() => useApp.getState().updateSettings({ openrouterKey: '' }).then(() => toast('Key removed'))}>
                    Remove
                  </button>
                </span>
              ) : (
                <a className="text-accent hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                  Create a key →
                </a>
              )
            }
          >
            <div className="relative">
              <KeyRound size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
              <Input type="password" className="pl-8" value={key} onChange={(e) => setKey(e.target.value)} placeholder={settings.hasOpenrouterKey ? '•••••••••••• (saved) — paste to replace' : 'sk-or-v1-…'} />
            </div>
          </Field>
          {settings.hasOpenrouterKey && (
            <Field label="Model">
              <div className="flex">
                <ModelPicker />
              </div>
            </Field>
          )}
          <Toggle
            checked={settings.aiAutoRun}
            onChange={(v) => useApp.getState().updateSettings({ aiAutoRun: v })}
            label="Let the assistant run read-only queries"
            description="It samples data and validates SQL before proposing it. Writes are always blocked for the AI."
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold tracking-wide text-faint uppercase">Editor & results</h3>
          <Field label="Max rows fetched per query" hint="Larger results are truncated in the grid.">
            <Input type="number" value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))} className="w-40" />
          </Field>
          <Field label="Theme">
            <div className="flex w-fit gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => useApp.getState().setPrefs({ theme: t })}
                  className={`rounded-md px-4 py-1 text-[12px] font-medium capitalize ${theme === t ? 'bg-active text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </section>
      </div>
    </Dialog>
  )
}

export function ConfirmDialog() {
  const confirm = useApp((s) => s.confirm)
  return (
    <Dialog
      open={!!confirm}
      onClose={() => confirm?.resolve(false)}
      width={460}
      icon={<AlertTriangle size={16} className="text-warn" />}
      title={confirm?.title}
      footer={
        <>
          {/* focus the safe choice so a stray Enter never runs a destructive action */}
          <Button variant="secondary" autoFocus onClick={() => confirm?.resolve(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => confirm?.resolve(true)}>
            {confirm?.action}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{confirm?.body}</p>
    </Dialog>
  )
}
