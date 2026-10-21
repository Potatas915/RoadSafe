import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAccounts, saveAccount } from '../backend/accounts.js'

export default function AccountsView({ client, currentUserId }) {
  const [page, setPage] = useState({ data: [], total: 0 })
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const next = await loadAccounts(client, query, offset)
      if (generation.current === request) setPage(next)
    } catch (failure) { if (generation.current === request) setError(failure.message) }
    finally { if (generation.current === request) setLoading(false) }
  }, [client, query, offset])
  useEffect(() => { void reload(); return () => { generation.current++ } }, [reload])
  async function save(patch, reason) {
    if (saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      await saveAccount(client, selected, patch, reason)
      setSelected(null); setMessage('Account changes saved. Current permissions apply to new requests immediately.')
      if (offset) setOffset(0)
      else await reload()
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  return <main className="flex-1 p-6 overflow-y-auto space-y-4">
    <h1 className="text-xl font-bold">Account management</h1>
    <p className="text-sm text-slate-400">Manage existing registered accounts. Reassign active cases before suspending or removing an Officer. Account creation, deletion and password recovery are separate.</p>
    <form onSubmit={e => { e.preventDefault(); setSelected(null); setOffset(0); if (query === search.trim() && offset === 0) void reload(); else setQuery(search.trim()) }} className="flex gap-2">
      <input aria-label="Search accounts" maxLength={120} placeholder="Name, username, unit or account ID" className="flex-1 bg-darkBg border border-darkBorder rounded-lg p-2" value={search} onChange={e => setSearch(e.target.value)} />
      <button disabled={saving} className="bg-orange-700 rounded-lg px-4">Search</button>
      <button type="button" disabled={saving || loading} onClick={() => { setSelected(null); void reload() }} className="bg-slate-800 rounded-lg px-4">Refresh</button>
    </form>
    {error && <p role="alert" className="text-red-300">{error} Refresh before retrying a stale edit.</p>}
    {message && <p role="status" className="text-emerald-300">{message}</p>}
    {loading && <p role="status">Loading accounts…</p>}
    <AccountGroups accounts={page.data} onEdit={setSelected} disabled={saving || loading} />
    {!loading && !page.data.length && <p>No matching accounts.</p>}
    <div className="flex gap-3 text-sm items-center"><button disabled={offset === 0 || loading || saving} onClick={() => { setSelected(null); setOffset(offset - 50) }}>Previous</button><span>{page.total ? `${offset + 1}–${offset + page.data.length} of ${page.total}` : '0 accounts'}</span><button disabled={offset + 50 >= page.total || loading || saving} onClick={() => { setSelected(null); setOffset(offset + 50) }}>Next</button></div>
    {selected && <AccountEditor key={`${selected.id}:${selected.version}`} account={selected} currentUserId={currentUserId} onSave={save} onCancel={() => setSelected(null)} saving={saving} />}
  </main>
}

export function AccountGroups({ accounts, onEdit, disabled }) {
  const groups = [
    { title: 'Users', accounts: accounts.filter(account => account.role === 'Public' && account.requestedAccountType !== 'Officer') },
    { title: 'Enforcers', accounts: accounts.filter(account => account.role === 'Officer' || (account.role === 'Public' && account.requestedAccountType === 'Officer')) },
    { title: 'Administrators', accounts: accounts.filter(account => account.role === 'Admin') },
  ]
  return <div className="space-y-4">
    <p className="text-xs text-slate-400">Accounts on this page, grouped by account type. Enforcers includes applications awaiting approval.</p>
    {groups.map(group => <section key={group.title} aria-label={`${group.title} accounts`} className="rounded-xl border border-darkBorder bg-darkCard p-4">
      <h2 className="font-semibold mb-2">{group.title} <span className="text-sm text-slate-400">({group.accounts.length})</span></h2>
      {group.accounts.length ? <AccountsTable accounts={group.accounts} onEdit={onEdit} disabled={disabled} /> : <p className="text-sm text-slate-400">No {group.title.toLowerCase()} on this page.</p>}
    </section>)}
  </div>
}

export function AccountsTable({ accounts, onEdit, disabled }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Account','Unit / responder','Role','Access','Action'].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr></thead><tbody>
    {accounts.map(account => <tr key={account.id} className="border-t border-darkBorder"><td className="py-3">{account.name}<p className="text-xs text-slate-400">{account.username ?? 'Legacy account'} · {account.id}</p></td><td>{account.unit} · {account.responderType}</td><td>{account.role}{account.requestedAccountType === 'Officer' && account.role === 'Public' && <p className="text-orange-300">Enforcer application — awaiting Admin verification</p>}</td><td>{account.enabled ? 'Active' : 'Suspended'}</td><td><button disabled={disabled} onClick={() => onEdit(account)} className="text-orange-300">Edit account</button></td></tr>)}
  </tbody></table></div>
}

export function AccountEditor({ account, currentUserId, onSave, onCancel, saving }) {
  const [draft, setDraft] = useState({ ...account })
  const [reason, setReason] = useState('')
  const field = 'block w-full bg-darkBg border border-darkBorder rounded-lg p-2 mt-1'
  const self = account.id === currentUserId
  return <form onSubmit={e => { e.preventDefault(); if (!saving) void onSave(draft, reason) }} className="p-4 rounded-xl border border-darkBorder space-y-3 bg-darkCard">
    <h2 className="font-semibold">Edit {account.name}</h2>
    {account.requestedAccountType === 'Officer' && account.role === 'Public' && <p className="text-sm text-orange-300">Traffic enforcer applicant. Verify their identity and credentials, then select Officer, Police and Active access below to approve. Record your verification in the change reason. Leave Public to withhold approval.</p>}
    <fieldset disabled={saving} className="grid sm:grid-cols-2 gap-3">
      {['name','unit'].map(key => <label key={key}>{key === 'name' ? 'Display name' : 'Unit'}<input aria-label={`Account ${key}`} required maxLength={120} className={field} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}
      <label>Responder type<select aria-label="Account responder type" className={field} value={draft.responderType} onChange={e => setDraft({ ...draft, responderType: e.target.value })}><option value="police">Police</option><option value="medical">Medical</option></select></label>
      <label>Role<select aria-label="Account role" disabled={self} className={field} value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>{['Public','Officer','Admin'].map(role => <option key={role}>{role}</option>)}</select></label>
      <label className="flex items-center gap-2"><input aria-label="Account active" type="checkbox" disabled={self} checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />Active access</label>
    </fieldset>
    {self && <p className="text-sm text-slate-400">You can edit your profile; your own Admin role and access cannot be removed here.</p>}
    <label className="block">Change reason<textarea aria-label="Account change reason" required maxLength={5000} disabled={saving} className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex gap-3"><button disabled={saving} className="bg-orange-700 px-4 py-2 rounded-lg">{saving ? 'Saving…' : 'Save account changes'}</button><button type="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>
}
