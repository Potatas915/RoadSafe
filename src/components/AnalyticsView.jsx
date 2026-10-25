import { useCategories } from './CategoryContext.js'
import { useState } from 'react'
import './dashboard.css'
import { reportSummary } from '../models/report.js'
import { DATE_BASES, PERIOD_GROUPS, dateRangeError, timeframeRange, filterExportReports, groupReportPeriods, createSummaryCsv, createCsv, createPdf, downloadExport } from '../services/reportExport.js'

// The everyday choices stay on the page; the rarer ones live under "More options".
const MAIN_TIMEFRAMES = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['annual', 'This year'], ['all', 'All time'], ['custom', 'Custom']]
const OTHER_TIMEFRAMES = [['quarter', 'Previous quarter'], ['year', 'Year to date']]
const MAX_BARS = 60

// "Auto" picks a grouping that keeps the chart readable for the chosen range.
function autoGroup(timeframe, range) {
  if (timeframe === 'day' || timeframe === 'week' || timeframe === 'month') return 'day'
  if (timeframe === 'annual' || timeframe === 'year' || timeframe === 'quarter' || timeframe === 'all') return timeframe === 'quarter' ? 'week' : 'month'
  const days = range.start && range.end ? (new Date(`${range.end}T00:00:00Z`) - new Date(`${range.start}T00:00:00Z`)) / 864e5 + 1 : 0
  return days <= 62 ? 'day' : days <= 400 ? 'week' : days <= 1100 ? 'month' : 'year'
}

export default function AnalyticsView({ reports = [], users = [], source = 'Demo / session preview' }) {
  const categories = useCategories()
  const [timeframe, setTimeframe] = useState('month')
  const [custom, setCustom] = useState({ start: '', end: '' })
  const [dateField, setDateField] = useState('occurredAt')
  const [groupChoice, setGroupChoice] = useState('auto')
  const [limit, setLimit] = useState(24)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('chart')
  const range = timeframe === 'custom' ? custom : timeframeRange(timeframe)
  const error = dateRangeError(range, timeframe === 'custom')
  const groupBy = groupChoice === 'auto' ? autoGroup(timeframe, range) : groupChoice
  const selected = error ? [] : filterExportReports(reports, range, dateField)
  const rows = error ? [] : groupReportPeriods(selected, range, groupBy, dateField)
  const summary = reportSummary(selected)
  const period = timeframe === 'all' ? 'All time' : `${range.start || 'Start'} to ${range.end || 'End'}`
  function changed() { setMessage(''); setLimit(24) }
  async function download(kind) {
    if (busy || error) return
    setBusy(true); setMessage('')
    try {
      const options = { period, source, range, groupBy, dateField, categories }
      const blob = kind === 'pdf' ? await createPdf(selected, users, options)
        : new Blob([kind === 'summary' ? createSummaryCsv(selected, options) : createCsv(selected, users, categories)], { type: 'text/csv;charset=utf-8' })
      const extension = kind === 'pdf' ? 'pdf' : 'csv'
      downloadExport(blob, `roadsafe-${dateField}-${timeframe === 'all' ? 'all-time' : `${range.start}_${range.end}`}-${kind === 'summary' ? `${groupBy}-summary` : 'reports'}.${extension}`)
      setMessage(`${kind === 'summary' ? 'Summary CSV' : extension.toUpperCase()} download started for ${selected.length} reports.`)
    } catch { setMessage('Export failed. Please try again.') }
    finally { setBusy(false) }
  }
  // Long ranges show the most recent periods; exports always include everything.
  const barRows = rows.slice(-MAX_BARS)
  const peak = Math.max(0, ...barRows.map((row) => row.total))
  const peakIndex = peak > 0 ? barRows.findIndex((row) => row.total === peak) : -1
  const label = (row) => (row.start === row.end ? row.start : `${row.start} to ${row.end}`)
  const showLabels = barRows.length <= 14
  const shortLabel = (row) => groupBy === 'month' ? new Date(`${row.start}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) : groupBy === 'year' ? row.start.slice(0, 4) : groupBy === 'day' ? row.start.slice(8) : row.start.slice(5)
  const stats = [['Total reports', summary.total, '#f59e0b'], ['Pending review', summary.pending, '#fb923c'], ['Verified', summary.verified, '#10b981'], ['Closed', summary.closed, '#60a5fa']]
  const choice = (name, options, value, onPick) => (
    <div role="radiogroup" aria-label={name} className="dx-pills">
      {options.map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={value === id} disabled={busy} onClick={() => onPick(id)} className="dx-pill">{text}</button>)}
    </div>
  )
  const off = busy || Boolean(error)
  return (
    <main className="dx-page flex-1 p-4 md:p-6 overflow-y-auto space-y-6" style={{ backgroundAttachment: 'fixed' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight text-strong">Analytics &amp; Exports</h1>
          <p className="mt-1.5 text-sm text-slate-400">Pick a period, review the numbers, then download a report.</p></div>
        <span className="dx-chip"><i aria-hidden="true" className="fa-solid fa-database text-[10px] text-orange-500" />{source}</span>
      </div>

      <section aria-label="Report options" className="dx-card p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <span className="dx-field-label">Period</span>
            {choice('Timeframe', [...MAIN_TIMEFRAMES, ...(OTHER_TIMEFRAMES.some(([id]) => id === timeframe) ? OTHER_TIMEFRAMES.filter(([id]) => id === timeframe) : [])], timeframe, (id) => { setTimeframe(id); changed() })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={off} onClick={() => download('pdf')} className="dx-btn dx-btn-primary dx-btn-inline"><i className="fa-solid fa-file-pdf" aria-hidden="true" />Download PDF</button>
            <button disabled={off} onClick={() => download('csv')} className="dx-btn dx-btn-inline"><i className="fa-solid fa-file-csv" aria-hidden="true" />Export CSV</button>
          </div>
        </div>
        {timeframe === 'custom' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          {['start', 'end'].map((key) => <label key={key} className="dx-field-label !mb-0">{key === 'start' ? 'Start date' : 'End date'}
            <input type="date" className="dx-input mt-2" value={custom[key]} disabled={busy} aria-invalid={Boolean(error)} onChange={(event) => { setCustom({ ...custom, [key]: event.target.value }); changed() }} />
          </label>)}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
          <p role={error ? 'alert' : undefined} className={`flex items-center gap-2 ${error ? 'text-orange-600 dark:text-orange-300' : 'text-slate-300'}`}><i aria-hidden="true" className={`fa-solid ${error ? 'fa-triangle-exclamation' : 'fa-calendar-days'} text-[11px] text-orange-500`} />{error || `${period} · ${selected.length} ${selected.length === 1 ? 'report' : 'reports'}`}</p>
          <p role="status" className="min-h-4 text-slate-300">{busy ? 'Preparing download…' : message}</p>
        </div>
        <details className="group border-t border-edge/[.08] pt-3">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-xs font-medium text-slate-300 hover:text-strong [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-chevron-right text-[9px] transition group-open:rotate-90" aria-hidden="true" />More options</summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div><span className="dx-field-label">Count reports by</span>{choice('Analytics date basis', Object.entries(DATE_BASES), dateField, (id) => { setDateField(id); changed() })}</div>
            <div><span className="dx-field-label">Group by</span>{choice('Summary grouping', [['auto', 'Auto'], ...Object.entries(PERIOD_GROUPS)], groupChoice, (id) => { setGroupChoice(id); changed() })}</div>
            <div><span className="dx-field-label">Other periods</span>{choice('Other periods', OTHER_TIMEFRAMES, timeframe, (id) => { setTimeframe(id); changed() })}</div>
            <div><span className="dx-field-label">Summary file</span><button disabled={off} onClick={() => download('summary')} className="dx-btn dx-btn-inline"><i className="fa-solid fa-table-list" aria-hidden="true" />Export summary CSV</button></div>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">Dates use Asia/Manila time and include both ends of the range. Exports always include every matching report.</p>
        </details>
      </section>

      {!error && <>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map(([name, value, color]) => <div key={name} className="dx-card p-5">
            <p className="flex items-center gap-2 text-xs text-slate-400"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />{name}</p>
            <p className="dx-kpi-value mt-2">{value}</p>
          </div>)}
        </div>

        <section className="dx-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="dx-title">Reports over time</h2>
              <p className="dx-sub">{PERIOD_GROUPS[groupBy]} · {rows.length > MAX_BARS ? `latest ${MAX_BARS} of ${rows.length} periods` : `${rows.length} ${rows.length === 1 ? 'period' : 'periods'}`}</p>
            </div>
            <div role="radiogroup" aria-label="Show as" className="dx-pills">
              {[['chart', 'Chart'], ['table', 'Table']].map(([id, text]) => <button key={id} type="button" role="radio" aria-checked={tab === id} onClick={() => setTab(id)} className="dx-pill">{text}</button>)}
            </div>
          </div>
          {tab === 'chart' && (barRows.length > 0 && peak > 0
            ? <div className="dx-bars" style={{ justifyContent: 'center', marginBottom: showLabels ? 26 : 0 }} role="img" aria-label={`Bar chart of total reports per ${PERIOD_GROUPS[groupBy].toLowerCase()} period; the busiest period has ${peak} reports`}>
              {barRows.map((row, index) => <div key={row.start} className={`dx-bar ${index === peakIndex ? 'is-peak' : ''}`} style={{ maxWidth: barRows.length <= 14 ? 64 : undefined }} title={`${label(row)}: ${row.total} reports`}>
                <span style={{ height: `${Math.max(row.total / peak * 100, row.total ? 4 : 0)}%` }} />
                {showLabels && <small className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400">{shortLabel(row)}</small>}
                {index === peakIndex && <em className="dx-bar-tag not-italic" style={{ bottom: `${row.total / peak * 100}%` }}>{row.total}</em>}
              </div>)}
            </div>
            : <p className="py-12 text-center text-sm text-slate-400">No reports in this range yet.</p>)}
          {tab === 'table' && <div className="mt-4">
            <div className="dx-scroll">
              <table className="dx-table">
                <caption className="sr-only">{PERIOD_GROUPS[groupBy]} summary · {DATE_BASES[dateField].toLowerCase()}</caption>
                <thead><tr>{['Period', 'Total', 'Pending', 'Verified', 'Closed'].map((text) => <th key={text}>{text}</th>)}</tr></thead>
                <tbody>{rows.slice(0, limit).map((row) => <tr key={row.start}>
                  <td className="whitespace-nowrap">{label(row)}</td>
                  {[row.total, row.pending, row.verified, row.closed].map((value, index) => <td key={index} className={value === 0 ? 'is-zero' : ''}>{value}</td>)}
                </tr>)}{!rows.length && <tr><td colSpan={5}>No periods to show.</td></tr>}</tbody>
                <tfoot><tr><th>Total</th>{[summary.total, summary.pending, summary.verified, summary.closed].map((value, index) => <td key={index}>{value}</td>)}</tr></tfoot>
              </table>
            </div>
            {rows.length > limit && <div className="mt-4"><button className="dx-pill" onClick={() => setLimit(limit + 24)}>Show more ({Math.min(limit, rows.length)} of {rows.length})</button></div>}
            <p className="mt-4 text-[11px] text-slate-400">Weeks run Monday to Sunday. Verified includes closed reports.</p>
          </div>}
        </section>
      </>}
    </main>
  )
}
