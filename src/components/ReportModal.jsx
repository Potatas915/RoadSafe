import { useCategoryLabel, useCategories } from './CategoryContext.js'
import { canCorrectReport, correctionDraft, correctionValues, VEHICLE_TYPES } from '../models/reportCorrections.js'
import { officerStatuses } from '../models/staffAccess.js'
import { useEffect, useRef, useState } from 'react'
import { REPORT_STATUSES, REPORT_STATUS, ROLES, formatDateTime, isOfficiallyVerified, officerName } from '../models/report.js'
import { DUPLICATE_REVIEW_STATUSES, duplicateOriginals } from '../models/reportDuplicates.js'

export default function ReportModal({ report, users, onSave, onClose, live = false, reports = [], onDuplicate, onOpenOriginal, onCorrect, actorRole = ROLES.ADMIN, viewerId }) {
  const categoryLabel = useCategoryLabel()
  const categories = useCategories()
  const [facts, setFacts] = useState(() => correctionDraft(report))
  const [correctionReason, setCorrectionReason] = useState('')

  const officer = actorRole === ROLES.OFFICER
  const statusChoices = officer ? officerStatuses(report, viewerId) : report.isDuplicate ? [REPORT_STATUS.REJECTED] : REPORT_STATUSES
  const [status, setStatus] = useState(officer ? statusChoices[0] ?? report.status : report.status)
  const [assignedOfficerId, setOfficer] = useState(report.assignedOfficerId ?? '')
  const [officialRemarks, setRemarks] = useState(report.officialRemarks)
  const [rejectionReason, setReason] = useState(report.rejectionReason ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [originalId, setOriginalId] = useState('')
  const [duplicateReason, setDuplicateReason] = useState('')
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { previous?.focus() }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try { await onSave(report.id, { status, assignedOfficerId: assignedOfficerId || null, officialRemarks, rejectionReason: rejectionReason.trim() || null }) }
    catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  async function duplicateAction(clear = false) {
    if (saving) return
    if (!clear && (!originalId || !duplicateReason.trim())) { setError('Choose an original report and provide a duplicate reason.'); return }
    setSaving(true); setError('')
    try { await onDuplicate(report.id, clear ? null : originalId, clear ? null : duplicateReason) }
    catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  async function correctFacts() {
    if (saving) return
    setError('')
    try {
      if (!correctionReason.trim() || correctionReason.trim().length > 5000) throw new Error('Provide a correction reason (1-5000 characters).')
      const values = correctionValues(facts)
      setSaving(true)
      await onCorrect(report.id, values, correctionReason)
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  const control = 'w-full bg-darkBg border border-darkBorder rounded-xl p-2.5 text-slate-200'
  const coords = report.location.coordinates
  return (
    <dialog ref={dialog} aria-labelledby="report-title" onCancel={(event) => { event.preventDefault(); onClose() }} className="m-auto bg-darkCard text-slate-100 border border-darkBorder rounded-2xl w-full max-w-2xl max-h-[90vh] p-0 backdrop:bg-slate-950/80">
      <form onSubmit={submit} className="text-xs">
        <header className="p-5 border-b border-darkBorder flex justify-between gap-3">
          <h2 id="report-title" className="font-bold text-sm">Report Details: <span className="text-orange-400">{report.id}</span></h2>
          <button type="button" onClick={onClose} aria-label="Close report">Close</button>
        </header>
        <div className="p-6 space-y-5">
          <p className={isOfficiallyVerified(report) ? 'text-emerald-400' : 'text-amber-300'}>{isOfficiallyVerified(report) ? 'Officially verified accident record' : 'Public submission — not officially verified'}</p>
          <dl className="grid grid-cols-2 gap-4">
            <div><dt className="text-slate-400">Incident time (Manila)</dt><dd>{formatDateTime(report.occurredAt)}</dd></div>
            <div><dt className="text-slate-400">Submitted (Manila)</dt><dd>{formatDateTime(report.submittedAt)}</dd></div>
            <div><dt className="text-slate-400">Location</dt><dd>{report.location.address ?? 'Confirmed map location'}</dd><dd className="text-orange-300">{coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'No GPS coordinates provided'}</dd></div>
            <div><dt className="text-slate-400">Accident category</dt><dd>{categoryLabel(report.categoryId)}</dd></div>
            <div><dt className="text-slate-400">Vehicles involved</dt><dd>{report.vehicles.length ? report.vehicles.map((v) => `${v.count} × ${v.type}`).join(', ') : report.vehicleStatus === 'not_applicable' ? 'Not applicable' : 'Unknown'}</dd></div>
            <div><dt className="text-slate-400">Injury information</dt><dd>{report.injuries.status}</dd><dd>Injured: {report.injuries.injuredCount ?? 'Unknown'}; fatalities: {report.injuries.fatalityCount ?? 'Unknown'}</dd></div>
            <div><dt className="text-slate-400">Verification</dt><dd>{report.verification.verifiedAt ? `${officerName(users, report.verification.verifiedBy)} — ${formatDateTime(report.verification.verifiedAt)}` : 'Not verified'}</dd></div>
          </dl>
          <section aria-labelledby="reporter-info-title" className="border border-darkBorder bg-darkBg rounded-xl p-4">
            <h3 id="reporter-info-title" className="font-semibold text-white mb-3">Reporter info</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><dt className="text-slate-400">Full name</dt><dd className="mt-1 whitespace-pre-wrap break-words">{report.reporter.name ?? 'Not provided'}</dd></div>
              <div><dt className="text-slate-400">Contact number</dt><dd className="mt-1 whitespace-pre-wrap break-words">{report.reporter.contact ?? 'Not provided'}</dd></div>
            </dl>
          </section>
          <section><h3 className="text-slate-400 mb-1">Description</h3><p>{report.description}</p></section>
          {report.isDuplicate && <section className="border border-amber-700 rounded-xl p-3 space-y-2">
            <h3 className="font-semibold text-amber-300">Marked as duplicate</h3>
            <p>{report.rejectionReason}</p>
            {report.duplicateOfReportId && <p>Original report: {onOpenOriginal && reports.some(r => r.id === report.duplicateOfReportId)
              ? <button type="button" className="text-orange-300 underline" onClick={() => onOpenOriginal(report.duplicateOfReportId)}>{report.duplicateOfReportId}</button>
              : report.duplicateOfReportId}</p>}
            {onDuplicate && <button type="button" disabled={saving} onClick={() => duplicateAction(true)} className="px-3 py-2 bg-slate-800 rounded-lg disabled:opacity-50">Clear duplicate flag and return to review</button>}
          </section>}
          <section><h3 className="text-slate-400 mb-2">Photo evidence / attachments</h3>
            {!report.evidence.length ? <p>No evidence attached.</p> : <ul className="space-y-2">{report.evidence.map((file) => <li key={file.id}>{!file.url ? <span>Photo temporarily unavailable: {file.fileName}</span> : <a href={file.url} target="_blank" rel="noreferrer" className="text-orange-300 underline">{file.fileName}</a>}{file.url && file.mimeType.startsWith('image/') && <img src={file.url} alt={file.fileName} className="mt-2 max-h-48 rounded-lg" />}</li>)}</ul>}
          </section>
          {onCorrect && <section className="border-t border-darkBorder pt-4">
            <h3 className="font-semibold mb-2">Incident fact corrections</h3>
            {canCorrectReport(report) ? <details><summary className="cursor-pointer text-orange-300">Correct incident details</summary>
              <p className="my-2 text-slate-400">Original observations are retained in history. This saves facts separately from the workflow fields below. The report still requires review and verification.</p>
              <CorrectionFields draft={facts} onChange={setFacts} categories={categories} currentCategory={report.categoryId} disabled={saving} />
              <label className="block mt-3">Correction reason<textarea aria-label="Correction reason" maxLength={5000} className={control} value={correctionReason} disabled={saving} onChange={e => setCorrectionReason(e.target.value)} /></label>
              <button type="button" disabled={saving} onClick={correctFacts} className="my-3 px-3 py-2 bg-orange-700 rounded-lg disabled:opacity-50">Save incident corrections</button>
            </details> : <p className="text-slate-400">Return active cases to Under Review before correcting facts. Closed, rejected and duplicate reports are locked.</p>}
          </section>}
          <div className="space-y-3 border-t border-darkBorder pt-4">
            <label className="block">{officer && statusChoices[0] === 'Verified' ? 'Verification decision' : 'Report status'}<select aria-label="Report status" className={control} value={status} onChange={(e) => setStatus(e.target.value)}>{statusChoices.map((value) => <option key={value}>{value}</option>)}</select></label>
            {!officer && <label className="block">Assigned officer<select aria-label="Assign officer" className={control} value={assignedOfficerId} onChange={(e) => setOfficer(e.target.value)}><option value="">Unassigned</option>{users.filter((u) => u.role === ROLES.OFFICER && u.enabled !== false).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.unit})</option>)}</select></label>}
            <label className="block">Official remarks<textarea className={control} value={officialRemarks} onChange={(e) => setRemarks(e.target.value)} /></label>
            {status === REPORT_STATUS.REJECTED && <label className="block">Rejection reason (required)<textarea required className={control} value={rejectionReason} onChange={(e) => setReason(e.target.value)} /></label>}
          </div>
          {onDuplicate && !report.isDuplicate && DUPLICATE_REVIEW_STATUSES.includes(report.status) && <section className="space-y-3 border-t border-darkBorder pt-4">
            <h3 className="font-semibold text-white">Duplicate review</h3>
            <p className="text-slate-400">Confirm both submissions describe the same incident. Marking a duplicate retains this report and rejects it with your reason. Verified or assigned cases must return to review first.</p>
            <label className="block">Original report<select aria-label="Original report" className={control} value={originalId} disabled={saving} onChange={event => setOriginalId(event.target.value)}>
              <option value="">Choose original report</option>{duplicateOriginals(reports, report.id).map(r => <option key={r.id} value={r.id}>{r.id} · {categoryLabel(r.categoryId)} · {r.location.address ?? 'Confirmed map location'}</option>)}
            </select></label>
            <label className="block">Duplicate reason<textarea aria-label="Duplicate reason" maxLength={5000} className={control} value={duplicateReason} disabled={saving} onChange={event => setDuplicateReason(event.target.value)} /></label>
            <button type="button" disabled={saving} onClick={() => duplicateAction()} className="px-3 py-2 bg-amber-800 rounded-lg disabled:opacity-50">Mark as duplicate</button>
          </section>}
          <p className="text-amber-300">{live ? "Changes are saved to the shared backend with your account and timestamp. Assignments are recorded; external dispatch messages are not sent." : "Session preview only. Saving does not dispatch responders or update a server. Selecting a verified workflow status records demo verification."}</p>
          <ReportHistory events={report.events} redacted={officer} />
          {error && <p role="alert" className="text-red-300">{error}</p>}
        </div>
        <footer className="p-4 border-t border-darkBorder flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 rounded-xl">Cancel</button><button type="submit" disabled={saving || officer && !statusChoices.length} className="px-4 py-2 bg-orange-600 rounded-xl disabled:opacity-50">{saving ? "Saving…" : officer && statusChoices[0] === 'Verified' ? 'Verify report' : live ? "Save changes" : "Save session changes"}</button></footer>
      </form>
    </dialog>
  )
}


export function ReportHistory({ events = [], redacted = false }) {
  if (!events.length) return null
  return <section><h3 className="text-slate-400 mb-2">Report history and clarification</h3>
    <ul className="space-y-2">{events.map(event => <li key={event.id}>
      <span className="text-orange-300">{event.type === 'facts_corrected' ? 'Incident facts corrected' : event.type === 'duplicate_marked' ? 'Marked as duplicate' : event.type === 'duplicate_cleared' ? 'Duplicate flag cleared' : event.status ?? event.type}</span>
      {' · '}{formatDateTime(event.createdAt)}
      <p>Actor: {event.actor?.name || (redacted ? 'Not included in Officer view' : 'Unavailable (historical or demo event)')}{event.actor?.id && <span> · {event.actor.id}</span>}</p>
      {event.fromStatus && event.status && event.fromStatus !== event.status && <p>{event.fromStatus} → {event.status}</p>}
      {event.relatedReportId && <p>Original report: {event.relatedReportId}</p>}
      {event.message && <p>{event.message}</p>}
      {event.correction && <details className="my-2"><summary className="cursor-pointer text-orange-300">View original and corrected observations</summary><h4 className="mt-2 font-semibold">Before correction</h4><ObservationSummary facts={event.correction.before} /><h4 className="mt-2 font-semibold">After correction</h4><ObservationSummary facts={event.correction.after} /></details>}
    </li>)}</ul>
  </section>
}

export function ObservationSummary({ facts }) {
  const label = useCategoryLabel()
  return <dl className="space-y-1 my-2 text-slate-300">
    <div><dt>Category / incident time</dt><dd>{label(facts.categoryId)} · {formatDateTime(facts.occurredAt)}</dd></div>
    <div><dt>Location</dt><dd>{facts.location.address ?? 'Confirmed map location'} · {facts.location.coordinates.latitude}, {facts.location.coordinates.longitude}</dd></div>
    <div><dt>Vehicles</dt><dd>{facts.vehicleStatus === 'known' ? facts.vehicles.map(v => `${v.type}: ${v.count}`).join(', ') : facts.vehicleStatus}</dd></div>
    <div><dt>Casualties</dt><dd>{facts.injuries.status} · Injured: {facts.injuries.injuredCount ?? 'Unknown'}; fatalities: {facts.injuries.fatalityCount ?? 'Unknown'}</dd></div>
  </dl>
}

export function CorrectionFields({ draft, onChange, categories, currentCategory, disabled }) {
  const field = 'w-full bg-darkBg border border-darkBorder rounded-lg p-2'
  const set = (key, value) => onChange({ ...draft, [key]: value })
  return <fieldset disabled={disabled} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label>Accident category<select aria-label="Correction category" className={field} value={draft.categoryId} onChange={e => set('categoryId', e.target.value)}>{categories.filter(c => c.enabled !== false || c.id === currentCategory).map(c => <option key={c.id} value={c.id}>{c.label}{c.enabled === false ? ' (disabled; historical)' : ''}</option>)}</select></label>
    <label>Incident time (Asia/Manila)<input aria-label="Correction incident time" type="datetime-local" step="0.001" className={field} value={draft.occurredAt} onChange={e => set('occurredAt', e.target.value)} /></label>
    <label>Address (optional)<input aria-label="Correction address" maxLength={500} className={field} value={draft.address} onChange={e => set('address', e.target.value)} /></label>
    {['latitude', 'longitude'].map(key => <label key={key}>{key === 'latitude' ? 'Latitude' : 'Longitude'}<input aria-label={`Correction ${key}`} type="number" step="any" min={key === 'latitude' ? -90 : -180} max={key === 'latitude' ? 90 : 180} className={field} value={draft[key]} onChange={e => set(key, e.target.value)} /></label>)}
    <label>Vehicle information<select aria-label="Correction vehicle information" className={field} value={draft.vehicleStatus} onChange={e => set('vehicleStatus', e.target.value)}>{['unknown','not_applicable','known'].map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}</select></label>
    {draft.vehicleStatus === 'known' && VEHICLE_TYPES.map(type => <label key={type}>{type} count<input aria-label={`Correction ${type} count`} type="number" min="1" max="999" className={field} value={draft.counts[type] ?? ''} onChange={e => set('counts', { ...draft.counts, [type]: e.target.value })} /></label>)}
    <label>Injury information<select aria-label="Correction injury status" className={field} value={draft.injuryStatus} onChange={e => onChange({ ...draft, injuryStatus: e.target.value, injuredCount: '', fatalityCount: '' })}>{['unknown','none','injured','fatal'].map(v => <option key={v}>{v}</option>)}</select></label>
    {['injured','fatal'].includes(draft.injuryStatus) && <label>Known injured count (blank = unknown)<input aria-label="Correction injured count" type="number" min={draft.injuryStatus === 'injured' ? 1 : 0} max="999" className={field} value={draft.injuredCount} onChange={e => set('injuredCount', e.target.value)} /></label>}
    {draft.injuryStatus === 'fatal' && <label>Known fatality count (blank = unknown)<input aria-label="Correction fatality count" type="number" min="1" max="999" className={field} value={draft.fatalityCount} onChange={e => set('fatalityCount', e.target.value)} /></label>}
  </fieldset>
}
