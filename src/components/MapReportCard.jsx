import { ACCIDENT_CATEGORIES, formatDateTime } from '../models/report.js'

const label = 'text-slate-400 block text-[10px] uppercase font-semibold'
const box = 'bg-darkBg p-2.5 rounded-xl border border-darkBorder space-y-1'

export default function MapReportCard({ report, onClose, onZoom, onOpenReport }) {
  if (!report) return null
  const category = ACCIDENT_CATEGORIES.find((item) => item.id === report.categoryId)
  const coordinates = report.location.coordinates
  const injuries = report.injuries
  return <section aria-label="Selected incident report" className="absolute left-3 bottom-3 z-10 w-[520px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto bg-darkCard border border-darkBorder rounded-2xl shadow-2xl">
    <header className="p-3 border-b border-darkBorder flex items-start gap-3 bg-slate-900/50 rounded-t-2xl">
      <span className="w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center bg-orange-500/10 border-orange-500/20" style={{ color: category.color }}><i className="fa-solid fa-triangle-exclamation" /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-sm text-white">{category.label}</h3>
        <p className="font-mono text-[10px] text-orange-400 break-all">{report.id}</p>
        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400">{report.status}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close report card" className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark text-lg" /></button>
    </header>
    <div className="p-3 space-y-2 text-xs">
      {report.sample && <p className="text-[11px] text-amber-400">Fictional sample · approximate city-center location</p>}
      <div className={box}><span className={label}>Location & coordinates</span>
        <p className="font-medium text-white">{report.location.address || 'Address not available'}</p>
        {report.region && <p className="text-slate-400 text-[11px]">{report.region}</p>}
        <p className="font-mono text-orange-400 text-[11px]">{coordinates.latitude.toFixed(4)}° N, {coordinates.longitude.toFixed(4)}° E</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={box}><span className={label}>Incident time (PHT)</span><p>{formatDateTime(report.occurredAt)}</p></div>
        <div className={box}><span className={label}>Severity</span><p>{['Minor', 'Moderate', 'Serious'][report.severity - 1]}</p><p className="text-[11px] text-slate-400">{report.verification.verifiedAt ? 'Verified' : 'Unverified'}</p></div>
      </div>
      <div className={box}><span className={label}>Incident description</span><p className="text-slate-300 leading-relaxed">{report.description}</p></div>
      <div className={box}><span className={label}>Vehicles & injuries</span>
        <p>{report.vehicles.map(({ type, count }) => `${count} ${type}`).join(', ') || 'No vehicles recorded'}</p>
        <p className="text-slate-400">Injured: {injuries.injuredCount ?? 'Unknown'} · Fatalities: {injuries.fatalityCount ?? 'Unknown'}</p>
      </div>
    </div>
    <footer className="p-3 border-t border-darkBorder bg-slate-900/50 rounded-b-2xl flex flex-wrap gap-2">
      <button type="button" onClick={onZoom} className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-xs">Zoom to report</button>
      {onOpenReport && <button type="button" onClick={() => onOpenReport(report.id)} className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs">Full details</button>}
    </footer>
  </section>
}
