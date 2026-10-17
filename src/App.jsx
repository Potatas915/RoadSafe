import { useCallback, useEffect, useState } from 'react'
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
import { backend } from './backend/client.js'
import { loadReportFeed, saveReportReview } from './backend/reports.js'
import ManagerAuth from './backend/ManagerAuth.jsx'

export default function App() {
  return backend
    ? <ManagerAuth>{(user) => <ManagerDashboard key={user.id} signedInUser={user} />}</ManagerAuth>
    : <ManagerDashboard />
}

function ManagerDashboard({ signedInUser }) {
  const live = Boolean(signedInUser)
  const [view, setView] = useState('map-view')
  const [searchLocation, setSearchLocation] = useState(null)
  const [activeReport, setActiveReport] = useState(null)
  const [response, setResponse] = useState(live ? { meta: { schemaVersion: 1 }, data: [], included: { users: [] } } : reportsResponse)
  const [source, setSource] = useState(live ? 'Loading shared reports…' : 'Demo data — changes last for this session')
  const refresh = useCallback(async () => {
    const next = await loadReportFeed(backend)
    setResponse(next)
    setSource('Connected to shared reports · refreshes every 15 seconds')
  }, [])
  useEffect(() => {
    if (!live) return
    let cancelled = false
    let inFlight = false
    async function reload() {
      if (inFlight) return
      inFlight = true
      try {
        const next = await loadReportFeed(backend)
        if (!cancelled) { setResponse(next); setSource('Connected to shared reports · refreshes every 15 seconds') }
      } catch (error) {
        if (!cancelled) setSource(`Could not refresh reports: ${error.message}. Last loaded data may be out of date.`)
      } finally { inFlight = false }
    }
    void reload()
    const timer = setInterval(reload, 15000)
    window.addEventListener('focus', reload)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [live])
  useEffect(() => {
    if (live) return
    const url = import.meta.env.VITE_REPORTS_API_URL
    if (!url) return
    const controller = new AbortController()
    setSource('Loading reports — showing demo data')
    fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((result) => { if (!result.ok) throw new Error('Reports request failed'); return result.json() })
      .then((payload) => { const next = parseReportsResponse(payload); if (!controller.signal.aborted) { setResponse(next); setSource('API data — edits are session previews only') } })
      .catch((error) => { if (!controller.signal.aborted) setSource(`Demo data — API unavailable or incompatible: ${error.message}`) })
    return () => controller.abort()
  }, [live])
  const reports = response.data
  const users = response.included.users
  const currentUser = live ? users.find((user) => user.id === signedInUser.id) : users.find((user) => user.role === ROLES.ADMIN) ?? null
  const selectedReport = reports.find((report) => report.id === activeReport) ?? null
  async function saveReport(id, patch) {
    if (!currentUser) throw new Error('Administrator profile is unavailable. Refresh and try again.')
    const current = reports.find((report) => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    if (live) {
      await saveReportReview(backend, current, patch)
      await refresh()
    } else {
      const updated = updateReport(current, patch, currentUser.id)
      const next = { ...response, data: reports.map((report) => report.id === id ? updated : report) }
      parseReportsResponse(next); setResponse(next)
    }
    setActiveReport(null)
  }
  return (
    <div data-tactical={view === 'map-view'} className="roadsafe-shell bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={setView} pendingCount={reportSummary(reports).pending} currentUser={currentUser} />
      <div className="flex-1 flex flex-col relative overflow-hidden bg-darkBg min-w-0">
        <TopBar mapSearch={view === 'map-view'} onLocationSelect={setSearchLocation} onSignOut={live ? () => backend.auth.signOut() : undefined} live={live} pendingCount={reportSummary(reports).pending} onOpenReports={() => setView('reports-view')} />
        <p className="sr-only" role="status">{source}</p>
        {view === 'map-view' && <MapView searchLocation={searchLocation} reportRecords={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'dashboard-view' && <DashboardView reports={reports} />}
        {view === 'reports-view' && <ReportsView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'officers-view' && <OfficersView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'analytics-view' && <AnalyticsView />}
      </div>
      {selectedReport && <ReportModal key={`${selectedReport.id}:${selectedReport.version ?? 0}`} report={selectedReport} users={users} live={live} onSave={saveReport} onClose={() => setActiveReport(null)} />}
    </div>
  )
}

