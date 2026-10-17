import {
  RESPONDER_STATUSES,
  STATUS_TONE,
  getAssignees,
} from '../data/responders.js'

const AVG_SPEED_KMH = 35 // rough urban speed, used for the ETA estimate

const TYPE_UI = {
  police: {
    label: 'Police station',
    icon: 'fa-shield-halved',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    assignLabel: 'Assign officer',
  },
  medical: {
    label: 'Medical facility',
    icon: 'fa-truck-medical',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    assignLabel: 'Assign medic',
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
 * data:    { assignee, status, request }
 */
export default function ResponderCard({
  station,
  users,
  scene,
  data,
  onAssign,
  onStatus,
  onRequest,
  onRelease,
  onClose,
}) {
  if (!station) return null

  const ui = TYPE_UI[station.responderType] || TYPE_UI.police
  const assignees = getAssignees(station.responderType, users)
  const hasScene = Boolean(scene?.coordinates)
  const distance = hasScene
    ? distanceKm([station.lng, station.lat], scene.coordinates)
    : null
  const eta =
    distance != null
      ? Math.max(1, Math.round((distance / AVG_SPEED_KMH) * 60))
      : null
  const request = data.request

  return (
    <div className="absolute left-3 bottom-3 z-10 w-[320px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto bg-darkCard border border-darkBorder rounded-2xl shadow-2xl">
      <div className="p-4 border-b border-darkBorder flex items-start gap-3 bg-slate-900/50 rounded-t-2xl">
        <span
          className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${ui.badge}`}
        >
          <i className={`fa-solid ${ui.icon}`}></i>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm text-white truncate">{station.name}</h3>
          <p className="text-[11px] text-slate-400">{station.kind || ui.label}</p>
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_TONE[data.status]}`}
          >
            {data.status}
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

      <div className="p-4 space-y-4 text-xs">
        <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
          <span className={label}>Location & Coordinates</span>
          <p className="font-medium text-white">
            {station.address || 'Address not listed'}
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
              <p className="text-slate-500">—</p>
            )}
          </div>
          <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
            <span className={label}>Scene</span>
            {hasScene ? (
              <>
                <p className="font-mono text-orange-400 font-bold text-[11px]">
                  {scene.reportId}
                </p>
                <p className="text-slate-400 text-[11px]">{scene.label}</p>
              </>
            ) : (
              <p className="text-slate-500">No report selected</p>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-darkBorder">
          <span className={label}>Officer Assignment & Status Management</span>
          <select
            aria-label={ui.assignLabel}
            value={data.assignee}
            onChange={(e) => onAssign(e.target.value)}
            className={select}
          >
            <option value="">{ui.assignLabel}: Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {ui.assignLabel}: {a.name} ({a.code})
              </option>
            ))}
          </select>
          <select
            aria-label="Responder status"
            value={data.status}
            onChange={(e) => onStatus(e.target.value)}
            className={select}
          >
            {RESPONDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>
        </div>

        {request && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-1">
            <span className="text-orange-400 block text-[10px] uppercase font-semibold">
              Assistance requested
            </span>
            <p className="text-slate-200">
              <span className="font-mono font-bold text-orange-400">{request.id}</span>{' '}
              to {request.reportId}
            </p>
            <p className="text-slate-400 text-[11px]">
              {data.assignee || 'Unit not assigned'} ·{' '}
              {new Date(request.requestedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-darkBorder bg-slate-900/50 rounded-b-2xl space-y-2">
        {request ? (
          <button
            onClick={onRelease}
            className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs transition"
          >
            {data.status === 'Assistance Requested' ? 'Cancel request' : 'Stand down'}
          </button>
        ) : (
          <button
            onClick={onRequest}
            disabled={!hasScene}
            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-xs shadow transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-600"
          >
            <i className="fa-solid fa-bullhorn mr-2"></i>
            Request assistance to scene
          </button>
        )}
        {!request && !hasScene && (
          <p className="text-[11px] text-slate-500 text-center">
            Click a report on the map to choose the scene first.
          </p>
        )}
      </div>
    </div>
  )
}
