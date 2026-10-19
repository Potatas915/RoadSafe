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
import { loadReportFeed, saveReportReview, saveReportDuplicate } from './backend/reports.js'
import { applyDuplicateReview } from './models/reportDuplicates.js'
import ManagerAuth from './backend/ManagerAuth.jsx'
import useNotifications from './hooks/useNotifications.js'

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
  const [demoPreview, setDemoPreview] = useState(true)
  const [demoResponse, setDemoResponse] = useState(() => structuredClone(reportsResponse))
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
  const previewing = demoPreview && ['dashboard-view', 'reports-view'].includes(view)
  const displayed = previewing ? demoResponse : response
  const { notifications, unreadCount, markRead, storageWarning } = useNotifications(reports, live ? signedInUser.id : 'demo')
  const currentUser = live ? users.find((user) => user.id === signedInUser.id) : users.find((user) => user.role === ROLES.ADMIN) ?? null
  const selectedReport = displayed.data.find((report) => report.id === activeReport) ?? null
  async function saveReport(id, patch) {
    const actor = previewing ? demoResponse.included.users.find((user) => user.role === ROLES.ADMIN) : currentUser
    if (!actor) throw new Error('Administrator profile is unavailable. Refresh and try again.')
    const current = displayed.data.find((report) => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    if (patch.status === 'Rejected' && displayed.data.some(r => r.duplicateOfReportId === id)) throw new Error('This original report has linked duplicates. Clear their flags before rejecting it.')
    if (live && !previewing) {
      await saveReportReview(backend, current, patch)
      await refresh()
    } else {
      const updated = updateReport(current, patch, actor.id)
      if (updated.status !== current.status) {
        updated.events = [...(current.events ?? []), { id: crypto.randomUUID(), type: 'review_updated',
          fromStatus: current.status, status: updated.status, createdAt: new Date().toISOString() }]
      }
      const next = { ...displayed, data: displayed.data.map((report) => report.id === id ? updated : report) }
      parseReportsResponse(next)
      if (previewing) setDemoResponse(next)
      else setResponse(next)
    }
    setActiveReport(null)
  }
  async function saveDuplicate(id, originalId, reason) {
    const actor = previewing ? demoResponse.included.users.find(user => user.role === ROLES.ADMIN) : currentUser
    const current = displayed.data.find(report => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    const updated = applyDuplicateReview(displayed.data, id, originalId, reason, actor)
    if (live && !previewing) {
      await saveReportDuplicate(backend, current, originalId, reason)
      await refresh()
    } else {
      const next = { ...displayed, data: displayed.data.map(report => report.id === id ? updated : report) }
      parseReportsResponse(next)
      if (previewing) setDemoResponse(next)
      else setResponse(next)
    }
    setActiveReport(null)
  }
  return (
    <div data-tactical={view === 'map-view'} className="roadsafe-shell bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={setView} pendingCount={reportSummary(reports).pending} currentUser={currentUser} />
      <div className="flex-1 flex flex-col relative overflow-hidden bg-darkBg min-w-0">
        <TopBar mapSearch={view === 'map-view'} onLocationSelect={setSearchLocation} onSignOut={live ? () => backend.auth.signOut() : undefined} live={live} notifications={notifications} unreadCount={unreadCount} onReadNotifications={markRead} notificationStorageWarning={storageWarning} onOpenNotificationReport={(id) => { setDemoPreview(false); setView('reports-view'); setActiveReport(id) }} />
        <p className="sr-only" role="status">{source}</p>
        {['dashboard-view', 'reports-view'].includes(view) && <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-darkBorder bg-darkCard text-xs">
          <p className={previewing ? 'text-amber-300' : 'text-slate-400'}>{previewing ? `${displayed.data.length} fictional demo reports · preview changes last for this session` : source}</p>
          <label className="flex items-center gap-2 text-slate-200">Report source
            <select aria-label="Dashboard and reports source" value={demoPreview ? 'demo' : 'current'} onChange={(event) => { setActiveReport(null); setDemoPreview(event.target.value === 'demo') }} className="rounded-lg border border-darkBorder bg-darkBg px-3 py-2">
              <option value="demo">Demo reports (49)</option><option value="current">{live ? 'Shared reports' : 'Current session reports'}</option>
            </select>
          </label>
        </div>}
        {view === 'map-view' && <MapView searchLocation={searchLocation} reportRecords={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'dashboard-view' && <DashboardView reports={displayed.data} onOpenReport={setActiveReport} />}
        {view === 'reports-view' && <ReportsView reports={displayed.data} users={displayed.included.users} onOpenReport={setActiveReport} />}
        {view === 'officers-view' && <OfficersView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'analytics-view' && <AnalyticsView reports={reports} users={users} source={live ? 'Shared reports' : 'Demo / session preview'} />}
      </div>
      {selectedReport && <ReportModal key={`${previewing ? 'demo' : 'current'}:${selectedReport.id}:${selectedReport.version ?? 0}`} report={selectedReport} users={displayed.included.users} live={live && !previewing} onSave={saveReport} reports={displayed.data} onDuplicate={saveDuplicate} onOpenOriginal={setActiveReport} onClose={() => setActiveReport(null)} />}
    </div>
  )
}

