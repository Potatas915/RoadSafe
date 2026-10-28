import LocationSearch from './LocationSearch.jsx'
import NotificationBell from './NotificationBell.jsx'
import useTheme from '../hooks/useTheme.js'

export default function TopBar({ live = false, notifications, unreadCount, onReadNotifications, onOpenNotificationReport, notificationStorageWarning, mapSearch, onLocationSelect, onSignOut }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <header className="roadsafe-topbar shrink-0 h-14 bg-shell/70 backdrop-blur-2xl border-b border-edge/[0.08] px-5 flex items-center justify-between z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold bg-edge/[0.05] border border-edge/10 px-3 py-1.5 rounded-full text-slate-300">
          <i className="fa-solid fa-location-dot text-orange-500"></i> Region: Central Luzon / Bulacan
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {live ? 'Connected' : 'Web prototype'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {mapSearch ? <LocationSearch onSelect={onLocationSelect} /> : <div className="relative">
          <input
            type="text"
            aria-label="Search"
            placeholder="Search report ID, location, officer..."
            className="bg-edge/[0.05] border border-edge/10 rounded-full px-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brandOrange w-64"
          />
          <i className="fa-solid fa-magnifying-glass absolute right-3 top-2 text-slate-400 text-xs"></i>
        </div>}
        <button type="button" onClick={toggle} aria-pressed={dark} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} className="w-9 h-9 rounded-full border border-edge/10 bg-edge/[0.05] text-slate-400 hover:text-strong hover:bg-edge/10 transition"><i className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" /></button>
        <NotificationBell live={live} notifications={notifications} unreadCount={unreadCount} onRead={onReadNotifications} onOpenReport={onOpenNotificationReport} storageWarning={notificationStorageWarning} />
        {onSignOut && <button type="button" onClick={onSignOut} title="Log out of RoadTrack" className="flex h-9 items-center gap-2 rounded-full border border-edge/10 bg-edge/[0.05] px-3.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"><i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Log out</button>}
      </div>
    </header>
  )
}

