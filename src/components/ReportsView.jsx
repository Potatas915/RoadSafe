import { REPORT_QUEUES, sortReportQueue, lastReportUpdate } from '../models/reportQueue.js'
import { useCategories, useCategoryLabel } from './CategoryContext.js'
import { useState } from 'react'
import { REPORT_STATUSES, formatDateTime, officerName, validCoordinates } from '../models/report.js'
import { DATE_BASES, dateRangeError, filterReportsByDate } from '../services/reportExport.js'

// One color per status, in the same order as the Dashboard's status breakdown.
const STATUS_COLORS = ['#f5c451', '#fb923c', '#c4b5fd', '#34d399', '#60a5fa', '#22d3ee', '#4ade80', '#f87171']
const statusColor = (status) => STATUS_COLORS[REPORT_STATUSES.indexOf(status)] ?? '#94a3b8'
const age = (iso) => { const hours = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3600000)); return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago` }

export default function ReportsView({ reports, users, onOpenReport, selectedReportId, detailPanel }) {
  const ACCIDENT_CATEGORIES = useCategories()
  const categoryLabel = useCategoryLabel()

  const [queue, setQueue] = useState('all')
  const [sort, setSort] = useState('oldest')
  const [copyMessage, setCopyMessage] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [dateField, setDateField] = useState('occurredAt')
  const [range, setRange] = useState({ start: '', end: '' })
  const error = dateRangeError(range)
  const filtered = filterReportsByDate(reports, range, dateField).filter((r) => (!status || r.status === status) && (!category || r.categoryId === category) && (!duplicatesOnly || r.isDuplicate)
    && `${r.id} ${r.location.address ?? 'Confirmed map location'}`.toLowerCase().includes(query.toLowerCase()))
  const visible = sortReportQueue(filtered.filter(REPORT_QUEUES.find(([id]) => id === queue)[2]), sort)
  function clearFilters() {
    setQuery(''); setStatus(''); setCategory(''); setDuplicatesOnly(false)
    setRange({ start: '', end: '' }); setDateField('occurredAt'); setQueue('all')
  }
  const unassigned = visible.filter(r => r.status === 'Verified' && !r.assignedOfficerId).length
  const control = 'reports-control'
  return (
    <main className="dx-page reports-page flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
      <div className="pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-strong">Report Management</h1>
        <p className="mt-1.5 text-sm text-slate-400">{visible.length} {visible.length === 1 ? 'report matches' : 'reports match'} your filters.{unassigned > 0 && <span className="text-orange-600 dark:text-orange-300"> {unassigned} still {unassigned === 1 ? 'needs' : 'need'} an officer.</span>}</p>
      </div>
      <div className={detailPanel ? "reports-workspace reports-workspace-open" : "reports-workspace"}>
      <div className="dx-card min-w-0 overflow-hidden">
        <div className="reports-toolbar">
          <div role="group" aria-label="Report work queues" className="reports-queues">{REPORT_QUEUES.map(([id, label, matches]) => <button key={id} type="button" aria-pressed={queue === id} onClick={() => setQueue(id)} className="reports-queue">{label}<span>{filtered.filter(matches).length}</span></button>)}</div>
        </div>
        <div className="reports-filters">
          <div className="reports-filter-row">
            <label className="reports-field reports-search"><span className="sr-only">Search reports</span>
              <span className="relative block"><i aria-hidden="true" className="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-[12px] text-slate-500" /><input className={control + ' reports-search-input'} aria-label="Search reports" placeholder="Search by report ID or location" value={query} onChange={e => setQuery(e.target.value)} /></span>
            </label>
            <label className="reports-field"><span className="sr-only">Status</span><select aria-label="Filter by status" className={control} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{REPORT_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="reports-field"><span className="sr-only">Accident type</span><select aria-label="Filter by accident category" className={control} value={category} onChange={e => setCategory(e.target.value)}><option value="">All accident types</option>{ACCIDENT_CATEGORIES.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
            <label className="reports-field"><span className="sr-only">Sort reports</span>
            <select aria-label="Sort reports" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="oldest">Oldest submitted first</option><option value="newest">Newest submitted first</option><option value="severity">Highest severity first</option><option value="updated">Recently updated first</option></select>
          </label>
          </div>
          <details className="reports-advanced"><summary>More filters{(range.start || range.end || duplicatesOnly) && <span className="text-orange-600 dark:text-orange-300"> · Active</span>}</summary><div className="reports-date-row">
            <label className="reports-field">Date basis<select aria-label="Report date basis" className={control} value={dateField} onChange={e => setDateField(e.target.value)}>{Object.entries(DATE_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {['start', 'end'].map(key => <label key={key} className="reports-field">{key === 'start' ? 'Start date' : 'End date'}<input type="date" aria-label={`Report ${key} date`} aria-invalid={Boolean(error)} className={control} value={range[key]} onChange={e => setRange({ ...range, [key]: e.target.value })} /></label>)}
            <button type="button" className="reports-secondary" onClick={() => setRange({ start: '', end: '' })}>Clear dates</button>
            <label className="reports-duplicate"><input type="checkbox" checked={duplicatesOnly} onChange={e => setDuplicatesOnly(e.target.checked)} /><span>Duplicates only</span></label>
            <button type="button" className="reports-clear" onClick={clearFilters}>Clear all filters</button>
          </div>
          <div className="reports-help"><i aria-hidden="true" className="fa-regular fa-circle-question" /><p>Dates use Asia/Manila time and include both ends. Leave either date blank for no limit.</p></div>
          </details>
        </div>
        {copyMessage && <p role="status" className="px-5 py-2 text-xs text-amber-600 dark:text-amber-300">{copyMessage}</p>}
        {error && <p role="alert" className="px-5 py-2 text-xs text-orange-600 dark:text-orange-300">{error}</p>}
        <div className="overflow-x-auto reports-table-scroll">
          <table className="reports-table w-full text-left text-xs">
            <thead><tr>{['Report ID', 'Reporter info', 'Incident time', 'Location', 'Accident type', 'Status', 'Assigned officer', 'Last activity / age', 'Details'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {visible.map((r) => {
                const address = r.location.address?.trim()
                const officer = officerName(users, r.assignedOfficerId)
                return <tr key={r.id} aria-selected={selectedReportId === r.id}>
                  <td className="whitespace-nowrap"><span className="inline-flex items-center gap-1"><span className="shrink-0 whitespace-nowrap font-mono text-[12px] font-semibold text-strong select-text" title={r.id}>#{r.id.length > 16 ? r.id.slice(0, 8) : r.id}</span><button type="button" aria-label={'Copy report ID ' + r.id} className="reports-copy shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(r.id); setCopyMessage('Report ID copied.') } catch { setCopyMessage('Could not copy. Full report ID: ' + r.id) } }}><i aria-hidden="true" className="fa-regular fa-copy" /></button></span></td>
                  <td className="reports-reporter">
                    <span className="block font-medium text-strong whitespace-pre-wrap"><span className="sr-only">Full name: </span>{r.reporter.name ?? 'Name not provided'}</span>
                    <span className="block text-[11px] text-slate-400 whitespace-pre-wrap"><span className="sr-only">Contact number: </span>{r.reporter.contact ?? 'Contact not provided'}</span>
                  </td>
                  <td className="reports-when">{formatDateTime(r.occurredAt)}</td>
                  <td className="reports-location">{address || (validCoordinates(r.location.coordinates) ? <span className="font-mono text-[11px]" title="Location pinned by reporter"><span className="block">Lat: {r.location.coordinates.latitude.toFixed(5)}</span><span className="block">Lng: {r.location.coordinates.longitude.toFixed(5)}</span></span> : 'Location unavailable')}</td>
                  <td className="whitespace-nowrap font-medium text-strong">{categoryLabel(r.categoryId)}</td>
                  <td>
                    <span className="reports-status"><i aria-hidden="true" style={{ backgroundColor: statusColor(r.status) }} />{r.status}</span>
                    {r.isDuplicate && <span className="mt-1.5 block text-[11px] text-amber-700 dark:text-amber-300"><i aria-hidden="true" className="fa-regular fa-clone mr-1" />Duplicate report</span>}
                  </td>
                  <td className={officer === 'Unassigned' ? 'text-slate-500' : 'font-medium text-strong'}>{officer}</td>
                  <td className="reports-when"><span className="block text-slate-200">{formatDateTime(new Date(lastReportUpdate(r)).toISOString())}</span><span className="block text-[11px] text-slate-400">Submitted {age(r.submittedAt)}</span></td>
                  <td><button aria-label={'View report ' + r.id} onClick={() => onOpenReport(r.id)} className="reports-open">Review<i aria-hidden="true" className="fa-solid fa-chevron-right text-[9px]" /></button></td>
                </tr>
              })}
              {!visible.length && <tr><td colSpan={9} className="reports-empty">No reports match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="reports-footer"><span>Showing {visible.length} of {reports.length} reports</span><span>Queue counts follow your filters</span></footer>
      </div>
      {detailPanel || <p className="mt-3 px-1 text-xs text-slate-400">Select Review to open a report workspace.</p>}
      </div>
    </main>
  )
}
