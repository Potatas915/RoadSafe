import { useCallback, useEffect, useMemo, useState } from 'react'
import { reportNotifications, notificationStorageKey, loadReadNotifications } from '../models/notifications.js'

const browserStorage = () => { try { return window.localStorage } catch { return null } }

export default function useNotifications(reports, accountId) {
  const key = notificationStorageKey(accountId)
  const [readIds, setReadIds] = useState(() => loadReadNotifications(browserStorage(), key))
  const [storageWarning, setStorageWarning] = useState('')
  useEffect(() => {
    setReadIds(loadReadNotifications(browserStorage(), key))
    setStorageWarning('')
    const sync = (event) => {
      if (event.key === key || event.key === null) setReadIds(loadReadNotifications(browserStorage(), key))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key])
  const notifications = useMemo(() => {
    const read = new Set(readIds)
    return reportNotifications(reports).map((item) => ({ ...item, read: read.has(item.id) }))
  }, [reports, readIds])
  const markRead = useCallback((ids) => {
    // Merge the latest browser value to avoid discarding reads from other tabs.
    setReadIds((previous) => [...new Set([...previous, ...loadReadNotifications(browserStorage(), key), ...ids])])
  }, [key])
  useEffect(() => {
    try {
      const storage = browserStorage()
      if (!storage) throw new Error('Storage unavailable')
      storage.setItem(key, JSON.stringify(readIds))
    } catch { setStorageWarning('Read state is available for this session only; browser storage is unavailable.') }
  }, [key, readIds])
  return { notifications, unreadCount: notifications.filter((item) => !item.read).length, markRead, storageWarning }
}
