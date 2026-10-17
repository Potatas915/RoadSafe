import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import MapView from './components/MapView.jsx'
import DashboardView from './components/DashboardView.jsx'
import ReportsView from './components/ReportsView.jsx'
import OfficersView from './components/OfficersView.jsx'
import AnalyticsView from './components/AnalyticsView.jsx'
import ReportModal from './components/ReportModal.jsx'
import { reportsResponse } from './data/reports.js'
import { parseReportsResponse, reportSummary, ROLES, updateReport } from './models/report.js'

export default function App() {
  const [view, setView] = useState('map-view')
  const [activeReport, setActiveReport] = useState(null)
  const [response, setResponse] = useState(reportsResponse)
  const [source, setSource] = useState('Demo data — changes last for this session')
  useEffect(() => {
    const url = import.meta.env.VITE_REPORTS_API_URL
    if (!url) return
    const controller = new AbortController()
    setSource('Loading reports — showing demo data')
    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((result) => { if (!result.ok) throw new Error('Reports request failed'); return result.json() })
      .then((payload) => { const next = parseReportsResponse(payload); if (!controller.signal.aborted) { setResponse(next); setSource('API data — edits are session previews only') } })
      .catch((error) => { if (!controller.signal.aborted) setSource(`Demo data — API unavailable or incompatible: ${error.message}`) })
    return () => controller.abort()
  }, [])
  const reports = response.data
  const users = response.included.users
  const currentUser = users.find((user) => user.role === ROLES.ADMIN) ?? null
  const selectedReport = reports.find((report) => report.id === activeReport) ?? null
  function saveReport(id, patch) {
    const actor = currentUser
    if (!actor) throw new Error('No demo administrator is available to preview changes.')
    const current = reports.find((report) => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    const updated = updateReport(current, patch, actor.id)
    const next = { ...response, data: reports.map((report) => report.id === id ? updated : report) }
    parseReportsResponse(next)
    setResponse(next)
    setActiveReport(null)
  }
  return (
    <div className="bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={setView} pendingCount={reportSummary(reports).pending} currentUser={currentUser} />
      <div className="flex-1 flex flex-col relative overflow-hidden bg-darkBg min-w-0">
        <TopBar />
        <p role="status" className="px-6 py-2 text-xs text-amber-300 border-b border-darkBorder">{source}</p>
        {view === 'map-view' && <MapView reportRecords={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'dashboard-view' && <DashboardView reports={reports} />}
        {view === 'reports-view' && <ReportsView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'officers-view' && <OfficersView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'analytics-view' && <AnalyticsView />}
      </div>
      {selectedReport && <ReportModal key={selectedReport.id} report={selectedReport} users={users} onSave={saveReport} onClose={() => setActiveReport(null)} />}
    </div>
  )
}
