import { useState } from 'react'
import { REPORT_STATUS, categoryLabel, formatDateTime } from '../models/report.js'
import { caseSeverity, reportedVehicles } from '../models/caseSeverity.js'

export default function DashboardIncidentFeed({ reports, onOpenReport }) {
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [limit, setLimit] = useState(20)
  const active = (report) => ![REPORT_STATUS.CLOSED, REPORT_STATUS.REJECTED].includes(report.status)
  const filtered = reports.filter((report) => (!activeOnly || active(report))
    && `${report.id} ${report.location.address ?? ''} ${categoryLabel(report.categoryId)}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt) || a.id.localeCompare(b.id))
  const injured = reports.reduce((sum, report) => sum + (report.injuries.injuredCount ?? 0), 0)
  const incomplete = reports.some((report) => report.injuries.injuredCount === null)
  const vehicles = reports.reduce((sum, report) => sum + (reportedVehicles(report) ?? 0), 0)
  return <aside aria-labelledby="incident-feed-title" className="order-last xl:order-first xl:sticky xl:top-0 self-start min-w-0 rounded-2xl border border-white/[.07] bg-gradient-to-br from-white/[.045] to-white/[.015] shadow-lg overflow-hidden">
    <div className="p-3 border-b border-white/[.07] space-y-3">
      <div className="flex justify-between items-center"><h2 id="incident-feed-title" className="text-xs font-semibold text-white">Incident feed</h2><span className="text-[10px] text-slate-400">{reports.length} reports</span></div>
      <div className="grid grid-cols-3 gap-2">
        {[[`${injured}${incomplete ? '+' : ''}`, 'People injured', 'fa-user-group', 'Known reported injuries; + indicates reports with unknown injury counts.'], [vehicles, 'Vehicles reported', 'fa-car-burst', 'Sum of reported vehicles; reports without vehicle details are excluded.'], [reports.filter((report) => report.categoryId === 'collision').length, 'Collision cases', 'fa-car', 'Reports categorized as Collision.']].map(([value, label, icon, title]) => <div key={label} title={title} className="flex items-start gap-1.5"><i aria-hidden="true" className={`fa-solid ${icon} text-[9px] text-slate-300 mt-1`} /><span className="text-sm font-semibold text-white">{value}</span><span className="text-[8px] uppercase leading-tight text-slate-400 max-w-12 mt-0.5">{label}</span></div>)}
      </div>
      <input aria-label="Search incident feed" placeholder="Search ID, location or category" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20) }} className="w-full min-w-0 rounded border border-white/10 bg-black/10 px-2 py-1.5 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-orange-400/60" />
      <label className="flex items-center gap-2 text-[10px] text-slate-400"><input type="checkbox" checked={activeOnly} onChange={(event) => { setActiveOnly(event.target.checked); setLimit(20) }} className="accent-orange-400" />Active reports only</label>
    </div>
    <div className="max-h-[28rem] xl:max-h-[65vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
      <ul className="divide-y divide-white/[.055]">{filtered.slice(0, limit).map((report) => {
        const severity = caseSeverity(report)
        const vehicleCount = reportedVehicles(report)
        return <li key={report.id}>
          <button type="button" onClick={() => onOpenReport(report.id)} aria-label={`Open report ${report.id}`} title={`${report.id} · ${report.location.address ?? 'Confirmed map location'} · ${report.status}\n${severity.explanation}`} className="w-full text-left px-3 py-2.5 hover:bg-white/[.04] focus-visible:outline focus-visible:outline-orange-400 transition grid grid-cols-[minmax(0,1fr)_28px_28px_56px_56px] gap-1.5 items-center">
            <span className="min-w-0"><span className="block text-[10px] text-slate-300 truncate">{categoryLabel(report.categoryId)}</span><time dateTime={report.occurredAt} className="block text-[8px] text-slate-500 truncate">{formatDateTime(report.occurredAt)}</time></span>
            <span title="People injured" aria-label={`${report.injuries.injuredCount ?? 'Unknown'} people injured`} className="text-[10px] text-slate-300 whitespace-nowrap"><i aria-hidden="true" className="fa-solid fa-user-group text-[8px] mr-1" style={{ color: severity.color }} />{report.injuries.injuredCount ?? '?'}</span>
            <span title="Vehicles reported" aria-label={`${vehicleCount ?? 'Unknown'} vehicles reported`} className="text-[10px] text-slate-300 whitespace-nowrap"><i aria-hidden="true" className="fa-solid fa-car-burst text-[8px] text-rose-400 mr-1" />{vehicleCount ?? '?'}</span>
            <span title={severity.explanation} aria-label={severity.score === null ? 'Severity unknown' : `Severity index ${severity.score} percent: ${severity.label}`} className="flex items-center gap-1 text-[9px] text-slate-300"><span className="w-7 text-right">{severity.score === null ? '—' : `${severity.score}%`}</span><span className="h-0.5 w-5 bg-white/10"><span className="block h-full" style={{ width: `${severity.score ?? 0}%`, backgroundColor: severity.color }} /></span></span>
            <span className="flex items-center gap-1 text-[8px] uppercase text-slate-200"><span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: severity.color }} />{severity.label}</span>
          </button>
        </li>
      })}</ul>
      {!filtered.length && <p className="p-4 text-xs text-slate-400">{reports.length ? 'No incidents match these filters.' : 'No incident reports yet.'}</p>}
      {filtered.length > limit && <button type="button" className="w-full p-3 text-xs text-orange-300 hover:bg-white/[.04]" onClick={() => setLimit(limit + 20)}>Show more ({filtered.length - limit} remaining)</button>}
    </div>
    <details className="p-3 border-t border-white/[.07] text-[10px] text-slate-400">
      <summary className="cursor-pointer">Severity calculation · {filtered.length} matching reports</summary>
      <p className="mt-2">Rule-based index, not a probability or clinical triage. Category: collision 15, hit-and-run 20, rollover/pedestrian 25, other 10. Injuries: 30 plus 5 per additional injured person (maximum 50). Add 5 per additional vehicle (maximum 15). Fatality: 100. Unknown injuries: unscored.</p>
      <p className="mt-2">Low: 0–29; Medium: 30–59; High: 60–79; Critical: 80–100. Missing vehicles add no points. Header totals use all loaded reports, including closed cases; + means incomplete injury totals. Select any row for full details.</p>
    </details>
  </aside>
}
