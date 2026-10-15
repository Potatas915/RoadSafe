import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import MapView from './components/MapView.jsx'
import DashboardView from './components/DashboardView.jsx'
import ReportsView from './components/ReportsView.jsx'
import OfficersView from './components/OfficersView.jsx'
import AnalyticsView from './components/AnalyticsView.jsx'
import ReportModal from './components/ReportModal.jsx'

export default function App() {
  const [view, setView] = useState('map-view')
  const [activeReport, setActiveReport] = useState(null)

  return (
    <div className="bg-darkBg text-slate-100 font-sans antialiased h-screen flex overflow-hidden">
      <Sidebar view={view} onChange={setView} />

      <div className="flex-1 flex flex-col relative overflow-hidden bg-darkBg">
        <TopBar />
        {view === 'map-view' && <MapView onOpenReport={setActiveReport} onNavigate={setView} />}
        {view === 'dashboard-view' && <DashboardView />}
        {view === 'reports-view' && <ReportsView onOpenReport={setActiveReport} />}
        {view === 'officers-view' && <OfficersView />}
        {view === 'analytics-view' && <AnalyticsView />}
      </div>

      <ReportModal reportId={activeReport} onClose={() => setActiveReport(null)} />
    </div>
  )
}
