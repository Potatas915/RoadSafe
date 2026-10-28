import { useState } from 'react'
import useTheme from '../hooks/useTheme.js'

const items = [
  { id: 'map-view', label: 'GIS Tactical Map', icon: 'fa-earth-americas' },
  { id: 'dashboard-view', label: 'Dashboard Overview', icon: 'fa-chart-pie' },
  { id: 'reports-view', label: 'Report Management', icon: 'fa-triangle-exclamation', badge: true },
  { id: 'officers-view', label: 'Officer Dispatch', icon: 'fa-user-shield' },
  { id: 'analytics-view', label: 'Analytics & Exports', icon: 'fa-chart-line' },
  { id: 'accounts-view', label: 'Account Management', icon: 'fa-users-gear' },
]

const STORAGE_KEY = 'roadsafe-sidebar-collapsed'
const readCollapsed = () => { try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false } }

export default function Sidebar({ view, onChange, pendingCount, currentUser, live = false }) {
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => setCollapsed((value) => {
    try { localStorage.setItem(STORAGE_KEY, value ? '0' : '1') } catch { /* preference just won't persist */ }
    return !value
  })
  const initials = currentUser?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('') ?? '?'
  const base = `relative w-full flex items-center rounded-xl transition text-left whitespace-nowrap ${collapsed ? 'justify-center h-11' : 'gap-2.5 px-3 py-2 text-[13px]'}`
  const active = `${base} bg-gradient-to-r from-orange-500/20 to-orange-500/5 text-orange-600 dark:text-orange-300 ring-1 ring-inset ring-orange-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`
  const idle = `${base} text-slate-400 hover:bg-edge/5 hover:text-strong`

  return (
    <aside data-collapsed={collapsed} className={`relative ${collapsed ? 'w-[76px]' : 'w-64'} shrink-0 bg-shell/80 backdrop-blur-2xl border-r border-edge/[0.08] flex flex-col justify-between z-30 shadow-2xl transition-[width] duration-300 ease-out`}>
      <div>
        <div className={`h-14 flex items-center border-b border-edge/[0.08] ${collapsed ? 'justify-center' : 'px-4 gap-3'}`}>
          <img src={`/brand/roadsafe-logo-${theme}.png`} alt="RoadTrack" width="36" height="36" className="w-9 h-9 shrink-0 rounded-[10px] shadow-lg shadow-orange-500/15 ring-1 ring-edge/10" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-strong">RoadTrack Admin</h1>
              <p className="mt-0.5 text-[11px] tracking-wide text-slate-400">Bulacan Command Center</p>
            </div>
          )}
        </div>

        <nav aria-label="Main" className={`${collapsed ? 'p-2.5' : 'p-3'} space-y-1 text-sm font-medium`}>
          {items.filter(item => item.id !== 'accounts-view' || live).map((item) => (
            <button key={item.id} onClick={() => onChange(item.id)} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? active : idle}>
              <i className={`fa-solid ${item.icon} w-5 text-center`} aria-hidden="true"></i>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.badge && (collapsed
                ? <span className="absolute top-1 right-1.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white leading-none">{pendingCount}</span>
                : <span className="ml-auto bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] px-1.5 py-0.5 rounded-full font-bold">{pendingCount}</span>)}
            </button>
          ))}
        </nav>

        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden md:grid absolute -right-3 top-[70px] w-6 h-6 place-items-center rounded-full border border-edge/15 bg-shell text-slate-400 hover:text-strong shadow-md transition">
          <i className={`fa-solid fa-chevron-left text-[10px] transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true"></i>
        </button>
      </div>

      <div className={`border-t border-edge/[0.08] flex ${collapsed ? 'flex-col items-center gap-3 py-3' : 'items-center justify-between p-3.5'}`}>
        <div className="flex items-center gap-3 min-w-0" title={collapsed ? currentUser?.name : undefined}>
          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center font-bold text-white text-xs shadow">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-semibold text-strong truncate">{currentUser?.name ?? 'No demo administrator'}</p>
              <p className="text-[10px] text-slate-400">{currentUser?.role ?? 'Unassigned role'}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
