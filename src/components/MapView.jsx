import { summary, metrics } from '../data/mock.js'

const layers = [
  { label: 'Dangerous Intersections', checked: true },
  { label: 'Traffic Congestion Hotspots', checked: true },
  { label: 'Distractions & Obstructions', checked: true },
  { label: 'Pedestrian Collisions', checked: false },
]

export default function MapView({ onOpenReport, onNavigate }) {
  return (
    <main className="flex-1 relative bg-slate-950 flex overflow-hidden">
      {/* Simulated tactical grid */}
      <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:28px_28px]"></div>

      {/* Vector highway lines */}
      <svg className="absolute inset-0 w-full h-full stroke-slate-800 stroke-[3] pointer-events-none opacity-60">
        <line x1="120" y1="0" x2="120" y2="1080" />
        <line x1="480" y1="0" x2="480" y2="1080" />
        <line x1="920" y1="0" x2="920" y2="1080" />
        <line x1="1400" y1="0" x2="1400" y2="1080" />
        <line x1="0" y1="220" x2="1920" y2="220" />
        <line x1="0" y1="580" x2="1920" y2="580" />
        <path d="M 120,220 Q 480,320 920,220 T 1600,580" fill="none" className="stroke-orange-500/40 stroke-[8]" />
        <path d="M 480,0 Q 300,580 1400,800" fill="none" className="stroke-amber-500/30 stroke-[4]" />
      </svg>

      {/* Hotspots */}
      <div className="absolute top-[38%] left-[32%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-40 h-40 bg-orange-500/20 rounded-full absolute -inset-6 animate-ping duration-1000"></div>
        <div className="w-20 h-20 bg-red-500/30 rounded-full absolute -inset-2 animate-pulse"></div>
        <button
          aria-label="Open report RA-2025-000123"
          className="block w-4 h-4 bg-orange-500 rounded-full relative z-10 shadow-[0_0_25px_#f97316] cursor-pointer pointer-events-auto"
          onClick={() => onOpenReport('RA-2025-000123')}
        />
      </div>

      <div className="absolute top-[55%] left-[68%] pointer-events-none">
        <div className="w-32 h-32 bg-amber-500/20 rounded-full absolute -inset-4 animate-pulse"></div>
        <button
          aria-label="Open report RA-2025-000124"
          className="block w-3.5 h-3.5 bg-amber-400 rounded-full relative z-10 shadow-[0_0_20px_#fbbf24] cursor-pointer pointer-events-auto"
          onClick={() => onOpenReport('RA-2025-000124')}
        />
      </div>

      {/* Summary cards */}
      <div className="absolute top-6 left-6 right-6 grid grid-cols-4 gap-4 z-10">
        {summary.map((s) => (
          <div key={s.label} className="bg-darkCard/90 backdrop-blur-md border border-darkBorder p-4 rounded-2xl shadow-2xl flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{s.label}</p>
              <h3 className={`text-2xl font-bold mt-0.5 ${s.valueClass}`}>{s.value}</h3>
            </div>
            <div className={`p-3 rounded-xl border ${s.iconClass}`}>
              <i className={`fa-solid ${s.icon} text-base`}></i>
            </div>
          </div>
        ))}
      </div>

      {/* Filter panel */}
      <div className="absolute top-28 left-6 w-72 bg-darkCard/90 backdrop-blur-md border border-darkBorder rounded-2xl p-5 shadow-2xl z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xs text-white uppercase tracking-wider">Road Analysis</h3>
          <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded font-medium">Bulacan Sector</span>
        </div>
        <div className="space-y-3 text-xs">
          {layers.map((l) => (
            <label key={l.label} className="flex items-center gap-3 text-slate-300 cursor-pointer hover:text-white transition">
              <input type="checkbox" defaultChecked={l.checked} className="accent-orange-500 rounded w-4 h-4" /> {l.label}
            </label>
          ))}
        </div>
        <div className="mt-5 pt-3 border-t border-darkBorder text-[11px] text-slate-400 flex justify-between items-center">
          <span>Events Processed:</span>
          <span className="font-bold text-white font-mono">1,432,504</span>
        </div>
      </div>

      {/* Metrics card */}
      <div className="absolute top-28 right-6 w-72 bg-darkCard/90 backdrop-blur-md border border-darkBorder rounded-2xl p-5 shadow-2xl z-10 space-y-4">
        <h4 className="font-bold text-xs text-white uppercase tracking-wider">Incident Metrics</h4>
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-[11px] mb-1 font-medium">
              <span className="text-slate-300">{m.label}</span>
              <span className="text-orange-400 font-bold">{m.pct}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-orange-600 to-amber-500 h-full rounded-full" style={{ width: `${m.pct}%` }}></div>
            </div>
          </div>
        ))}
        <button
          onClick={() => onNavigate('analytics-view')}
          className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-500/20 transition"
        >
          Export Full PDF / CSV Report
        </button>
      </div>
    </main>
  )
}
