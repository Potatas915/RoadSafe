const items = [
  { id: 'map-view', label: 'GIS Tactical Map', icon: 'fa-earth-americas' },
  { id: 'dashboard-view', label: 'Dashboard Overview', icon: 'fa-chart-pie' },
  { id: 'reports-view', label: 'Report Management', icon: 'fa-triangle-exclamation', badge: true },
  { id: 'officers-view', label: 'Officer Dispatch', icon: 'fa-user-shield' },
  { id: 'analytics-view', label: 'Analytics & Exports', icon: 'fa-chart-line' },
]

const base = 'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition'
const active = `${base} bg-orange-500/10 text-brandOrange border border-orange-500/20`
const idle = `${base} text-slate-400 hover:bg-slate-800/60 hover:text-slate-200`

export default function Sidebar({ view, onChange, pendingCount, currentUser }) {
  return (
    <aside className="w-64 bg-darkCard border-r border-darkBorder flex flex-col justify-between z-30 shadow-2xl">
      <div>
        <div className="h-16 flex items-center px-6 border-b border-darkBorder gap-3 bg-slate-900/50">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2 rounded-xl text-white shadow-lg shadow-orange-500/20">
            <i className="fa-solid fa-shield-halved text-base"></i>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">RoadSafe Admin</h1>
            <span className="text-[11px] text-slate-400">Bulacan Command Center</span>
          </div>
        </div>

        <nav className="p-4 space-y-1.5 text-sm font-medium">
          {items.map((item) => (
            <button key={item.id} onClick={() => onChange(item.id)} className={view === item.id ? active : idle}>
              <i className={`fa-solid ${item.icon} w-5`}></i> {item.label}
              {item.badge && (
                <span className="ml-auto bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-darkBorder bg-slate-900/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center font-bold text-white text-xs shadow">
            {currentUser?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('') ?? '?'}
          </div>
          <div>
            <p className="text-xs font-semibold text-white">{currentUser?.name ?? 'No demo administrator'}</p>
            <p className="text-[10px] text-slate-400">{currentUser?.role ?? 'Unassigned role'}</p>
          </div>
        </div>
        <button title="System Settings" aria-label="System Settings" onClick={() => onChange('settings-view')} className="text-slate-400 hover:text-white transition">
          <i className="fa-solid fa-gear"></i>
        </button>
      </div>
    </aside>
  )
}
