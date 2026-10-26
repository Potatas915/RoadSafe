import { useEffect, useRef, useState } from 'react'

export default function AccountEditor({ account, currentUserId, onSave, onCancel, saving = false, error = '', stale = false, onReload, loadStations, returnFocusRef }) {
  const [draft, setDraft] = useState({ name: account.name, role: account.role, responderType: account.responderType, enabled: account.enabled, stationId: account.station?.id ?? null })
  const [reason, setReason] = useState('')
  const [verified, setVerified] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [stations, setStations] = useState([])
  const [stationError, setStationError] = useState('')
  const [stationLoading, setStationLoading] = useState(false)
  const [stationQuery, setStationQuery] = useState('')
  const dialog = useRef(null)
  const mounted = useRef(true)
  const discardPanel = useRef(null)
  const keepEditing = useRef(null)
  const errorPanel = useRef(null)
  const previousField = useRef(null)
  const self = account.id === currentUserId
  const applicant = account.role === 'Public' && account.requestedAccountType === 'Officer'
  const policeOfficer = draft.role === 'Officer' && draft.responderType === 'police'
  const granting = policeOfficer && !(account.role === 'Officer' && account.responderType === 'police')
  const needsStation = applicant || policeOfficer
  const dirty = reason !== '' || verified || Object.entries(draft).some(([key, value]) => value !== (key === 'stationId' ? account.station?.id ?? null : account[key]))
  const field = 'dx-input block w-full mt-1'
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }))
  function close() { if (saving) return; if (dirty) { previousField.current = typeof document === 'undefined' ? null : document.activeElement; setDiscard(true) } else onCancel?.() }
  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement
    const element = dialog.current
    mounted.current = true
    element?.showModal()
    return () => { mounted.current = false; element?.close(); previous?.focus() }
  }, [])
  async function fetchStations() {
    setStationLoading(true); setStationError('')
    try { const rows = await loadStations(); if (mounted.current) setStations(rows) }
    catch (failure) { if (mounted.current) setStationError(failure.message || 'Station directory is unavailable.') }
    finally { if (mounted.current) setStationLoading(false) }
  }
  useEffect(() => { if (needsStation && loadStations) void fetchStations() }, [needsStation, loadStations])
  useEffect(() => {
    if (!discard) return
    discardPanel.current?.scrollIntoView({ block: 'nearest' })
    keepEditing.current?.focus({ preventScroll: true })
  }, [discard])
  useEffect(() => {
    if (!error) return
    errorPanel.current?.scrollIntoView({ block: 'nearest' })
    errorPanel.current?.focus({ preventScroll: true })
  }, [error])
  const stationOptions = stations.some(station => station.id === account.station?.id) || !account.station ? stations : [account.station, ...stations]
  const blocked = saving || stale || !reason.trim() || !draft.name.trim() || (granting && (!verified || !draft.stationId || !account.enabled || !draft.enabled)) || (policeOfficer && !!account.station?.id && !draft.stationId)
  const approvalBlocked = saving || stale || !account.enabled || !draft.enabled || !verified || !draft.stationId || !reason.trim() || !draft.name.trim()
  function submit(approve = false) {
    if (approve ? approvalBlocked : blocked) return
    void onSave({ ...draft, ...(approve ? { role: 'Officer', responderType: 'police', enabled: true, verify: true } : { verify: granting && verified }) }, reason)
  }
  return <dialog ref={dialog} aria-labelledby="account-editor-title" aria-describedby="account-editor-description" onCancel={event => { event.preventDefault(); close() }} className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] p-0 rounded-xl border border-darkBorder bg-darkBg text-slate-100 backdrop:bg-black/70 shadow-xl">
    <form onSubmit={event => { event.preventDefault(); submit() }} className="flex max-h-[90dvh] flex-col">
      <header className="sticky top-0 bg-darkBg border-b border-darkBorder p-5 flex justify-between gap-4">
        <div><h2 id="account-editor-title" className="text-xl font-semibold">{applicant ? 'Review enforcer application' : 'Edit account'}</h2><p id="account-editor-description" className="text-sm text-slate-400 mt-1">{account.name} · {account.username ?? 'Legacy account'}</p></div>
        <button type="button" disabled={saving} onClick={close} className="dx-btn dx-btn-inline" aria-label="Close account editor">Close</button>
      </header>
      <div className="overflow-y-auto p-5 space-y-5">
        {error && <div ref={errorPanel} tabIndex={-1} role="alert" className="text-red-300"><p>{error}</p>{stale && <><p>Reload this account before saving again. Reload replaces this draft.</p><button type="button" disabled={saving} onClick={onReload} className="dx-btn dx-btn-inline mt-2">Reload account</button></>}</div>}
        {applicant && <section className="space-y-2"><h3 className="font-semibold text-orange-300">Awaiting verification</h3><p className="text-sm">Verify their identity and credentials before granting enforcer access. Approval grants Officer access for police work and leaves the enforcer off duty.</p>{!account.enabled && <p role="status" className="text-orange-300">This applicant is suspended. Save active access first, then reopen the account to approve.</p>}</section>}
        <p className="text-sm text-slate-300">{account.role === 'Officer' ? 'Approved enforcer' : account.role === 'Admin' ? 'Administrator' : applicant ? 'Enforcer applicant' : 'Public user'} · {account.enabled ? 'Active access' : 'Suspended access'}. Account access and approval are separate from on-duty availability.</p>
        <fieldset disabled={saving} className="space-y-4">
          <label className="block">Display name<input aria-label="Account name" required maxLength={120} className={field} value={draft.name} onChange={event => update('name', event.target.value)} /></label>
          <label className="flex items-center gap-2"><input aria-label="Account active" type="checkbox" disabled={self} checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} />Active access</label>
          {needsStation && <section className="space-y-2" aria-label="Station affiliation"><h3 className="font-semibold">Station affiliation</h3><label className="block">Search stations<input type="search" aria-label="Search stations" className={field} value={stationQuery} onChange={event => setStationQuery(event.target.value)} placeholder="Station name or address" /></label><label className="block">Assigned station<select aria-label="Account station" className={field} value={draft.stationId ?? ''} onChange={event => update('stationId', event.target.value || null)}><option value="">Select a station</option>{stationOptions.filter(station => station.id === draft.stationId || `${station.name} ${station.address ?? ''}`.toLowerCase().includes(stationQuery.toLowerCase())).map(station => <option key={station.id} value={station.id}>{station.name}{station.address ? ` — ${station.address}` : ''}</option>)}</select></label>{stationLoading && <p role="status">Loading stations…</p>}{stationError && <div role="alert" className="text-red-300">{stationError}<button type="button" onClick={() => void fetchStations()} className="dx-btn dx-btn-inline ml-2">Retry station directory</button></div>}{(account.station?.id ?? null) !== draft.stationId && account.role === 'Officer' && <p className="text-sm text-orange-300">Changing station sets this enforcer off duty. Reassign or complete active cases before transferring.</p>}</section>}
          <details><summary className="cursor-pointer font-semibold">Permissions</summary><div className="space-y-4 pt-3"><label className="block">Account type<select aria-label="Account role" disabled={self} className={field} value={draft.role} onChange={event => update('role', event.target.value)}><option value="Public">Public user</option><option value="Officer">Enforcer — Officer access</option><option value="Admin">Administrator</option></select></label><label className="block">Responder setting<select aria-label="Account responder type" className={field} value={draft.responderType} onChange={event => update('responderType', event.target.value)}><option value="police">Police</option><option value="medical">Medical (legacy responder)</option></select></label></div></details>
          {(applicant || granting) && <label className="flex items-start gap-2"><input aria-label="Identity and credentials verified" type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} /><span>I have verified this person's identity and enforcer credentials.</span></label>}
          {granting && !account.enabled && <p className="text-sm text-orange-300">Save reactivation separately before granting Officer access.</p>}
          {self && <p className="text-sm text-slate-400">You can edit your profile; your own Admin role and access cannot be removed here.</p>}
          <label className="block">Change reason<textarea aria-label="Account change reason" required maxLength={5000} className={field} value={reason} onChange={event => setReason(event.target.value)} /></label>
        </fieldset>
        {discard && <div ref={discardPanel} role="alert" className="space-y-3"><p>Discard unsaved account changes?</p><div className="flex gap-3"><button type="button" disabled={saving} onClick={onCancel} className="dx-btn dx-btn-inline">Discard changes</button><button ref={keepEditing} type="button" onClick={() => { setDiscard(false); previousField.current?.focus() }} className="dx-btn dx-btn-inline">Keep editing</button></div></div>}
      </div>
      <footer className="sticky bottom-0 bg-darkBg border-t border-darkBorder p-5 flex flex-wrap gap-3 justify-end">
        <button type="button" disabled={saving} onClick={close} className="dx-btn dx-btn-inline">Cancel</button>
        <button disabled={blocked} className="dx-btn dx-btn-inline">{saving ? 'Saving…' : 'Save account changes'}</button>
        {applicant && <button type="button" disabled={approvalBlocked} onClick={() => submit(true)} className="dx-btn dx-btn-primary dx-btn-inline">Verify and approve enforcer</button>}
      </footer>
    </form>
  </dialog>
}
