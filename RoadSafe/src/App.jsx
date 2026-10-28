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
import { reportSummary, ROLES } from './models/report.js'
import { backend } from './backend/client.js'
import { loadReportFeed, saveReportReview, saveReportDuplicate, saveReportCorrection, openAdminReview, isStaleReview } from './backend/reports.js'
import ManagerAuth from './backend/ManagerAuth.jsx'
import useNotifications from './hooks/useNotifications.js'
import { ACCIDENT_CATEGORIES } from './models/report.js'
import { loadCategories } from './backend/categories.js'
import { CategoryContext } from './components/CategoryContext.js'
import AuthLanding from './components/AuthLanding.jsx'

export default function App() {
  return backend
    ? <ManagerAuth>{(user) => user.appRole === ROLES.OFFICER ? <OfficerDashboard key={`${user.id}:Officer`} signedInUser={user} /> : <ManagerDashboard key={`${user.id}:Admin`} signedInUser={user} />}</ManagerAuth>
    : <AuthLanding status="Configuration required"><p className="text-sm text-slate-300">Connect RoadSafe to its backend to sign in and load reports.</p></AuthLanding>
}

function ManagerDashboard({ signedInUser }) {
  const live = Boolean(signedInUser)
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
  const [view, setView] = useState('map-view')
  const [searchLocation, setSearchLocation] = useState(null)
  const [activeReport, setActiveReport] = useState(null)
  const [openingReview, setOpeningReview] = useState(false)
  const [reviewOpenError, setReviewOpenError] = useState('')
  const [response, setResponse] = useState({ meta: { schemaVersion: 1 }, data: [], included: { users: [] } })
  const [source, setSource] = useState('Loading reports…')
  const refresh = useCallback(async () => {
    const next = await loadReportFeed(backend)
    setResponse(next)
    setSource('Reports · refreshes every 15 seconds')
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
        if (!cancelled) { setResponse(next); setSource('Reports · refreshes every 15 seconds') }
      } catch (error) {
        if (!cancelled) setSource(`Could not refresh reports: ${error.message}. Last loaded data may be out of date.`)
      } finally { inFlight = false }
    }
    void reload()
    const timer = setInterval(reload, 15000)
    window.addEventListener('focus', reload)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [live])
  const reports = response.data
  const users = response.included.users

  const displayed = response
  const { notifications, unreadCount, markRead, storageWarning } = useNotifications(reports, signedInUser.id, live ? backend : null)
  const currentUser = users.find((user) => user.id === signedInUser.id) ?? null
  const selectedReport = displayed.data.find((report) => report.id === activeReport) ?? null
  function viewReportOnMap(report) {
    const { longitude, latitude } = report.location.coordinates

    setActiveReport(null)
    setSearchLocation({ reportId: report.id, coordinates: [longitude, latitude] })
    setView('map-view')
  }
  async function openReview(id) {
    if (openingReview) return
    const report = displayed.data.find(item => item.id === id)
    if (!report) return
    setOpeningReview(true); setReviewOpenError('')
    try { await openAdminReview({ client: backend, report, live: live, actorRole: signedInUser?.appRole, refresh, open: setActiveReport }) }
    catch (error) { setReviewOpenError(`Could not open review: ${error.message}`) }
    finally { setOpeningReview(false) }
  }
  async function saveReport(id, patch, { keepOpen = false } = {}) {
    if (!currentUser) throw new Error('Administrator profile is unavailable. Refresh and try again.')
    const current = reports.find(report => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    try { await saveReportReview(backend, current, patch) }
    catch (error) { if (!(keepOpen && isStaleReview(error))) throw error }
    await refresh()
    if (!keepOpen) setActiveReport(null)
  }
  async function correctReport(id, values, reason) {
    const current = reports.find(report => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    await saveReportCorrection(backend, current, values, reason)
    await refresh()
    setActiveReport(null)
  }
  async function saveDuplicate(id, originalId, reason) {
    const current = reports.find(report => report.id === id)
    if (!current) throw new Error('Report no longer exists.')
    await saveReportDuplicate(backend, current, originalId, reason)
    await refresh()
    setActiveReport(null)
  }
  return (
    <CategoryContext.Provider value={categories}><div data-tactical={view === 'map-view'} className="roadsafe-shell bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={(nextView) => { if (nextView !== view) setActiveReport(null); setView(nextView) }} pendingCount={reportSummary(reports).pending} currentUser={currentUser} live={live} />
      <div className="roadsafe-stage flex-1 flex flex-col relative overflow-hidden bg-darkBg min-w-0">
        <TopBar mapSearch={view === 'map-view'} onLocationSelect={setSearchLocation} onSignOut={() => backend.auth.signOut()} live={live} notifications={notifications} unreadCount={unreadCount} onReadNotifications={markRead} notificationStorageWarning={storageWarning} onOpenNotificationReport={(id, accountId) => { if (accountId) { setView('accounts-view'); return }; setView('reports-view'); setActiveReport(id) }} />
        <p className="sr-only" role="status">{source}</p>
        {categoryError && <p role="alert" className="px-6 py-2 text-amber-300 text-xs">{categoryError}</p>}
        <div style={{ display: view === 'map-view' ? 'flex' : 'none', flex: 1, minHeight: 0, minWidth: 0 }}>
          <MapView searchLocation={searchLocation} reportRecords={displayed.data} users={displayed.included.users} onOpenReport={setActiveReport} enforcerClient={live ? backend : null} onAssigned={refresh} />
        </div>
        {view === 'dashboard-view' && <DashboardView reports={displayed.data} onOpenReport={setActiveReport} />}
        {view === 'reports-view' && <ReportsView onReview={openReview} openingReview={openingReview} reviewOpenError={reviewOpenError} reports={displayed.data} users={displayed.included.users} onOpenReport={setActiveReport} selectedReportId={activeReport} />}
        {view === 'officers-view' && <OfficersView reports={displayed.data} users={live ? users : []} onOpenReport={setActiveReport} />}
        {view === 'accounts-view' && live && <AccountsView client={backend} currentUserId={signedInUser?.id} />}
        {view === 'analytics-view' && <AnalyticsView reports={reports} users={users} source="Reports" />}
      </div>
      {selectedReport && view === 'dashboard-view' && <DashboardReportSummary key={selectedReport.id + ":" + (selectedReport.version ?? 0)} report={selectedReport} onClose={() => setActiveReport(null)} onManage={() => setView('reports-view')} />}
      {selectedReport && view !== 'dashboard-view' && <ReportModal key={selectedReport.id + ":" + (selectedReport.version ?? 0)} report={selectedReport} users={displayed.included.users} live={live} onSave={saveReport} reports={displayed.data} onDuplicate={saveDuplicate} onCorrect={live ? correctReport : undefined} onOpenOriginal={setActiveReport} onViewOnMap={viewReportOnMap} onClose={() => setActiveReport(null)} />}
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

