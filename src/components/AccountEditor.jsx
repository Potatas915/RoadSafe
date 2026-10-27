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
  const roleLabel = account.role === 'Officer' ? 'Approved enforcer' : account.role === 'Admin' ? 'Administrator' : applicant ? 'Enforcer applicant' : 'Public user'
  const initials = account.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
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
  const approvalBlocked = saving || stale || !account.enabled || !draft.enabled || !verified || !draft.stationId || !draft.name.trim()
  function submit(approve = false) {
    if (approve ? approvalBlocked : blocked) return
    void onSave({ ...draft, ...(approve ? { role: 'Officer', responderType: 'police', enabled: true, verify: true } : { verify: granting && verified }) }, approve ? 'Enforcer identity and credentials verified by administrator.' : reason)
  }
  return <dialog ref={dialog} aria-labelledby="account-editor-title" aria-describedby="account-editor-description" onCancel={event => { event.preventDefault(); close() }} className="account-editor m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] p-0 rounded-xl border border-darkBorder bg-darkBg text-slate-100 backdrop:bg-black/70 shadow-xl">
    <form onSubmit={event => { event.preventDefault(); submit() }} className="flex max-h-[90dvh] flex-col">
      <header className="bg-darkBg border-b border-darkBorder p-5 sm:px-6">
        <p className="text-xs font-medium text-slate-400 mb-2">Account management</p>
        <h2 id="account-editor-title" className="text-xl font-semibold">{applicant ? 'Review enforcer application' : 'Edit account'}</h2>
        <p id="account-editor-description" className="text-sm text-slate-400 mt-1">Manage profile details, access and permissions.</p>
      </header>
      <div className="overflow-y-auto p-5 space-y-5">
        {error && <div ref={errorPanel} tabIndex={-1} role="alert" className="text-red-300"><p>{error}</p>{stale && <><p>Reload this account before saving again. Reload replaces this draft.</p><button type="button" disabled={saving} onClick={onReload} className="dx-btn dx-btn-inline mt-2">Reload account</button></>}</div>}
        {applicant && <section className="space-y-2"><h3 className="font-semibold text-orange-300">Awaiting verification</h3><p className="text-sm">Verify their identity and credentials before granting enforcer access. Approval grants Officer access for police work and leaves the enforcer off duty.</p>{!account.enabled && <p role="status" className="text-orange-300">This applicant is suspended. Save active access first, then reopen the account to approve.</p>}</section>}
        <section aria-label="Account summary" className="flex items-start gap-4 rounded-xl bg-white/[.04] p-4">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-lg font-semibold text-slate-200">{initials || 'U'}</div>
          <div className="min-w-0"><h3 className="text-lg font-semibold break-words">{account.name}</h3><p className="text-sm text-slate-400 break-words">{account.username ?? 'Legacy account'}</p>
            <div className="flex flex-wrap gap-2 mt-3 text-xs font-medium">
              <span className="rounded-md bg-slate-500/15 px-2 py-1 text-slate-300">{roleLabel}</span>
              <span className={`rounded-md px-2 py-1 ${account.enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{account.enabled ? 'Active access' : 'Suspended access'}</span>
              {self && <span className="rounded-md bg-slate-500/15 px-2 py-1 text-slate-300">Your account</span>}
            </div>
          </div>
        </section>
        <fieldset disabled={saving} className="space-y-4">
          <section aria-label="Profile and access" className="rounded-xl border border-darkBorder p-4 space-y-4">
            <h3 className="font-semibold">Profile &amp; access</h3>
            <label className="block text-sm font-medium">Display name<input aria-label="Account name" required maxLength={120} className={field} value={draft.name} onChange={event => update('name', event.target.value)} /></label>
            <label className="flex items-start gap-3 border-t border-darkBorder pt-4 cursor-pointer"><input className="mt-1 h-4 w-4 accent-orange-500 shrink-0" aria-label="Account active" type="checkbox" disabled={self} checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} /><span><span className="block text-sm font-medium">Active access</span><span className="block text-sm text-slate-400 mt-1">Allow account access. Approval and on-duty availability are managed separately.</span></span></label>
          </section>
          {needsStation && <section className="rounded-xl border border-darkBorder p-4 space-y-3" aria-label="Station affiliation"><h3 className="font-semibold">Station affiliation</h3><label className="block">Search stations<input type="search" aria-label="Search stations" className={field} value={stationQuery} onChange={event => setStationQuery(event.target.value)} placeholder="Station name or address" /></label><label className="block">Assigned station<select aria-label="Account station" className={field} value={draft.stationId ?? ''} onChange={event => update('stationId', event.target.value || null)}><option value="">Select a station</option>{stationOptions.filter(station => station.id === draft.stationId || `${station.name} ${station.address ?? ''}`.toLowerCase().includes(stationQuery.toLowerCase())).map(station => <option key={station.id} value={station.id}>{station.name}{station.address ? ` — ${station.address}` : ''}</option>)}</select></label>{stationLoading && <p role="status">Loading stations…</p>}{stationError && <div role="alert" className="text-red-300">{stationError}<button type="button" onClick={() => void fetchStations()} className="dx-btn dx-btn-inline ml-2">Retry station directory</button></div>}{(account.station?.id ?? null) !== draft.stationId && account.role === 'Officer' && <p className="text-sm text-orange-300">Changing station sets this enforcer off duty. Reassign or complete active cases before transferring.</p>}</section>}
          <details className="rounded-xl border border-darkBorder p-4"><summary className="cursor-pointer font-semibold">Permissions</summary><div className="space-y-4 pt-3"><label className="block">Account type<input aria-label="Account role" readOnly className={field} value={account.role === 'Admin' ? 'Administrator' : applicant || account.role === 'Officer' ? 'Enforcer' : 'Public user'} /></label>{(applicant || account.role === 'Officer') && <label className="block">Responder setting<input aria-label="Account responder type" readOnly className={field} value={account.responderType === 'medical' ? 'Medical (legacy responder)' : 'Police'} /></label>}{applicant && <p className="text-sm text-slate-400">Officer access is granted only after verification and approval.</p>}</div></details>
          {(applicant || granting) && <label className="flex items-start gap-2"><input aria-label="Identity and credentials verified" type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} /><span>I have verified this person's identity and enforcer credentials.</span></label>}
          {granting && !account.enabled && <p className="text-sm text-orange-300">Save reactivation separately before granting Officer access.</p>}
          {self && <p className="text-sm text-slate-400">You can edit your profile; your own Admin role and access cannot be removed here.</p>}
          {applicant ? <details className="rounded-xl border border-darkBorder p-4"><summary className="cursor-pointer font-semibold">Reason for other account changes</summary><p className="text-sm text-slate-400 mt-2">Verification does not need a reason. Provide one only when saving other account changes.</p><label className="block mt-2">Change reason<textarea aria-label="Account change reason" maxLength={5000} className={field} value={reason} onChange={event => setReason(event.target.value)} /></label></details> : <label className="block rounded-xl border border-darkBorder p-4"><span className="block font-semibold">Change reason</span><span className="block text-sm text-slate-400 mt-1 mb-3">Briefly explain this update for the account history.</span><textarea aria-label="Account change reason" required rows={3} placeholder="e.g. Corrected the account display name" maxLength={5000} className={field} value={reason} onChange={event => setReason(event.target.value)} /></label>}
        </fieldset>
        {discard && <div ref={discardPanel} role="alert" className="space-y-3"><p>Discard unsaved account changes?</p><div className="flex gap-3"><button type="button" disabled={saving} onClick={onCancel} className="dx-btn dx-btn-inline">Discard changes</button><button ref={keepEditing} type="button" onClick={() => { setDiscard(false); previousField.current?.focus() }} className="dx-btn dx-btn-inline">Keep editing</button></div></div>}
      </div>
      <footer className="sticky bottom-0 bg-darkBg border-t border-darkBorder p-5 flex flex-wrap gap-3 justify-end">
        <button type="button" disabled={saving} onClick={close} className="dx-btn dx-btn-inline">Cancel</button>
        <button disabled={blocked} className="dx-btn dx-btn-primary dx-btn-inline">{saving ? 'Saving…' : 'Save account changes'}</button>
        {applicant && <button type="button" disabled={approvalBlocked} onClick={() => submit(true)} className="dx-btn dx-btn-primary dx-btn-inline">Verify and approve enforcer</button>}
      </footer>
    </form>
  </dialog>
}
