import { useEffect, useRef } from 'react'
import { MapReportPreview } from './MapReportCard.jsx'
import { formatDateTime } from '../models/report.js'
import { caseSeverity } from '../models/caseSeverity.js'
export default function DashboardReportSummary({ report, onClose, onManage }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => previous?.focus()
  }, [])
  const severity = caseSeverity(report)
  return <dialog ref={dialog} aria-label="Incident summary" onCancel={e => { e.preventDefault(); onClose() }} className="m-auto w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-darkBorder bg-darkCard text-slate-200 p-5 backdrop:bg-slate-950/80">
    <header className="flex justify-between gap-3 mb-3"><h2 className="font-semibold">Incident summary</h2><button type="button" onClick={onClose}>Close</button></header>
    <MapReportPreview report={report} summary />
    <dl className="grid grid-cols-2 gap-3 text-xs my-4"><div><dt>Status</dt><dd>{report.status}</dd></div><div><dt>Severity index</dt><dd style={{ color: severity.color }}>{severity.label} · {severity.score ?? 'Unknown'}</dd></div><div><dt>Incident time</dt><dd>{formatDateTime(report.occurredAt)}</dd></div><div><dt>Location</dt><dd>{report.location.address ?? 'Confirmed map location'}</dd></div></dl>
    <p className="text-xs text-slate-400 mb-3 break-all">Report {report.id}</p>
    <button type="button" onClick={onManage} className="rounded-xl px-4 py-2 bg-orange-600 text-white text-sm">Open in Report Management</button>
  </dialog>
}
