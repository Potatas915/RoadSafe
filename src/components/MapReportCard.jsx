import IncidentPhotoCarousel from './IncidentPhotoCarousel.js'
import { useCategories } from './CategoryContext.js'
import { formatDateTime } from '../models/report.js'
import { caseSeverity, reportedVehicles } from '../models/caseSeverity.js'
import { ACCIDENT_ICON_PATHS } from '../models/accidentIcons.js'

const label = 'text-slate-400 block text-[10px] uppercase font-semibold'
const box = 'bg-darkBg p-2.5 rounded-xl border border-darkBorder space-y-1'

function IncidentPhotos({ report, compact = false }) {
 return <IncidentPhotoCarousel evidence={report.evidence} compact={compact} />
}

export function MapReportPreview({ report, summary = false }) {
 const categories = useCategories()
 return <section aria-label="Incident hover preview" className="p-3 space-y-2 rounded-xl border border-darkBorder bg-darkCard/95 backdrop-blur shadow-2xl text-xs text-slate-300">
 <h3 className="font-semibold text-white">{categories.find(item => item.id === report.categoryId)?.label ?? 'Incident'}</h3>
 <IncidentPhotos report={report} compact />
 <p className="line-clamp-3 leading-relaxed">{report.description}</p>
 <p className="text-[10px] text-slate-400">{summary ? 'Open Report Management to review this record' : 'Click the icon for details'}{report.evidence.some(file => file.id.startsWith('demo-photo-')) ? ' · Illustrative demo photos' : ''}</p>
 </section>
}

export default function MapReportCard({ report, onClose, onZoom, onOpenReport }) {
  const ACCIDENT_CATEGORIES = useCategories()

  if (!report) return null
  const category = ACCIDENT_CATEGORIES.find((item) => item.id === report.categoryId)
  const coordinates = report.location.coordinates
  const injuries = report.injuries
  const severity = caseSeverity(report)
  return <section aria-label="Selected incident report" className="absolute left-3 bottom-3 z-10 w-[400px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto bg-darkCard/95 backdrop-blur border border-darkBorder rounded-xl shadow-2xl" style={{ borderTopColor: severity.color, borderTopWidth: 2 }}>
    <header className="p-3 border-b border-darkBorder flex items-start gap-3 bg-slate-900/50 rounded-t-2xl">
      <span className="w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center" style={{ color: severity.color, backgroundColor: `${severity.color}15`, borderColor: `${severity.color}40` }}><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" fillRule="evenodd"><path d={ACCIDENT_ICON_PATHS[report.categoryId] ?? ACCIDENT_ICON_PATHS.other} /></svg></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-sm text-white">{category.label}</h3>
        <p className="font-mono text-[10px] text-orange-400 break-all">{report.id}</p>
        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-400">{report.status}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close report card" className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark text-lg" /></button>
    </header>
    <div className="p-3 space-y-2 text-xs">
      <IncidentPhotos report={report} />
      <div className="grid grid-cols-3 gap-2 border-b border-darkBorder pb-3">
        <div><span className={label}>People injured</span><p className="text-lg text-white">{injuries.injuredCount ?? '?'}</p></div>
        <div><span className={label}>Vehicles</span><p className="text-lg text-white">{reportedVehicles(report) ?? '?'}</p></div>
        <div title={severity.explanation}><span className={label}>Severity index</span><p className="text-lg" style={{ color: severity.color }}>{severity.score === null ? 'Unknown' : `${severity.score}%`} <span className="text-[10px]">{severity.score === null ? '' : severity.label}</span></p></div>
      </div>
      {report.sample && <p className="text-[11px] text-amber-400">Fictional sample · approximate city-center location</p>}
      <div className="space-y-1">
        <p className="font-medium text-white">{report.location.address || 'Address not available'}</p>
        {report.region && <p className="text-slate-400 text-[11px]">{report.region}</p>}
        <p className="font-mono text-orange-400 text-[11px]">{coordinates.latitude.toFixed(4)}° N, {coordinates.longitude.toFixed(4)}° E</p>
      </div>
      <p className="text-[10px] text-slate-400">{formatDateTime(report.occurredAt)} · {report.verification.verifiedAt ? 'Verified' : 'Unverified'}</p>
      <details className={box}><summary className="text-slate-400 cursor-pointer">Incident description & scoring</summary><p className="text-slate-300 leading-relaxed">{report.description}</p><p className="text-[10px] text-slate-400">{severity.explanation} Rule-based index, not a probability. Map rings show a fixed 150 m nearby-street radius, not measured danger zones.</p>
        <p>{report.vehicles.map(({ type, count }) => `${count} ${type}`).join(', ') || (report.vehicleStatus === 'not_applicable' ? 'Not applicable' : 'Unknown')}</p>
        <p className="text-slate-400">Injured: {injuries.injuredCount ?? 'Unknown'} · Fatalities: {injuries.fatalityCount ?? 'Unknown'}</p>
      </details>
    </div>
    <footer className="p-3 border-t border-darkBorder bg-slate-900/50 rounded-b-2xl flex flex-wrap gap-2">
      <button type="button" onClick={onZoom} className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-xs">Zoom to report</button>
      {onOpenReport && <button type="button" onClick={() => onOpenReport(report.id)} className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs">Full details</button>}
    </footer>
  </section>
}
