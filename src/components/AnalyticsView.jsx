import { useState } from 'react'
import { timeframeRange, filterExportReports, createCsv, createPdf, downloadExport } from '../services/reportExport.js'

export default function AnalyticsView({ reports = [], users = [], source = 'Demo / session preview' }) {
  const [timeframe, setTimeframe] = useState('month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const range = timeframe === 'custom' ? custom : timeframeRange(timeframe)
  const invalid = timeframe === 'custom' && (!range.start || !range.end || range.start > range.end)
  const selected = invalid ? [] : filterExportReports(reports, range)
  const period = timeframe === 'all' ? 'All time' : `${range.start || 'Start'} to ${range.end || 'End'}`
  async function download(format) {
    if (busy || invalid) return
    setBusy(true); setMessage('')
    try {
      const blob = format === 'pdf' ? await createPdf(selected, users, { period, source }) : new Blob([createCsv(selected, users)], { type: 'text/csv;charset=utf-8' })
      downloadExport(blob, `roadsafe-${timeframe === 'all' ? 'all-time' : `${range.start}_${range.end}`}.${format}`)
      setMessage(`${format.toUpperCase()} download started for ${selected.length} reports.`)
    } catch { setMessage('Export failed. Please try again.') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full bg-darkBg border border-darkBorder rounded-xl px-3 py-2 text-slate-200'
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-darkCard border border-darkBorder p-6 rounded-2xl shadow-xl max-w-xl space-y-4">
        <h3 className="font-bold text-base text-white">Generate &amp; Download Reports</h3>
        <p className="text-xs text-slate-400">Export loaded {source.toLowerCase()}. Filter by incident date in Asia/Manila, including both start and end dates. Map-only fictional samples are excluded.</p>
        <div className="space-y-3 text-xs">
          <label htmlFor="timeframe" className="block text-slate-300 font-medium">Select Timeframe</label>
          <select id="timeframe" className={inputClass} value={timeframe} disabled={busy} onChange={(event) => { setTimeframe(event.target.value); setMessage('') }}>
            <option value="month">Current month</option>
            <option value="quarter">Previous quarter</option>
            <option value="year">Year to date</option>
            <option value="all">All time</option>
            <option value="custom">Custom date range</option>
          </select>
          {timeframe === 'custom' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['start', 'end'].map((key) => <label key={key} className="block text-slate-300">{key === 'start' ? 'Start date' : 'End date'}
              <input type="date" className={inputClass} value={custom[key]} disabled={busy} onChange={(event) => { setCustom({ ...custom, [key]: event.target.value }); setMessage('') }} />
            </label>)}
          </div>}
          <p className={invalid ? 'text-orange-300' : 'text-slate-300'}>{invalid ? 'Choose both dates, with the end on or after the start.' : `${period} · ${selected.length} matching reports`}</p>
          {!invalid && !selected.length && <p className="text-slate-400">No matching reports. PDF includes an empty summary; CSV includes column headers.</p>}
        </div>
        <div className="pt-2 flex gap-3">
          <button disabled={busy || invalid} onClick={() => download('pdf')} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow transition text-xs">
            <i className="fa-solid fa-file-pdf mr-2" aria-hidden="true"></i> Download PDF
          </button>
          <button disabled={busy || invalid} onClick={() => download('csv')} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-semibold border border-darkBorder transition text-xs">
            <i className="fa-solid fa-file-csv mr-2" aria-hidden="true"></i> Export CSV
          </button>
        </div>
        <p role="status" className="text-xs text-slate-300">{busy ? 'Preparing download…' : message}</p>
      </div>
    </main>
  )
}
