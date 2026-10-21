import { REPORT_QUEUES, sortReportQueue, lastReportUpdate } from '../models/reportQueue.js'
import { useCategories, useCategoryLabel } from './CategoryContext.js'
import { useState } from 'react'
import { REPORT_STATUSES, formatDateTime, isOfficiallyVerified, officerName } from '../models/report.js'
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
  const control = 'bg-darkBg border border-darkBorder text-xs rounded-xl px-3 py-2 text-slate-300'
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className={detailPanel ? "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.85fr)] gap-4 items-start" : ""}>
      <div className="min-w-0 bg-darkCard border border-darkBorder rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-darkBorder space-y-3">
          <h3 className="font-bold text-base text-white">Accident Reports Management</h3><p className="text-xs text-slate-400">Review submissions and maintain report records.</p><div role="group" aria-label="Report work queues" className="flex flex-wrap gap-2">{REPORT_QUEUES.map(([id, label, matches]) => <button key={id} type="button" aria-pressed={queue === id} onClick={() => { setQueue(id) }} className={queue === id ? 'rounded-lg px-3 py-2 text-xs bg-orange-600 text-white' : 'rounded-lg px-3 py-2 text-xs bg-slate-800 text-slate-300'}>{label} ({filtered.filter(matches).length})</button>)}</div>
          <div className="flex flex-wrap gap-3">
            <input className={control} aria-label="Search reports" placeholder="Report ID or location" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Filter by status" className={control} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>{REPORT_STATUSES.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select aria-label="Filter by accident category" className={control} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All accident categories</option>{ACCIDENT_CATEGORIES.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
            </select>
            <label className="text-xs text-slate-400">Date basis
              <select aria-label="Report date basis" className={`${control} block mt-1`} value={dateField} onChange={(e) => setDateField(e.target.value)}>
                {Object.entries(DATE_BASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {['start', 'end'].map((key) => <label key={key} className="text-xs text-slate-400">{key === 'start' ? 'Start date' : 'End date'}
              <input type="date" aria-label={`Report ${key} date`} aria-invalid={Boolean(error)} className={`${control} block mt-1`} value={range[key]} onChange={(e) => setRange({ ...range, [key]: e.target.value })} />
            </label>)}
            <button type="button" className={control} onClick={() => setRange({ start: '', end: '' })}>Clear dates</button>
            <label className="text-xs text-slate-300 py-2"><input type="checkbox" checked={duplicatesOnly} onChange={event => setDuplicatesOnly(event.target.checked)} /> Only duplicate reports</label>
            <select aria-label="Sort reports" className={control} value={sort} onChange={e => setSort(e.target.value)}><option value="oldest">Oldest submitted first</option><option value="newest">Newest submitted first</option><option value="severity">Highest severity first</option><option value="updated">Recently updated first</option></select><span className="text-xs text-slate-400 py-2">{visible.length} reports</span>
          </div>
          <p className="text-xs text-slate-400">Dates use Asia/Manila and include both endpoints. Leave either date blank for an open boundary.</p>
          {copyMessage && <p role="status" className="text-xs text-amber-300">{copyMessage}</p>}
          {error && <p role="alert" className="text-xs text-orange-300">{error}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-darkBorder"><tr>{['Report ID', 'Reporter info', 'Incident time', 'Location', 'Accident type', 'Status / verification', 'Assigned officer', 'Last activity / age', 'Details'].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-darkBorder text-slate-300">
              {visible.map((r) => <tr key={r.id} aria-selected={selectedReportId === r.id} className={selectedReportId === r.id ? "bg-orange-500/10" : "hover:bg-slate-800/40"}>
                <td className="p-4 font-mono text-white"><span title={r.id}>{r.id.length > 16 ? r.id.slice(0, 8) + '…' : r.id}</span><button type="button" aria-label={'Copy report ID ' + r.id} className="block mt-1 text-orange-300" onClick={async () => { try { await navigator.clipboard.writeText(r.id); setCopyMessage('Report ID copied.') } catch { setCopyMessage('Could not copy. Full report ID: ' + r.id) } }}>Copy ID</button></td>
                <td className="p-4 min-w-48 max-w-xs break-words">
                  <span className="block text-white whitespace-pre-wrap"><span className="sr-only">Full name: </span>{r.reporter.name ?? 'Name not provided'}</span>
                  <span className="block mt-1 text-slate-400 whitespace-pre-wrap"><span className="sr-only">Contact number: </span>{r.reporter.contact ?? 'Contact not provided'}</span>
                </td>
                <td className="p-4">{formatDateTime(r.occurredAt)}</td><td className="p-4">{r.location.address ?? 'Confirmed map location'}</td>
                <td className="p-4">{categoryLabel(r.categoryId)}</td>
                <td className="p-4">{r.status}{r.isDuplicate && <span className="block text-amber-300">Duplicate report</span>}<span className={`block mt-1 ${isOfficiallyVerified(r) ? 'text-emerald-400' : 'text-amber-300'}`}>{isOfficiallyVerified(r) ? 'Officially verified' : 'Public submission — unverified'}</span></td>
                <td className="p-4">{officerName(users, r.assignedOfficerId)}</td>
                <td className="p-4"><span className="block">{formatDateTime(new Date(lastReportUpdate(r)).toISOString())}</span><span className="block text-slate-400 mt-1">{Math.max(0, Math.floor((Date.now() - Date.parse(r.submittedAt)) / 3600000))}h since submission</span></td><td className="p-4"><button aria-label={'View report ' + r.id} onClick={() => onOpenReport(r.id)} className="px-3 py-2 bg-slate-800 rounded-lg">Review</button></td>
              </tr>)}
              {!visible.length && <tr><td colSpan={9} className="p-6 text-slate-400">No reports match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {detailPanel || <p className="text-xs text-slate-400 mt-3">Select Review to open a report workspace. Queue counts follow the current filters.</p>}
      </div>
    </main>
  )
}

