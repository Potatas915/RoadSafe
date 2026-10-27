import { useCallback, useEffect, useRef, useState } from 'react'
import AccountEditor from './AccountEditor.jsx'
export { default as AccountEditor } from './AccountEditor.jsx'
import { loadAccounts, loadAccountStations, saveAccount } from '../backend/accounts.js'

export default function AccountsView({ client, currentUserId, initialSearch = '' }) {
  const [page, setPage] = useState({ data: [], total: 0 })
  const [query, setQuery] = useState(initialSearch)
  const [search, setSearch] = useState(initialSearch)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(null)
  const [selectedReload, setSelectedReload] = useState(0)
  const returnFocusRef = useRef(null)
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [stale, setStale] = useState(false)
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
  const stationLoader = useCallback(() => loadAccountStations(client), [client])
  function edit(account, trigger) { returnFocusRef.current = trigger; setEditError(''); setStale(false); setSelected(account) }
  async function reloadSelected() {
    if (saving) return
    setSaving(true)
    try {
      const fresh = await loadAccounts(client, selected.id, 0)
      const account = fresh.data.find(row => row.id === selected.id)
      if (!account) throw new Error('Account is no longer available. Close this editor and refresh the list.')
      setSelected(account); setSelectedReload(previous => previous + 1); setEditError(''); setStale(false)
    } catch (failure) { setEditError(failure.message) }
    finally { setSaving(false) }
  }
  async function save(patch, reason) {
    if (saving) return
    setSaving(true); setEditError(''); setMessage('')
    try {
      await saveAccount(client, selected, patch, reason)
      setSelected(null); setMessage('Account changes saved. Current permissions apply to new requests immediately.')
      if (offset) setOffset(0)
      else await reload()
    } catch (failure) { setEditError(failure.message); setStale(failure.code === '40001' || /stale|account changed|refresh it before saving/i.test(failure.message)) }
    finally { setSaving(false) }
  }
  return <main className="dx-page flex-1 p-4 md:p-6 overflow-y-auto space-y-5">
    <h1 className="text-2xl font-semibold tracking-tight text-strong">Account management</h1>
    <p className="max-w-3xl text-sm text-slate-400">Manage existing registered accounts. Reassign active cases before suspending or removing an Officer. Account creation, deletion and password recovery are separate.</p>
    <form onSubmit={e => { e.preventDefault(); setSelected(null); setOffset(0); if (query === search.trim() && offset === 0) void reload(); else setQuery(search.trim()) }} className="flex gap-2">
      <input aria-label="Search accounts" maxLength={120} placeholder="Name, username or account ID" className="dx-input flex-1" value={search} onChange={e => setSearch(e.target.value)} />
      <button disabled={saving} className="dx-btn dx-btn-primary dx-btn-inline">Search</button>
      <button type="button" disabled={saving || loading} onClick={() => { setSelected(null); void reload() }} className="dx-btn dx-btn-inline">Refresh</button>
    </form>
    {error && <p role="alert" className="text-red-300">{error} Refresh before retrying a stale edit.</p>}
    {message && <p role="status" className="text-emerald-300">{message}</p>}
    {loading && <p role="status">Loading accounts…</p>}
    <AccountGroups accounts={page.data} onEdit={edit} disabled={saving || loading} initialTab={initialSearch ? 1 : 0} />
    {!loading && !page.data.length && <p>No matching accounts.</p>}
    <div className="flex gap-3 text-sm items-center"><button disabled={offset === 0 || loading || saving} onClick={() => { setSelected(null); setOffset(offset - 50) }}>Previous</button><span>{page.total ? `${offset + 1}–${offset + page.data.length} of ${page.total}` : '0 accounts'}</span><button disabled={offset + 50 >= page.total || loading || saving} onClick={() => { setSelected(null); setOffset(offset + 50) }}>Next</button></div>
    {selected && <AccountEditor key={`${selected.id}:${selected.version}:${selectedReload}`} account={selected} currentUserId={currentUserId} onSave={save} onCancel={() => setSelected(null)} saving={saving} error={editError} stale={stale} onReload={reloadSelected} loadStations={stationLoader} returnFocusRef={returnFocusRef} />}
  </main>
}

export function AccountGroups({ accounts, onEdit, disabled, initialTab = 0 }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const groups = [
    { title: 'Users', accounts: accounts.filter(account => account.role === 'Public' && account.requestedAccountType !== 'Officer') },
    { title: 'Enforcers', accounts: accounts.filter(account => account.role === 'Officer' || (account.role === 'Public' && account.requestedAccountType === 'Officer')) },
    { title: 'Administrators', accounts: accounts.filter(account => account.role === 'Admin') },
  ]
  function moveTab(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % groups.length : event.key === 'ArrowLeft' ? (index + groups.length - 1) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null
    if (next === null || disabled) return
    event.preventDefault()
    setActiveTab(next)
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus()
  }
  return <div className="space-y-4">
    <div role="tablist" aria-label="Account types" className="flex gap-1 overflow-x-auto border-b border-darkBorder">
      {groups.map((group, index) => <button key={group.title} type="button" role="tab" id={`accounts-tab-${index}`} aria-controls={`accounts-panel-${index}`} aria-selected={activeTab === index} tabIndex={activeTab === index ? 0 : -1} disabled={disabled} onClick={() => setActiveTab(index)} onKeyDown={event => moveTab(event, index)} className={`shrink-0 inline-flex min-h-11 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50 ${activeTab === index ? 'border-orange-400 text-orange-400' : 'border-transparent text-slate-400 hover:text-strong'}`}>{group.title}<span className="text-xs tabular-nums">({group.accounts.length})</span></button>)}
    </div>
    <p className="text-xs text-slate-400">Counts reflect this search-result page. Enforcers includes applications awaiting approval.</p>
    {groups.map((group, index) => <section key={group.title} role="tabpanel" id={`accounts-panel-${index}`} aria-labelledby={`accounts-tab-${index}`} aria-label={`${group.title} accounts`} hidden={activeTab !== index} tabIndex={0} className={`dx-card overflow-hidden ${activeTab !== index ? 'hidden' : ''}`}>
      <h2 className="font-semibold px-5 py-4 border-b border-darkBorder flex items-center gap-2">{group.title} <span className="text-xs font-medium text-slate-400">({group.accounts.length})</span></h2>
      {group.accounts.length ? <AccountsTable accounts={group.accounts} onEdit={onEdit} disabled={disabled} /> : <p className="px-5 py-6 text-sm text-slate-400">No {group.title.toLowerCase()} on this page.</p>}
    </section>)}
  </div>
}

export function AccountsTable({ accounts, onEdit, disabled }) {
  const showStation = accounts.some(account => account.role === 'Officer' || (account.role === 'Public' && account.requestedAccountType === 'Officer'))
  const columns = showStation ? [30, 25, 22, 10, 13] : [38, 30, 14, 18]
  const cell = 'px-5 py-4 align-middle'
  return <div className="overflow-x-auto"><table className={`w-full table-fixed text-sm ${showStation ? 'min-w-[960px]' : 'min-w-[720px]'}`}>
    <colgroup>{columns.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
    <thead><tr className="border-b border-darkBorder">{['Account', ...(showStation ? ['Station affiliation'] : []), 'Account type / approval','Access','Action'].map(h => <th key={h} scope="col" className={`px-5 py-3 text-xs font-semibold text-slate-400 ${h === 'Action' ? 'text-center' : 'text-left'}`}>{h}</th>)}</tr></thead>
    <tbody>{accounts.map(account => <tr key={account.id} className="border-b border-darkBorder last:border-b-0 hover:bg-edge/[.025]">
      <td className={cell}><p className="font-medium text-strong break-words">{account.name}</p><p className="mt-1 text-xs leading-relaxed text-slate-400 break-words">{account.username ?? 'Legacy account'}<span className="block font-mono text-[11px] break-all">{account.id}</span></p></td>
      {showStation && <td className={cell}><p className="break-words">{account.station?.name ?? '—'}</p>{account.station?.address && <p className="mt-1 text-xs leading-relaxed text-slate-400 break-words">{account.station.address}</p>}</td>}
      <td className={`${cell} leading-relaxed`}>{account.role === 'Admin' ? 'Administrator' : account.role === 'Officer' ? 'Enforcer — Officer access' : 'Public user'}{account.role === 'Officer' && <p className="mt-1 text-xs text-emerald-300">Approved</p>}{account.requestedAccountType === 'Officer' && account.role === 'Public' && <p className="mt-1 text-xs text-orange-300">Awaiting verification</p>}</td>
      <td className={`${cell} whitespace-nowrap`}>{account.enabled ? 'Active' : 'Suspended'}</td>
      <td className={`${cell} text-center`}><button disabled={disabled} onClick={event => onEdit(account, event.currentTarget)} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-orange-400/20 px-3 py-2 text-xs font-medium leading-snug text-orange-300 hover:bg-orange-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50">{account.role === 'Public' && account.requestedAccountType === 'Officer' ? 'Review application' : 'Edit account'}</button></td>
    </tr>)}</tbody>
  </table></div>
}
