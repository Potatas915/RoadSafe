import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '../models/report.js'

export function NotificationList({ notifications, onRead, onOpenReport }) {
  if (!notifications.length) return <p className="p-4 text-xs text-slate-400">No notifications yet. Confirmed submissions and status changes will appear here.</p>
  return <ul className="divide-y divide-darkBorder">
    {notifications.map((item) => <li key={item.id} className={`p-3 space-y-2 ${item.read ? '' : 'bg-orange-500/[.08]'}`}>
      <button type="button" className="block w-full text-left space-y-1 rounded focus-visible:outline focus-visible:outline-orange-500" onClick={() => { onRead([item.id]); onOpenReport(item.reportId) }}>
        <span className="block text-xs font-semibold text-strong">{!item.read && <span className="text-orange-400">Unread · </span>}{item.title}</span>
        <span className="block text-xs text-slate-300 break-words">{item.message}</span>
        <time className="block text-[11px] text-slate-400" dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
      </button>
      {!item.read && <button type="button" onClick={() => onRead([item.id])} className="text-xs text-orange-400 hover:underline">Mark as read</button>}
    </li>)}
  </ul>
}

export default function NotificationBell({ notifications = [], unreadCount = 0, onRead, onOpenReport, storageWarning, live }) {
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const trigger = useRef(null)
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div ref={container} className="relative">
    <button ref={trigger} type="button" aria-label={`Notifications, ${unreadCount} unread`} title="Notifications" aria-expanded={open} aria-controls="roadsafe-notifications" onClick={() => setOpen(!open)} className="relative p-2 text-slate-400 hover:text-strong bg-darkBg border border-darkBorder rounded-lg transition">
      <i className="fa-regular fa-bell text-sm" aria-hidden="true" />
      {unreadCount > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 px-1 bg-orange-500 text-white rounded-full text-[10px]">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    <span role="status" className="sr-only">{unreadCount} unread notifications</span>
    {open && <section id="roadsafe-notifications" aria-label="Notifications" className="absolute right-0 top-full mt-3 w-96 max-w-[calc(100vw-32px)] roadsafe-popover rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-darkBorder space-y-2">
        <div className="flex justify-between items-center gap-3">
          <h2 className="text-sm font-semibold text-strong">Notifications</h2>
          <button type="button" disabled={!unreadCount} onClick={() => onRead(notifications.map((item) => item.id))} className="text-xs text-orange-400 disabled:opacity-40">Mark all as read</button>
          <button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus() }} className="text-slate-400 hover:text-strong">×</button>
        </div>
        <p className="text-[11px] text-slate-400">{live ? 'Report activity · refreshes every 15 seconds' : 'Demo activity · changes last for this session'}. Read state is saved in this browser.</p>
        {storageWarning && <p role="alert" className="text-xs text-orange-300">{storageWarning}</p>}
      </div>
      <div className="max-h-[min(60vh,480px)] overflow-y-auto">
        <NotificationList notifications={notifications} onRead={onRead} onOpenReport={(id) => { setOpen(false); onOpenReport(id) }} />
      </div>
    </section>}
  </div>
}
