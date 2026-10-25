import { useSyncExternalStore } from 'react'

// 'light' | 'dark' | 'system'. System is the default until the person picks one.
const KEY = 'roadsafe-theme'
const listeners = new Set()
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null

function readPreference() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch { return 'system' }
}

let preference = typeof window === 'undefined' ? 'system' : readPreference()
const resolve = (value) => value === 'system' ? (media?.matches ? 'light' : 'dark') : value
let snapshot = `${preference}|${resolve(preference)}`

function apply() {
  if (typeof document === 'undefined') return
  const resolved = resolve(preference)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b0f19' : '#eef2f7')
}

function update() {
  snapshot = `${preference}|${resolve(preference)}`
  apply()
  listeners.forEach((listener) => listener())
}

media?.addEventListener?.('change', () => { if (preference === 'system') update() })
apply()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setThemePreference(next) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch { /* storage can be unavailable; the choice still applies for this session */ }
  update()
}

export default function useTheme() {
  const [pref, theme] = useSyncExternalStore(subscribe, () => snapshot, () => 'system|dark').split('|')
  return {
    theme,
    preference: pref,
    setPreference: setThemePreference,
    toggle: () => setThemePreference(theme === 'dark' ? 'light' : 'dark'),
  }
}
