import { useEffect, useState } from 'react'
import { loadPoliceStations } from '../services/policeStations.js'
import { syncPoliceDirectory, loadStationEnforcers, availableEnforcer, assignStationEnforcer } from '../backend/enforcers.js'

export default function StationEnforcers({ client, station, report, onAssigned }) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true, running = false, directoryReady = false
    const controller = new AbortController()
    async function load(publish = false) {
      if (running) return
      running = true
      try {
        if (publish || !directoryReady) {
          const stations = await loadPoliceStations({ nationwide: true, signal: controller.signal })
          if (!active) return
          await syncPoliceDirectory(client, stations)
          directoryReady = true
        }
        const next = await loadStationEnforcers(client, station.id)
        if (active) { setRows(next); setError(''); setLoading(false) }
      } catch (failure) {
        if (active) { setRows([]); setError(failure.message); setLoading(false) }
      } finally { running = false }
    }
    void load(true)
    const timer = setInterval(() => void load(), 15000)
    return () => { active = false; controller.abort(); clearInterval(timer) }
  }, [client, station.id, retry])
  async function assign() {
    setBusy(true); setError(''); setMessage('')
    try {
      await assignStationEnforcer(client, report, station.id, selected)
      setSelected('')
      setMessage('Enforcer assigned. The case is available in their mobile workspace.')
      setRows(previous => previous.map(row => row.id === selected ? { ...row, busy: true } : row))
      try { await onAssigned?.() } catch { setMessage('Assignment saved. Shared reports could not refresh; refresh the map before another assignment.') }
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  const eligible = report?.status === 'Verified' && !report.assignedOfficerId && !report.isDuplicate
  return <section aria-label="Station enforcers" className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 space-y-3">
    <div className="flex justify-between gap-2"><h4 className="font-bold text-blue-300">Traffic enforcers</h4><button type="button" disabled={busy} onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Refresh</button></div>
    <p className="text-slate-400">Self-selected station · online means active in the app within 90 seconds. Not GPS presence.</p>
    {loading && <p role="status">Loading station directory and enforcers…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="text-green-300">{message}</p>}
    {!loading && !error && !rows.length && <p>No enforcers have selected this station.</p>}
    <ul className="space-y-2">{rows.map(row => <li key={row.id} className="flex justify-between gap-2"><span>{row.name} <span className="text-slate-400">· {row.unit}</span></span><span>{!row.online ? 'Offline' : !row.onDuty ? 'Off duty' : row.busy ? 'Responding' : 'Available'}</span></li>)}</ul>
    <label className="block">Assign enforcer<select aria-label="Assign station enforcer" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy || loading || Boolean(error)} className="block w-full mt-1 bg-darkBg border border-darkBorder rounded-lg p-2"><option value="">Choose an available enforcer</option>{rows.filter(availableEnforcer).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {!eligible && <p className="text-amber-300">Select an unassigned, verified report from Existing reports to assign personnel.</p>}
    <button type="button" disabled={busy || loading || Boolean(error) || !eligible || !rows.some(row => row.id === selected && availableEnforcer(row))} onClick={assign} className="w-full bg-blue-600 rounded-xl p-2 disabled:opacity-50">{busy ? 'Assigning…' : 'Assign to selected accident'}</button>
  </section>
}
