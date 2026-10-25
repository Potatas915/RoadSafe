import { facilityDistance } from '../models/medicalFacilities.js'

export default function MedicalFacilityCard({ station, scene, nearby = [], selectedId, onSelect, onRecommend, busy, message, error, onClose }) {
  const distance = scene?.coordinates ? facilityDistance(station, scene.coordinates) : null
  return <section aria-label="Medical facility information" className="absolute left-3 bottom-3 z-10 w-[440px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto bg-darkCard border border-darkBorder rounded-2xl shadow-2xl text-xs">
    <header className="p-3 border-b border-darkBorder flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl grid place-items-center bg-red-500/10 text-red-400"><i className="fa-solid fa-hospital" /></span>
      <div className="flex-1 min-w-0"><h3 className="font-bold text-strong break-words">{station.name}</h3><p className="text-slate-400">{station.kind} · Location information</p></div>
      <button type="button" onClick={onClose} aria-label="Close medical facility" className="text-slate-400 hover:text-strong"><i className="fa-solid fa-xmark" /></button>
    </header>
    <div className="p-3 space-y-3 text-slate-300">
      <div className="p-3 bg-darkBg border border-darkBorder rounded-xl space-y-1"><p>{station.address || 'Address not available'}</p><p className="font-mono text-orange-400">{station.lat.toFixed(4)}° N, {station.lng.toFixed(4)}° E</p></div>
      {scene ? <p>{scene.label} · {scene.reportId}{distance !== null && <span className="block text-slate-400 mt-1">{distance.toFixed(1)} km straight-line distance from incident</span>}</p> : <p>Select an incident or drag its icon onto a hospital or clinic.</p>}
      {nearby.length > 0 && <div><h4 className="font-semibold text-strong mb-2">Nearest mapped hospitals & clinics</h4><ul className="space-y-1">{nearby.slice(0, 5).map(facility => <li key={facility.id}><button type="button" onClick={() => onSelect(facility)} className="w-full text-left p-2 rounded-lg hover:bg-slate-800 border border-darkBorder"><span className="block text-strong">{facility.name}{selectedId === facility.id ? ' · Recommended' : ''}</span><span className="text-slate-400">{facility.kind} · {facility.distanceKm.toFixed(1)} km</span></button></li>)}</ul></div>}
      <p className="text-[11px] text-slate-400">Mapped locations only. Opening hours, capacity and acceptance are unconfirmed.</p>
      {scene && <button type="button" disabled={busy} onClick={onRecommend} className="w-full rounded-xl px-3 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Recommend this facility'}</button>}
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
  </section>
}
