import { useState } from 'react'

function CategoryEditor({ category, onSave, disabled }) {
  const [label, setLabel] = useState(category.label)
  const [enabled, setEnabled] = useState(category.enabled)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { await onSave(category, { label: label.trim(), enabled }); setMessage('Saved.') }
    catch (error) { setMessage(error.message || 'Could not save category.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="border border-darkBorder rounded-xl p-4 space-y-3">
    <p className="text-xs text-slate-400">Stable ID: {category.id}</p>
    <label className="block">Category name<input aria-label={`Name for ${category.id}`} required maxLength={60} value={label} onChange={e => setLabel(e.target.value)} className="block w-full mt-1 rounded-lg bg-darkBg border border-darkBorder px-3 py-2" /></label>
    <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enabled for new reports</label>
    <button disabled={disabled || busy || !label.trim()} className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-50">{busy ? 'Saving…' : 'Save category'}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
export default function SettingsView({ categories, onSave, error, onRefresh, live }) {
  const [message, setMessage] = useState('')
  async function save(category, patch) {
    setMessage('')
    await onSave(category, patch)
    setMessage(`Saved ${category.id}.`)
  }
  return <main className="flex-1 p-6 overflow-y-auto space-y-4 text-sm">
    <h2 className="text-xl font-bold">Category settings</h2>
    <p className="text-slate-400">Rename or enable existing categories. Disabled categories remain visible on historical reports. Names apply to historical displays; report IDs, icons and colors stay the same. Changes are audited. Keep at least one category enabled.</p>
    {!live && <p role="status">Connect and sign in as an Administrator to manage shared categories.</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button onClick={onRefresh} disabled={!live} className="border border-darkBorder rounded-lg px-4 py-2">Refresh categories</button>
    <div className="grid gap-4 max-w-4xl md:grid-cols-2">{categories.map(category => <CategoryEditor key={`${category.id}:${category.version}`} category={category} onSave={save} disabled={!live || Boolean(error)} />)}</div>
  </main>
}
