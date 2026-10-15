import { officers } from '../data/mock.js'

export default function OfficersView() {
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {officers.map((o) => (
          <div key={o.name} className="bg-darkCard border border-darkBorder p-5 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-white">{o.name}</h4>
              <span className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${o.pulse ? 'animate-pulse' : ''}`}></span>
            </div>
            <p className="text-xs text-slate-400">Unit ID: {o.unit}</p>
            <div className="pt-2 border-t border-darkBorder flex justify-between items-center text-xs">
              <span className="text-slate-300">Active Assignment:</span>
              {o.assignment
                ? <span className="text-orange-400 font-mono font-bold">{o.assignment}</span>
                : <span className="text-slate-500">On Standby</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
