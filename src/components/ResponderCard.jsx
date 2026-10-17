import { useState } from 'react'
import {
  RESPONDER_STATUSES,
  STATION_STATUSES,
  STATUS_TONE,
} from '../data/responders.js'

const AVG_SPEED_KMH = 35 // rough urban speed, used for the ETA estimate

const TYPE_UI = {
  police: {
    label: 'Police Station',
    icon: 'fa-shield-halved',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  medical: {
    label: 'Medical facility',
    icon: 'fa-truck-medical',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
}

function distanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

const label = 'text-slate-400 block text-[10px] uppercase font-semibold'
const select =
  'w-full bg-darkBg border border-darkBorder rounded-xl p-2.5 text-slate-200 text-xs'

/**
 * Floating card shown on the map when a police station / medical facility is clicked.
 *
 * station: { id, name, address, kind, responderType: 'police' | 'medical', lng, lat }
 * scene:   { reportId, label, coordinates: [lng, lat] } | null   (the selected report)
 * data:    { status, request } — browser-local personnel request
 */
export default function ResponderCard({
  station,
  scene,
  data,
  onStatus,
  onStationStatus,
  onRequest,
  routeInfo,
  onFocusRoute,
  onRelease,
  onClose,
}) {
  const [personnel, setPersonnel] = useState(1)
  const [note, setNote] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  if (!station) return null

  const ui = TYPE_UI[station.responderType] || TYPE_UI.police
  const request = data.request
  const activeScene = request ? { reportId: request.reportId, label: request.sceneLabel, coordinates: request.sceneCoordinates } : scene
  const hasScene = Boolean(activeScene?.coordinates)
  const nextStatus = request ? RESPONDER_STATUSES[RESPONDER_STATUSES.indexOf(data.status) + 1] : null
  const typeName = station.responderType === 'police' ? 'Police Station' : ({ hospital: 'Hospital', clinic: 'Clinic', 'ambulance station': 'Ambulance Station' }[station.kind?.toLowerCase()] || ui.label)
  const distance = hasScene
    ? distanceKm([station.lng, station.lat], activeScene.coordinates)
    : null
  const eta =
    distance != null
      ? Math.max(1, Math.round((distance / AVG_SPEED_KMH) * 60))
      : null
  return (
    <div data-responder-card className="absolute left-3 bottom-3 z-10 w-[320px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto bg-darkCard border border-darkBorder rounded-2xl shadow-2xl">
      <div className="p-4 border-b border-darkBorder flex items-start gap-3 bg-slate-900/50 rounded-t-2xl">
        <span
          className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${ui.badge}`}
        >
          <i className={`fa-solid ${ui.icon}`}></i>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm text-white truncate">{station.name}</h3>
          <p className="text-[11px] text-slate-400">{typeName}</p>
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_TONE[data.status]}`}
          >
            {request ? data.status : (data.stationStatus ?? 'Available')}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-slate-400 hover:text-white"
        >
          <i className="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>

      <div className={`p-4 space-y-4 text-xs ${request && routeInfo && !showDetails ? 'hidden md:block' : ''}`}>
        <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
          <span className={label}>Location & Coordinates</span>
          <p className="font-medium text-white">
            {station.address || 'Address not available'}
          </p>
          <p className="font-mono text-orange-400 text-[11px]">
            {station.lat.toFixed(4)}° N, {station.lng.toFixed(4)}° E
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
            <span className={label}>Distance to scene</span>
            {distance != null ? (
              <>
                <p className="font-medium text-white">{distance.toFixed(1)} km</p>
                <p className="text-slate-400 text-[11px]">ETA ~{eta} min</p>
              </>
            ) : (
              <p className="text-slate-500 text-[11px]">Select a report to estimate distance.</p>
            )}
          </div>
          <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
            <span className={label}>Scene</span>
            {hasScene ? (
              <>
                <p className="font-mono text-orange-400 font-bold text-[11px]">
                  {activeScene.reportId}
                </p>
                <p className="text-slate-400 text-[11px]">{activeScene.label}</p>
              </>
            ) : (
              <p className="text-slate-500">Select a report on the map.</p>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-darkBorder">
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Request Personnel</span>
            <span className="text-[10px] text-slate-500" title="Browser-only request; no dispatch is sent.">Browser only</span>
          </div>
          {!request ? <>
            <select aria-label="Number needed" value={personnel} onChange={(event) => setPersonnel(Number(event.target.value))} className={select}>
              {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{station.responderType === 'police' ? 'Police' : 'Medical'} personnel needed: {count}</option>)}
            </select>
            <select aria-label="Responder status" value={data.stationStatus ?? 'Available'} onChange={(event) => onStationStatus(event.target.value)} className={select}>
              {STATION_STATUSES.map((value) => <option key={value} value={value}>Status: {value}</option>)}
            </select>
            <details className="text-[11px] text-slate-400">
              <summary className="cursor-pointer">Note (optional){note && ' · added'}</summary>
              <textarea aria-label="Note (optional)" value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)} placeholder="Additional personnel needs…" className={`${select} mt-2 resize-y`} />
            </details>
          </> : <div role="status" className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-2 break-words">
            <span className="text-orange-400 block text-[10px] uppercase font-semibold">Personnel request</span>
            <p className="font-mono font-bold text-orange-400">{request.id}</p>
            <p>{request.personnel} {station.responderType === 'police' ? 'police' : 'medical'} personnel</p>
            <p className="text-slate-400 text-[11px]">{new Date(request.requestedAt).toLocaleString()}</p>
            {request.note && <p className="text-slate-300 whitespace-pre-wrap">{request.note}</p>}
            <ol aria-label="Request progress" className="flex flex-wrap gap-x-2 gap-y-1 text-[10px]">
              {RESPONDER_STATUSES.map((status, index) => <li key={status} aria-current={data.status === status ? 'step' : undefined} className={index <= RESPONDER_STATUSES.indexOf(data.status) ? 'text-orange-400' : 'text-slate-500'}>{index > 0 && <span aria-hidden="true">› </span>}{status}</li>)}
            </ol>
          </div>}
        </div>
      </div>

      <div className="p-3 border-t border-darkBorder bg-slate-900/50 rounded-b-2xl space-y-2">
        {request && routeInfo && <div className="text-xs text-slate-300 space-y-2">
          <p>{routeInfo.isFallback ? 'Direct-line preview · road route unavailable or loading' : 'Driving route displayed · OSRM'}</p>
          <button type="button" onClick={onFocusRoute} className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl">View route</button>
          <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)} className="md:hidden text-slate-300 underline">{showDetails ? 'Hide request details' : 'Show request details'}</button>
        </div>}
        {request ? <>
          {nextStatus && <button type="button" onClick={() => onStatus(nextStatus)} className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-xs transition">Mark {nextStatus}</button>}
          <button type="button" onClick={onRelease} className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs transition">{data.status === 'Completed' ? 'New request' : 'Cancel request'}</button>
        </> : <button type="button" onClick={() => onRequest({ personnel, note })} disabled={!hasScene} className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-xs shadow transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-600">
          <i className="fa-solid fa-bullhorn mr-2" />Request {station.responderType === 'police' ? 'police' : 'medical'} personnel
        </button>}
        {!request && !hasScene && (
          <p className="text-[11px] text-slate-500 text-center">
            Click a report on the map to choose the scene first.
          </p>
        )}
      </div>
    </div>
  )
}
