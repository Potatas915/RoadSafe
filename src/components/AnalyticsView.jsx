import { useState } from 'react'
import { reportSummary } from '../models/report.js'
import { DATE_BASES, PERIOD_GROUPS, dateRangeError, timeframeRange, filterExportReports, groupReportPeriods, createSummaryCsv, createCsv, createPdf, downloadExport } from '../services/reportExport.js'

export default function AnalyticsView({ reports = [], users = [], source = 'Demo / session preview' }) {
  const [timeframe, setTimeframe] = useState('month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [dateField, setDateField] = useState('occurredAt')
  const [groupBy, setGroupBy] = useState('day')
  const [limit, setLimit] = useState(24)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const range = timeframe === 'custom' ? custom : timeframeRange(timeframe)
  const error = dateRangeError(range, timeframe === 'custom')
  const selected = error ? [] : filterExportReports(reports, range, dateField)
  const rows = error ? [] : groupReportPeriods(selected, range, groupBy, dateField)
  const summary = reportSummary(selected)
  const period = timeframe === 'all' ? 'All time' : `${range.start || 'Start'} to ${range.end || 'End'}`
  function changed() { setMessage(''); setLimit(24) }
  async function download(kind) {
    if (busy || error) return
    setBusy(true); setMessage('')
    try {
      const options = { period, source, range, groupBy, dateField }
      const blob = kind === 'pdf' ? await createPdf(selected, users, options)
        : new Blob([kind === 'summary' ? createSummaryCsv(selected, options) : createCsv(selected, users)], { type: 'text/csv;charset=utf-8' })
      const extension = kind === 'pdf' ? 'pdf' : 'csv'
      downloadExport(blob, `roadsafe-${dateField}-${timeframe === 'all' ? 'all-time' : `${range.start}_${range.end}`}-${kind === 'summary' ? `${groupBy}-summary` : 'reports'}.${extension}`)
      setMessage(`${kind === 'summary' ? 'Summary CSV' : extension.toUpperCase()} download started for ${selected.length} reports.`)
    } catch { setMessage('Export failed. Please try again.') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full bg-darkBg border border-darkBorder rounded-xl px-3 py-2 text-slate-200'
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-darkCard border border-darkBorder p-6 rounded-2xl shadow-xl max-w-5xl space-y-4">
        <h3 className="font-bold text-base text-white">Generate &amp; Download Reports</h3>
        <p className="text-xs text-slate-400">Summarize loaded {source.toLowerCase()}. Dates use Asia/Manila and include both endpoints. Map-only fictional samples are excluded.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <label className="block text-slate-300">Date basis
            <select aria-label="Analytics date basis" className={inputClass} value={dateField} disabled={busy} onChange={(event) => { setDateField(event.target.value); changed() }}>
              {Object.entries(DATE_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label htmlFor="timeframe" className="block text-slate-300">Select Timeframe
            <select id="timeframe" className={inputClass} value={timeframe} disabled={busy} onChange={(event) => { setTimeframe(event.target.value); changed() }}>
              <option value="day">Today</option><option value="week">This week (Monday–Sunday)</option>
              <option value="month">Current month</option><option value="annual">Current year</option>
              <option value="quarter">Previous quarter</option><option value="year">Year to date</option>
              <option value="all">All time</option><option value="custom">Custom date range</option>
            </select>
          </label>
          <label className="block text-slate-300">Group summary by
            <select aria-label="Summary grouping" className={inputClass} value={groupBy} disabled={busy} onChange={(event) => { setGroupBy(event.target.value); changed() }}>
              {Object.entries(PERIOD_GROUPS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {timeframe === 'custom' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {['start', 'end'].map((key) => <label key={key} className="block text-slate-300">{key === 'start' ? 'Start date' : 'End date'}
            <input type="date" className={inputClass} value={custom[key]} disabled={busy} aria-invalid={Boolean(error)} onChange={(event) => { setCustom({ ...custom, [key]: event.target.value }); changed() }} />
          </label>)}
        </div>}
        <p role={error ? 'alert' : undefined} className={`text-xs ${error ? 'text-orange-300' : 'text-slate-300'}`}>{error || `${DATE_BASES[dateField]} · ${period} · ${selected.length} matching reports`}</p>
        {!error && <>
          <div className="flex flex-wrap gap-4 text-sm text-slate-200">
            <span>Total: {summary.total}</span><span>Pending review: {summary.pending}</span><span>Verified: {summary.verified}</span><span>Closed: {summary.closed}</span>
          </div>
          <p className="text-xs text-slate-400">Weeks run Monday–Sunday. Boundary periods show only selected dates. Empty periods show zero. Verified includes closed reports; these columns overlap. All-time summaries span the first to last matching date.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-300">
              <caption className="text-left py-2 font-semibold text-white">{PERIOD_GROUPS[groupBy]} summary · {DATE_BASES[dateField].toLowerCase()}</caption>
              <thead><tr>{['Period (Manila)', 'Total reports', 'Pending review', 'Verified', 'Closed'].map((label) => <th key={label} className="p-3 border-b border-darkBorder">{label}</th>)}</tr></thead>
              <tbody>{rows.slice(0, limit).map((row) => <tr key={row.start}>
                <td className="p-3 whitespace-nowrap">{row.start === row.end ? row.start : `${row.start} to ${row.end}`}</td>
                {[row.total, row.pending, row.verified, row.closed].map((value, index) => <td key={index} className="p-3">{value}</td>)}
              </tr>)}{!rows.length && <tr><td colSpan={5} className="p-3">No periods to summarize.</td></tr>}</tbody>
              <tfoot><tr className="border-t border-darkBorder font-semibold"><th className="p-3">Selected-range total</th>{[summary.total, summary.pending, summary.verified, summary.closed].map((value, index) => <td key={index} className="p-3">{value}</td>)}</tr></tfoot>
            </table>
          </div>
          {rows.length > limit && <button className="text-xs text-orange-300" onClick={() => setLimit(limit + 24)}>Show more periods ({Math.min(limit, rows.length)} of {rows.length})</button>}
          <p className="text-xs text-slate-400">PDF includes the summary and report details. CSV lists reports; summary CSV lists periods. Exports include all matching rows, including periods not yet shown above.</p>
          {!selected.length && <p className="text-xs text-slate-400">No matching reports. The summary shows zero for bounded periods; record CSV includes column headers.</p>}
        </>}
        <div className="pt-2 flex flex-wrap gap-3">
          <button disabled={busy || Boolean(error)} onClick={() => download('pdf')} className="py-2.5 px-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs">Download PDF</button>
          <button disabled={busy || Boolean(error)} onClick={() => download('csv')} className="py-2.5 px-4 bg-slate-800 disabled:opacity-50 text-white rounded-xl font-semibold border border-darkBorder text-xs">Export CSV</button>
          <button disabled={busy || Boolean(error)} onClick={() => download('summary')} className="py-2.5 px-4 bg-slate-800 disabled:opacity-50 text-white rounded-xl font-semibold border border-darkBorder text-xs">Export summary CSV</button>
        </div>
        <p role="status" className="text-xs text-slate-300">{busy ? 'Preparing download…' : message}</p>
      </div>
    </main>
  )
}
