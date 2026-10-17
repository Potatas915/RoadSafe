import { ROLES, REPORT_STATUS } from '../models/report.js'
export default function OfficersView({ reports, users, onOpenReport }) {
  return <main className="flex-1 p-6 overflow-y-auto"><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
    {users.filter((u) => u.role === ROLES.OFFICER).map((officer) => {
      const assignments = reports.filter((r) => r.assignedOfficerId === officer.id && ![REPORT_STATUS.CLOSED, REPORT_STATUS.REJECTED].includes(r.status))
      return <section key={officer.id} className="bg-darkCard border border-darkBorder p-5 rounded-2xl space-y-3"><h3 className="font-bold">{officer.name}</h3><p className="text-xs text-slate-400">{officer.unit} · {officer.responderType}</p><h4 className="text-xs">Report assignments</h4>{assignments.length ? assignments.map((r) => <button key={r.id} onClick={() => onOpenReport(r.id)} className="block text-orange-300 text-xs">{r.id} — {r.status}</button>) : <p className="text-xs text-slate-400">No active report assignments</p>}</section>
    })}
  </div></main>
}
