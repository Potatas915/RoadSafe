import { useCallback, useEffect, useMemo, useState } from 'react'
import { reportNotifications, notificationStorageKey, loadReadNotifications, mergeNotifications } from '../models/notifications.js'
import { loadEnforcerNotifications } from '../backend/accounts.js'

const browserStorage = () => { try { return window.localStorage } catch { return null } }

export default function useNotifications(reports, accountId, adminClient = null) {
  const [registrations, setRegistrations] = useState([])
  const [registrationError, setRegistrationError] = useState('')
  useEffect(() => {
    let cancelled = false
    let inFlight = false
    setRegistrations([])
    setRegistrationError('')
    if (!adminClient) return
    async function refresh() {
      if (inFlight) return
      inFlight = true
      try {
        const items = await loadEnforcerNotifications(adminClient)
        if (!cancelled) { setRegistrations(items); setRegistrationError('') }
      } catch {
        if (!cancelled) setRegistrationError('Could not refresh enforcer registrations. Retrying every 15 seconds.')
      } finally { inFlight = false }
    }
    void refresh()
    const timer = setInterval(refresh, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [adminClient, accountId])
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
    return mergeNotifications(registrations, reportNotifications(reports), readIds)
  }, [reports, readIds, registrations])
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
  return { notifications, unreadCount: notifications.filter((item) => !item.read).length, markRead, storageWarning: [registrationError, storageWarning].filter(Boolean).join(' ') }
}
