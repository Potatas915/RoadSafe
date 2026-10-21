import { REPORT_QUEUES, sortReportQueue, lastReportUpdate } from '../models/reportQueue.js'
import { useCategories, useCategoryLabel } from './CategoryContext.js'
import { useState } from 'react'
import { REPORT_STATUSES, formatDateTime, isOfficiallyVerified, officerName, validCoordinates } from '../models/report.js'
import { DATE_BASES, dateRangeError, filterReportsByDate } from '../services/reportExport.js'

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
    <main className="reports-page flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto">
      <div className={detailPanel ? "reports-workspace reports-workspace-open" : "reports-workspace"}>
      <div className="min-w-0 bg-darkCard border border-darkBorder rounded-2xl shadow-xl overflow-hidden">
        <header className="reports-header">
          <div><h3 className="text-base font-semibold text-white">Accident Reports Management</h3>
            <p className="mt-1 text-xs text-slate-400">{visible.length} reports match your filters.{unassigned > 0 && <span className="text-orange-300"> {unassigned} still need an officer.</span>}</p>
          </div>
          <label className="reports-field reports-sort">Sort reports
            <select aria-label="Sort reports" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="oldest">Oldest submitted first</option><option value="newest">Newest submitted first</option><option value="severity">Highest severity first</option><option value="updated">Recently updated first</option></select>
          </label>
        </header>
        <div role="group" aria-label="Report work queues" className="reports-queues">{REPORT_QUEUES.map(([id, label, matches]) => <button key={id} type="button" aria-pressed={queue === id} onClick={() => setQueue(id)} className="reports-queue">{label}<span>{filtered.filter(matches).length}</span></button>)}</div>
        <div className="reports-filters">
          <div className="reports-filter-row">
            <label className="reports-field reports-search">Search reports
              <span className="relative block"><i aria-hidden="true" className="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-500" /><input className={control + ' reports-search-input'} aria-label="Search reports" placeholder="Report ID or location" value={query} onChange={e => setQuery(e.target.value)} /></span>
            </label>
            <label className="reports-field">Status<select aria-label="Filter by status" className={control} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{REPORT_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="reports-field">Accident type<select aria-label="Filter by accident category" className={control} value={category} onChange={e => setCategory(e.target.value)}><option value="">All accident categories</option>{ACCIDENT_CATEGORIES.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
          </div>
          <details className="reports-advanced"><summary>Date &amp; duplicate filters{(range.start || range.end || duplicatesOnly) && <span className="text-orange-300"> · Active</span>}</summary><div className="reports-date-row">
            <label className="reports-field">Date basis<select aria-label="Report date basis" className={control} value={dateField} onChange={e => setDateField(e.target.value)}>{Object.entries(DATE_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {['start', 'end'].map(key => <label key={key} className="reports-field">{key === 'start' ? 'Start date' : 'End date'}<input type="date" aria-label={`Report ${key} date`} aria-invalid={Boolean(error)} className={control} value={range[key]} onChange={e => setRange({ ...range, [key]: e.target.value })} /></label>)}
            <button type="button" className="reports-secondary" onClick={() => setRange({ start: '', end: '' })}>Clear dates</button>
            <label className="reports-duplicate"><input type="checkbox" checked={duplicatesOnly} onChange={e => setDuplicatesOnly(e.target.checked)} /><span>Duplicates only</span></label>
            <button type="button" className="reports-clear" onClick={clearFilters}>Clear filters</button>
          </div>
        <div className="reports-help"><i aria-hidden="true" className="fa-regular fa-circle-question" /><p>Dates use Asia/Manila and include both endpoints. Leave either date blank for an open boundary.</p></div>
          </details>
        </div>
        {copyMessage && <p role="status" className="px-5 py-2 text-xs text-amber-300">{copyMessage}</p>}
        {error && <p role="alert" className="px-5 py-2 text-xs text-orange-300">{error}</p>}
        <div className="overflow-x-auto reports-table-scroll">
          <table className="reports-table w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-darkBorder"><tr>{['Report ID', 'Reporter info', 'Incident time', 'Location', 'Accident type', 'Status / verification', 'Assigned officer', 'Last activity / age', 'Details'].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-darkBorder text-slate-300">
              {visible.map((r) => <tr key={r.id} aria-selected={selectedReportId === r.id} className={selectedReportId === r.id ? "bg-orange-500/10" : "hover:bg-slate-800/40"}>
                <td className="p-4 font-mono text-white"><span title={r.id}>#{r.id.length > 16 ? r.id.slice(0, 8) : r.id}</span><button type="button" aria-label={'Copy report ID ' + r.id} className="reports-copy" onClick={async () => { try { await navigator.clipboard.writeText(r.id); setCopyMessage('Report ID copied.') } catch { setCopyMessage('Could not copy. Full report ID: ' + r.id) } }}><i aria-hidden="true" className="fa-regular fa-copy" /></button></td>
                <td className="p-4 min-w-40 max-w-xs break-words">
                  <span className="block text-white whitespace-pre-wrap"><span className="sr-only">Full name: </span>{r.reporter.name ?? 'Name not provided'}</span>
                  <span className="block mt-1 text-slate-400 whitespace-pre-wrap"><span className="sr-only">Contact number: </span>{r.reporter.contact ?? 'Contact not provided'}</span>
                </td>
                <td className="p-4">{formatDateTime(r.occurredAt)}</td><td className="p-4"><span className="block text-slate-200">{r.location.address?.trim() || (validCoordinates(r.location.coordinates) ? <span className="whitespace-nowrap font-mono text-[11px]"><span className="block">Lat: {r.location.coordinates.latitude.toFixed(5)}</span><span className="block">Lng: {r.location.coordinates.longitude.toFixed(5)}</span></span> : 'Location unavailable')}</span>{!r.location.address?.trim() && validCoordinates(r.location.coordinates) && <span className="block mt-1 text-[10px] text-slate-500">Location pinned by reporter</span>}</td>
                <td className="p-4">{categoryLabel(r.categoryId)}</td>
                <td className="p-4"><span className="reports-status">{r.status}</span>{r.isDuplicate && <span className="block text-amber-300">Duplicate report</span>}<span className={`block mt-2 text-[10px] ${isOfficiallyVerified(r) ? 'text-emerald-400' : 'text-amber-300'}`}>{isOfficiallyVerified(r) ? 'Officially verified' : 'Public submission — unverified'}</span></td>
                <td className="p-4">{officerName(users, r.assignedOfficerId)}</td>
                <td className="p-4"><span className="block">{formatDateTime(new Date(lastReportUpdate(r)).toISOString())}</span><span className="block text-slate-400 mt-1">{Math.max(0, Math.floor((Date.now() - Date.parse(r.submittedAt)) / 3600000))}h since submission</span></td><td className="p-4"><button aria-label={'View report ' + r.id} onClick={() => onOpenReport(r.id)} className="reports-open">Review <i aria-hidden="true" className="fa-solid fa-chevron-right text-[9px]" /></button></td>
              </tr>)}
              {!visible.length && <tr><td colSpan={9} className="p-6 text-slate-400">No reports match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="reports-footer"><span>Showing {visible.length} of {reports.length} reports</span><span>Use the copy icon for the full report ID</span></footer>
      </div>
      {detailPanel || <p className="text-xs text-slate-400 mt-3">Select Review to open a report workspace. Queue counts follow the current filters.</p>}
      </div>
    </main>
  )
}

