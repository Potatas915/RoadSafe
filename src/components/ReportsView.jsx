import { reports } from '../data/mock.js'

export default function ReportsView({ onOpenReport }) {
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-darkCard border border-darkBorder rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-darkBorder flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-white">Accident Reports Management</h3>
            <p className="text-xs text-slate-400">Review, verify, and assign incoming public submissions</p>
          </div>
          <div className="flex items-center gap-3">
            <select aria-label="Filter by status" className="bg-darkBg border border-darkBorder text-xs rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-brandOrange">
              <option>All Statuses</option>
              <option>Pending Review</option>
              <option>Verified</option>
              <option>In Progress</option>
              <option>Closed</option>
            </select>
            <button className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold shadow transition">
              <i className="fa-solid fa-filter mr-1.5"></i> Filter Logs
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-darkBorder uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-4">Report ID</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Location</th>
                <th className="p-4">Accident Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Assigned Officer</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder text-slate-300">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition cursor-pointer" onClick={() => onOpenReport(r.id)}>
                  <td className="p-4 font-mono font-bold text-white">{r.id}</td>
                  <td className="p-4 text-slate-400">{r.timestamp}</td>
                  <td className="p-4">{r.location}</td>
                  <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${r.typeClass}`}>{r.type}</span></td>
                  <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${r.statusClass}`}>{r.status}</span></td>
                  <td className={`p-4 ${r.officer === 'Unassigned' ? 'text-slate-400' : 'text-slate-200'}`}>{r.officer}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenReport(r.id) }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition"
                    >
                      {r.action}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
