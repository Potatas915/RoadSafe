import { useEffect, useRef, useState } from 'react'
import { searchLocations } from '../services/locationSearch.js'

export default function LocationSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef(null)
  const lastRequest = useRef(0)
  useEffect(() => () => controller.current?.abort(), [])
  function clear() {
    controller.current?.abort()
    controller.current = null
    setBusy(false)
    setResults([])
    setMessage('')
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || Date.now() - lastRequest.current < 1000) return
    clear()
    if (query.trim().length < 3) { setMessage('Enter at least 3 characters.'); return }
    const current = new AbortController()
    controller.current = current
    lastRequest.current = Date.now()
    setBusy(true)
    setMessage('Searching locations…')
    const timeout = setTimeout(() => current.abort(), 12000)
    try {
      const next = await searchLocations(query, current.signal)
      if (controller.current !== current) return
      setResults(next)
      setMessage(next.length ? 'Choose a location' : 'No locations found. Try a city or a fuller address.')
    } catch (error) {
      if (controller.current === current) setMessage(error.name === 'AbortError' ? 'Search timed out. Please retry.' : error.message)
    } finally {
      clearTimeout(timeout)
      if (controller.current === current) setBusy(false)
    }
  }
  return <div className="roadsafe-location-search" onKeyDown={(event) => { if (event.key === 'Escape') clear() }}>
    <form onSubmit={submit} className="flex items-center bg-edge/[0.05] border border-edge/10 rounded-full pl-1">
      <input aria-label="Search map locations" placeholder="Search city, place or address…" value={query}
        onChange={(event) => { clear(); setQuery(event.target.value) }}
        className="w-full min-w-0 bg-transparent px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none" />
      <button type="submit" disabled={busy} aria-label="Search locations" className="px-3 py-2 text-slate-400 hover:text-strong disabled:opacity-50"><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'}`} /></button>
    </form>
    {message && <div className="roadsafe-search-results">
      <div className="flex justify-between gap-3"><p role="status">{message}</p><button type="button" aria-label="Close search results" onClick={clear}>×</button></div>
      {results.map((result, index) => <button type="button" key={index} className="roadsafe-search-result" onClick={() => { onSelect(result); setQuery(result.label); clear() }}>{result.label}</button>)}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-slate-500 text-[10px]">Search © OpenStreetMap · Photon</a>
    </div>}
  </div>
}
