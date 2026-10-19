import { useCategoryLabel } from './CategoryContext.js'
import { useEffect, useRef, useState } from 'react'
import { REPORT_STATUSES, REPORT_STATUS, ROLES, formatDateTime, isOfficiallyVerified, officerName } from '../models/report.js'
import { DUPLICATE_REVIEW_STATUSES, duplicateOriginals } from '../models/reportDuplicates.js'

export default function ReportModal({ report, users, onSave, onClose, live = false, reports = [], onDuplicate, onOpenOriginal }) {
  const categoryLabel = useCategoryLabel()

  const [status, setStatus] = useState(report.status)
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
          <div className="space-y-3 border-t border-darkBorder pt-4">
            <label className="block">Report status<select aria-label="Report status" className={control} value={status} onChange={(e) => setStatus(e.target.value)}>{(report.isDuplicate ? [REPORT_STATUS.REJECTED] : REPORT_STATUSES).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="block">Assigned officer<select aria-label="Assign officer" className={control} value={assignedOfficerId} onChange={(e) => setOfficer(e.target.value)}><option value="">Unassigned</option>{users.filter((u) => u.role === ROLES.OFFICER).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.unit})</option>)}</select></label>
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
          {report.events?.length > 0 && <section><h3 className="text-slate-400 mb-2">Report history and clarification</h3><ul className="space-y-2">{report.events.map((event) => <li key={event.id}><span className="text-orange-300">{event.type === 'duplicate_marked' ? 'Marked as duplicate' : event.type === 'duplicate_cleared' ? 'Duplicate flag cleared' : event.status ?? event.type}</span> · {formatDateTime(event.createdAt)}{event.relatedReportId && <p>Original report: {event.relatedReportId}</p>}{event.message && <p>{event.message}</p>}</li>)}</ul></section>}
          {error && <p role="alert" className="text-red-300">{error}</p>}
        </div>
        <footer className="p-4 border-t border-darkBorder flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 rounded-xl">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 rounded-xl disabled:opacity-50">{saving ? "Saving…" : live ? "Save changes" : "Save session changes"}</button></footer>
      </form>
    </dialog>
  )
}

