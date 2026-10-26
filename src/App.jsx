import './components/IncidentPhotoCarousel.css'
import './components/ReportsView.css'
import DashboardReportSummary from './components/DashboardReportSummary.jsx'
import AccountsView from './components/AccountsView.jsx'
import OfficerWorkspace from './components/OfficerWorkspace.jsx'
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
import { loadReportFeed, saveReportReview, saveReportDuplicate, saveReportCorrection } from './backend/reports.js'
import { applyDuplicateReview } from './models/reportDuplicates.js'
import ManagerAuth from './backend/ManagerAuth.jsx'
import useNotifications from './hooks/useNotifications.js'
import { ACCIDENT_CATEGORIES } from './models/report.js'
import { loadCategories, saveCategory } from './backend/categories.js'
import { CategoryContext } from './components/CategoryContext.js'
import SettingsView from './components/SettingsView.jsx'
import AuthLanding from './components/AuthLanding.jsx'
import DemoEntryPanel from './components/DemoEntryPanel.jsx'

export default function App() {
  return backend
    ? <ManagerAuth>{(user) => user.appRole === ROLES.OFFICER ? <OfficerDashboard key={`${user.id}:Officer`} signedInUser={user} /> : <ManagerDashboard key={`${user.id}:Admin`} signedInUser={user} />}</ManagerAuth>
    : <ManagerDashboard />
}

function ManagerDashboard({ signedInUser }) {
  const live = Boolean(signedInUser)
  const [signedOut, setSignedOut] = useState(false)
  const [categories, setCategories] = useState(ACCIDENT_CATEGORIES)
  const [categoryError, setCategoryError] = useState('')
  const refreshCategories = useCallback(async () => {
    if (!live) return
    try {
      const next = await loadCategories(backend)
      setCategories(previous => next.map(row => {
        const current = previous.find(item => item.id === row.id)
        return current?.version > row.version ? current : row
      }))
      setCategoryError('')
    }
    catch { setCategoryError('Could not load current category settings. Refresh to retry; displayed names may be out of date.') }
  }, [live])
  useEffect(() => {
    void refreshCategories()
    const timer = live ? setInterval(refreshCategories, 15000) : null
    return () => clearInterval(timer)
  }, [live, refreshCategories])
  async function updateCategory(category, patch) {
    if (!live) throw new Error('Administrator sign-in required.')
    const saved = await saveCategory(backend, category, patch)
    setCategories(previous => previous.map(row => row.id === saved.id ? { ...row, ...saved } : row))
  }
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
  const previewing = demoPreview && ['map-view', 'dashboard-view', 'reports-view'].includes(view)
  const displayed = previewing ? demoResponse : response
  const { notifications, unreadCount, markRead, storageWarning } = useNotifications(reports, live ? signedInUser.id : 'demo')
  const currentUser = live ? users.find((user) => user.id === signedInUser.id) : users.find((user) => user.role === ROLES.ADMIN) ?? null
  const selectedReport = displayed.data.find((report) => report.id === activeReport) ?? null
  function viewReportOnMap(report) {
    const { longitude, latitude } = report.location.coordinates
    setActiveReport(null)
    setSearchLocation({ reportId: report.id, coordinates: [longitude, latitude] })
    setView('map-view')
  }
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
  async function correctReport(id, values, reason) {
    const current = reports.find(report => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    await saveReportCorrection(backend, current, values, reason)
    await refresh()
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
  // The web prototype has no real accounts: logging out shows the landing page with a way back in.
  if (signedOut && !live) return <AuthLanding status="Web prototype"><DemoEntryPanel user={currentUser} onEnter={() => setSignedOut(false)} /></AuthLanding>
  return (
    <CategoryContext.Provider value={categories}><div data-tactical={view === 'map-view'} className="roadsafe-shell bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={(nextView) => { if (nextView !== view) setActiveReport(null); setView(nextView) }} pendingCount={reportSummary(reports).pending} currentUser={currentUser} live={live} />
      <div className="roadsafe-stage flex-1 flex flex-col relative overflow-hidden bg-darkBg min-w-0">
        <TopBar mapSearch={view === 'map-view'} onLocationSelect={setSearchLocation} onSignOut={live ? () => backend.auth.signOut() : () => setSignedOut(true)} live={live} notifications={notifications} unreadCount={unreadCount} onReadNotifications={markRead} notificationStorageWarning={storageWarning} onOpenNotificationReport={(id) => { setDemoPreview(false); setView('reports-view'); setActiveReport(id) }} />
        <p className="sr-only" role="status">{source}</p>
        {categoryError && view !== 'settings-view' && <p role="alert" className="px-6 py-2 text-amber-300 text-xs">{categoryError}</p>}
        {view === 'settings-view' && <SettingsView categories={categories} onSave={updateCategory} error={categoryError} onRefresh={refreshCategories} live={live} />}
        {['map-view', 'dashboard-view', 'reports-view'].includes(view) && <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-2 border-b border-edge/[.08] bg-edge/[.03] text-xs">
          <p className={previewing ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}>{previewing ? `${displayed.data.length} fictional demo reports · preview changes last for this session` : source}</p>
          <label className="flex items-center gap-2 text-slate-200">Report source
            <select aria-label="Report source" value={demoPreview ? 'demo' : 'current'} onChange={(event) => { setActiveReport(null); setDemoPreview(event.target.value === 'demo') }} className="rounded-xl border border-edge/15 bg-edge/[.06] px-3 py-1.5 text-slate-200">
              <option value="demo">Demo reports (49)</option><option value="current">{live ? 'Shared reports' : 'Current session reports'}</option>
            </select>
          </label>
        </div>}
        <div style={{ display: view === 'map-view' ? 'flex' : 'none', flex: 1, minHeight: 0, minWidth: 0 }}>
          <MapView searchLocation={searchLocation} reportRecords={displayed.data} users={displayed.included.users} onOpenReport={setActiveReport} enforcerClient={live && !previewing ? backend : null} enforcerRosterClient={live ? backend : null} onAssigned={refresh} />
        </div>
        {view === 'dashboard-view' && <DashboardView reports={displayed.data} onOpenReport={setActiveReport} />}
        {view === 'reports-view' && <ReportsView reports={displayed.data} users={displayed.included.users} onOpenReport={setActiveReport} selectedReportId={activeReport} detailPanel={selectedReport ? <ReportModal embedded key={`${previewing ? 'demo' : 'current'}:${selectedReport.id}:${selectedReport.version ?? 0}`} report={selectedReport} users={displayed.included.users} live={live && !previewing} onSave={saveReport} reports={displayed.data} onDuplicate={saveDuplicate} onCorrect={live && !previewing ? correctReport : undefined} onOpenOriginal={setActiveReport} onViewOnMap={viewReportOnMap} onClose={() => setActiveReport(null)} /> : null} />}
        {view === 'officers-view' && <OfficersView reports={reports} users={users} onOpenReport={setActiveReport} />}
        {view === 'accounts-view' && live && <AccountsView client={backend} currentUserId={signedInUser?.id} />}
        {view === 'analytics-view' && <AnalyticsView reports={reports} users={users} source={live ? 'Shared reports' : 'Demo / session preview'} />}
      </div>
      {selectedReport && view === 'dashboard-view' && <DashboardReportSummary key={selectedReport.id} report={selectedReport} onClose={() => setActiveReport(null)} onManage={() => setView('reports-view')} />}
      {selectedReport && !['dashboard-view', 'reports-view'].includes(view) && <ReportModal key={`${previewing ? 'demo' : 'current'}:${selectedReport.id}:${selectedReport.version ?? 0}`} report={selectedReport} users={displayed.included.users} live={live && !previewing} onSave={saveReport} reports={displayed.data} onDuplicate={saveDuplicate} onCorrect={live && !previewing ? correctReport : undefined} onOpenOriginal={setActiveReport} onViewOnMap={viewReportOnMap} onClose={() => setActiveReport(null)} />}
    </div></CategoryContext.Provider>
  )
}

function OfficerDashboard({ signedInUser }) {
  const [response, setResponse] = useState({ data: [], included: { users: [] } })
  const [categories, setCategories] = useState(ACCIDENT_CATEGORIES)
  const [activeReport, setActiveReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let cancelled = false, inFlight = false
    async function reload() {
      if (inFlight) return
      inFlight = true
      try {
        const [next, catalog] = await Promise.all([loadReportFeed(backend), loadCategories(backend)])
        if (!cancelled) { setResponse(next); setCategories(catalog); setError('') }
      } catch (failure) { if (!cancelled) setError(`Could not refresh reports: ${failure.message}. Last loaded data may be out of date.`) }
      finally { inFlight = false; if (!cancelled) setLoading(false) }
    }
    void reload()
    const timer = setInterval(reload, 15000)
    window.addEventListener('focus', reload)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [refreshKey])
  async function save(id, patch) {
    const report = response.data.find(row => row.id === id)
    if (!report) throw new Error('This report is no longer available. Refresh your queue.')
    await saveReportReview(backend, report, patch)
    setActiveReport(null)
    setRefreshKey(key => key + 1)
  }
  const currentUser = response.included.users.find(user => user.id === signedInUser.id) ?? { id: signedInUser.id, name: 'Officer', unit: '' }
  const selected = response.data.find(report => report.id === activeReport)
  return <CategoryContext.Provider value={categories}>
    <OfficerWorkspace reports={response.data} currentUser={currentUser} onOpenReport={setActiveReport} onSignOut={() => backend.auth.signOut()} error={error} loading={loading} onRefresh={() => setRefreshKey(key => key + 1)} />
    {selected && <ReportModal key={`${selected.id}:${selected.version}`} report={selected} users={response.included.users} actorRole={ROLES.OFFICER} viewerId={signedInUser.id} live onSave={save} onClose={() => setActiveReport(null)} />}
  </CategoryContext.Provider>
}

