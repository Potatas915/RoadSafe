import { useState } from 'react'
import { ACCIDENT_CATEGORIES, REPORT_STATUSES, categoryLabel, formatDateTime, isOfficiallyVerified, officerName } from '../models/report.js'
import { DATE_BASES, dateRangeError, filterReportsByDate } from '../services/reportExport.js'

export default function ReportsView({ reports, users, onOpenReport }) {
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [dateField, setDateField] = useState('occurredAt')
  const [range, setRange] = useState({ start: '', end: '' })
  const error = dateRangeError(range)
  const visible = filterReportsByDate(reports, range, dateField).filter((r) => (!status || r.status === status) && (!category || r.categoryId === category)
    && `${r.id} ${r.location.address ?? 'Confirmed map location'}`.toLowerCase().includes(query.toLowerCase()))
  const control = 'bg-darkBg border border-darkBorder text-xs rounded-xl px-3 py-2 text-slate-300'
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-darkCard border border-darkBorder rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-darkBorder space-y-3">
          <h3 className="font-bold text-base text-white">Accident Reports Management</h3>
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
            <span className="text-xs text-slate-400 py-2">{visible.length} reports</span>
          </div>
          <p className="text-xs text-slate-400">Dates use Asia/Manila and include both endpoints. Leave either date blank for an open boundary.</p>
          {error && <p role="alert" className="text-xs text-orange-300">{error}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-darkBorder"><tr>{['Report ID', 'Reporter info', 'Incident time', 'Location', 'Accident type', 'Status / verification', 'Assigned officer', 'Details'].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-darkBorder text-slate-300">
              {visible.map((r) => <tr key={r.id} className="hover:bg-slate-800/40">
                <td className="p-4 font-mono text-white">{r.id}</td>
                <td className="p-4 min-w-48 max-w-xs break-words">
                  <span className="block text-white whitespace-pre-wrap"><span className="sr-only">Full name: </span>{r.reporter.name ?? 'Name not provided'}</span>
                  <span className="block mt-1 text-slate-400 whitespace-pre-wrap"><span className="sr-only">Contact number: </span>{r.reporter.contact ?? 'Contact not provided'}</span>
                </td>
                <td className="p-4">{formatDateTime(r.occurredAt)}</td><td className="p-4">{r.location.address ?? 'Confirmed map location'}</td>
                <td className="p-4">{categoryLabel(r.categoryId)}</td>
                <td className="p-4">{r.status}<span className={`block mt-1 ${isOfficiallyVerified(r) ? 'text-emerald-400' : 'text-amber-300'}`}>{isOfficiallyVerified(r) ? 'Officially verified' : 'Public submission — unverified'}</span></td>
                <td className="p-4">{officerName(users, r.assignedOfficerId)}</td>
                <td className="p-4"><button onClick={() => onOpenReport(r.id)} className="px-3 py-2 bg-slate-800 rounded-lg">View {r.id}</button></td>
              </tr>)}
              {!visible.length && <tr><td colSpan={8} className="p-6 text-slate-400">No reports match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

