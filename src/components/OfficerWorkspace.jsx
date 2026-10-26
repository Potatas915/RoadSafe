import { useState } from 'react'
import { officerCases } from '../models/staffAccess.js'
import { formatDateTime } from '../models/report.js'
import { useCategoryLabel } from './CategoryContext.js'

export default function OfficerWorkspace({ reports, currentUser, onOpenReport, onSignOut, error, loading, onRefresh }) {
  const [tab, setTab] = useState('verification')
  const cases = officerCases(reports, currentUser.id)
  const label = useCategoryLabel()
  return <main className="min-h-screen bg-darkBg text-slate-100 p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Officer workspace</h1><p className="text-slate-400">{currentUser.name} · {currentUser.unit}</p></div><div className="flex gap-4"><button onClick={onRefresh} disabled={loading}>Refresh</button><button onClick={onSignOut}>Sign out</button></div></header>
    <p className="text-sm text-slate-400">Verify unassigned reports awaiting review, or update progress on your own assignments. Assignments and incident corrections are managed by an Admin. Reports refresh every 15 seconds.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading && <p role="status">Loading shared reports…</p>}
    <nav className="flex gap-3">{[['verification','Awaiting verification'],['assignments','My assignments']].map(([key,title]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg ${tab === key ? 'bg-orange-700' : 'bg-slate-800'}`}>{title} ({cases[key].length})</button>)}</nav>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{cases[tab].map(report => <article key={report.id} className="min-w-0 bg-darkCard border border-darkBorder rounded-xl p-4 space-y-2"><h2 className="font-semibold">{label(report.categoryId)} · {report.status}</h2><p className="text-sm">{report.location.address ?? 'Confirmed map location'}</p><p className="text-xs text-slate-400 break-all">{report.id} · {formatDateTime(report.occurredAt)}</p><button onClick={() => onOpenReport(report.id)} className="text-orange-300">{tab === 'verification' ? 'Review and verify' : 'Open assignment'}</button></article>)}</div>
    {!loading && !cases[tab].length && <p>No cases in this queue.</p>}
  </main>
}
