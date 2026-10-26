import { useMemo, useState } from 'react'
import { ROLES, REPORT_STATUS, formatDateTime } from '../models/report.js'
import { caseSeverity } from '../models/caseSeverity.js'
import { useCategoryLabel } from './CategoryContext.js'

const closedStatuses = [REPORT_STATUS.CLOSED, REPORT_STATUS.REJECTED]
// Most urgent work first when a person's cases are grouped by status.
const STATUS_ORDER = [REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.ASSIGNED, REPORT_STATUS.VERIFIED, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.INFORMATION_REQUIRED, REPORT_STATUS.SUBMITTED]
const shortId = (id) => (id.length > 16 ? id.slice(0, 8) : id)
const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const officerSummary = (officer, count) => [count ? `${count} active case${count === 1 ? '' : 's'}` : 'No active cases', officer.unit?.trim() && officer.unit.trim().toLowerCase() !== 'unassigned' ? `Unit: ${officer.unit.trim()}` : null].filter(Boolean).join(' · ')
const bySeverityThenAge = (a, b) => (b.severity.score ?? -1) - (a.severity.score ?? -1) || new Date(a.report.submittedAt) - new Date(b.report.submittedAt)

const TYPE_STYLE = {
  police: { icon: 'fa-shield-halved', ring: 'from-blue-500 to-sky-400', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25', label: 'Police' },
}

function Avatar({ officer, size = 'h-10 w-10 text-xs' }) {
  const type = TYPE_STYLE[officer.responderType] ?? TYPE_STYLE.police
  return <div className={`grid ${size} shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${type.ring} font-bold text-white shadow-md shadow-black/10`}>{initials(officer.name)}</div>
}

function StatusChip({ busy }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${busy ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-amber-500' : 'bg-emerald-500'}`} />{busy ? 'Listed cases' : 'No listed cases'}
    </span>
  )
}

function RosterRow({ officer, count, selected, onSelect }) {
  const type = TYPE_STYLE[officer.responderType] ?? TYPE_STYLE.police
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-orange-400/50 bg-orange-500/10 shadow-sm' : 'border-transparent hover:bg-edge/[.06]'}`}>
        <Avatar officer={officer} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-strong">{officer.name}</span>
          <span className="flex items-center gap-1.5 truncate text-[11px] text-slate-400"><i className={`fa-solid ${type.icon} text-[9px]`} aria-hidden="true" />{officerSummary(officer, count)}</span>
        </span>
        {count > 0
          ? <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-amber-500/15 px-1.5 text-[11px] font-bold tabular-nums text-amber-700 dark:text-amber-300" title={`${count} active ${count === 1 ? 'case' : 'cases'}`}>{count}</span>
          : <span className="h-2 w-2 rounded-full bg-emerald-500" title="No cases in the selected report source" />}
      </button>
    </li>
  )
}

function CaseRow({ report, severity, label, onOpen, showStatus = false }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(report.id)} className="group flex w-full items-stretch gap-3 rounded-xl border border-edge/[.08] bg-edge/[.04] p-0 text-left transition hover:border-orange-400/40 hover:bg-orange-500/10">
        <span className="w-1 shrink-0 rounded-l-xl" style={{ backgroundColor: severity.color }} title={`${severity.label} severity`} />
        <span className="min-w-0 flex-1 py-2.5">
          <span className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-strong">{label(report.categoryId)}</span><span className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold" style={{ backgroundColor: `${severity.color}26`, color: severity.color }}>{severity.label}</span></span>
          <span className="block truncate text-[11px] text-slate-400">{report.location?.address || 'Pinned location'}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500"><span className="font-mono" title={report.id}>#{shortId(report.id)}</span><span aria-hidden="true">·</span><span>{formatDateTime(report.occurredAt)}</span>{showStatus && <><span aria-hidden="true">·</span><span>{report.status}</span></>}</span>
        </span>
        <i className="fa-solid fa-chevron-right self-center pr-3 text-[10px] text-slate-500 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    </li>
  )
}

function CasesPanel({ entry, label, onOpenReport }) {
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState(() => new Set())
  const { officer, cases } = entry
  const needle = query.trim().toLowerCase()
  const shown = cases.filter(({ report }) => !needle || `${report.id} ${report.location?.address ?? ''} ${label(report.categoryId)}`.toLowerCase().includes(needle))
  const groups = STATUS_ORDER.map((status) => ({ status, items: shown.filter(({ report }) => report.status === status).sort(bySeverityThenAge) })).filter((group) => group.items.length)
  const urgent = cases.filter(({ severity }) => (severity.score ?? 0) >= 60).length
  const toggle = (status) => setClosed((previous) => { const next = new Set(previous); next.has(status) ? next.delete(status) : next.add(status); return next })
  const type = TYPE_STYLE[officer.responderType] ?? TYPE_STYLE.police

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-edge/[.08] p-4">
        <Avatar officer={officer} size="h-12 w-12 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-strong">{officer.name}</h2>
          <p className="truncate text-xs text-slate-400">{officerSummary(officer, cases.length)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${type.chip}`}><i className={`fa-solid ${type.icon}`} aria-hidden="true" />{type.label}</span><StatusChip busy={cases.length > 0} /></div>
        </div>
        <dl className="flex gap-2">
          <div className="rounded-xl bg-edge/[.05] px-3 py-2 text-center"><dd className="text-xl font-semibold tabular-nums text-strong">{cases.length}</dd><dt className="text-[10px] text-slate-400">Active cases</dt></div>
          <div className="rounded-xl bg-edge/[.05] px-3 py-2 text-center"><dd className={`text-xl font-semibold tabular-nums ${urgent ? 'text-rose-600 dark:text-rose-300' : 'text-strong'}`}>{urgent}</dd><dt className="text-[10px] text-slate-400">High or critical</dt></div>
        </dl>
      </div>

      {cases.length > 0 && (
        <div className="px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">Filter this officer's cases</span>
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${cases.length} cases by place, type or ID`} className="h-9 w-full rounded-xl border border-edge/10 bg-edge/[.04] pl-8 pr-3 text-xs text-strong placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none" />
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {cases.length === 0 && <p className="rounded-xl border border-dashed border-edge/15 px-4 py-10 text-center text-xs text-slate-400"><i className="fa-regular fa-circle-check mb-2 block text-xl text-emerald-500" aria-hidden="true" />No cases in this report source. Check the station roster on the map for online and on-duty availability.</p>}
        {cases.length > 0 && !groups.length && <p className="py-8 text-center text-xs text-slate-400">No cases match “{query}”.</p>}
        {groups.map(({ status, items }) => (
          <section key={status}>
            <button type="button" onClick={() => toggle(status)} aria-expanded={!closed.has(status)} className="mb-2 flex w-full items-center gap-2 text-left">
              <i className={`fa-solid fa-chevron-down text-[9px] text-slate-500 transition-transform ${closed.has(status) ? '-rotate-90' : ''}`} aria-hidden="true" />
              <h3 className="text-[11px] font-semibold text-slate-300">{status}</h3>
              <span className="rounded-full bg-edge/10 px-1.5 text-[10px] font-semibold tabular-nums text-slate-400">{items.length}</span>
              <span className="h-px flex-1 bg-edge/10" />
            </button>
            {!closed.has(status) && <ul className="space-y-1.5">{items.map(({ report, severity }) => <CaseRow key={report.id} report={report} severity={severity} label={label} onOpen={onOpenReport} />)}</ul>}
          </section>
        ))}
      </div>
    </div>
  )
}

function QueuePanel({ queue, label, onOpenReport }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-edge/[.08] p-4">
        <h2 className="text-base font-semibold text-strong">Awaiting dispatch</h2>
        <p className="mt-1 text-xs text-slate-400">Verified cases that have no officer yet, most severe first. Open a case, then use Assign on map to choose a station and an available enforcer.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {queue.length
          ? <ul className="space-y-1.5">{queue.map(({ report, severity }) => <CaseRow key={report.id} report={report} severity={severity} label={label} onOpen={onOpenReport} />)}</ul>
          : <p className="rounded-xl border border-dashed border-edge/15 px-4 py-10 text-center text-xs text-slate-400"><i className="fa-regular fa-circle-check mb-2 block text-xl text-emerald-500" aria-hidden="true" />Every verified case has an officer.</p>}
      </div>
    </div>
  )
}

export default function OfficersView({ reports, users, onOpenReport }) {
  const label = useCategoryLabel()
  const [query, setQuery] = useState('')

  const [availability, setAvailability] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [panel, setPanel] = useState('cases')

  const officers = useMemo(() => users.filter((user) => user.role === ROLES.OFFICER && user.responderType === 'police' && user.enabled !== false).map((officer) => ({
    officer,
    cases: reports
      .filter((report) => report.assignedOfficerId === officer.id && !closedStatuses.includes(report.status))
      .map((report) => ({ report, severity: caseSeverity(report) })),
  })), [users, reports])

  const queue = useMemo(() => reports
    .filter((report) => report.status === REPORT_STATUS.VERIFIED && !report.assignedOfficerId && !report.isDuplicate)
    .map((report) => ({ report, severity: caseSeverity(report) }))
    .sort(bySeverityThenAge), [reports])

  const needle = query.trim().toLowerCase()
  const matchesUnit = ({ officer }) => (!needle || `${officer.name} ${officer.unit}`.toLowerCase().includes(needle))
  const pool = officers.filter(matchesUnit)
  const tabs = [
    ['all', 'All officers', pool.length],
    ['available', 'No listed cases', pool.filter((row) => !row.cases.length).length],
    ['busy', 'With cases', pool.filter((row) => row.cases.length).length],
  ]
  const visible = pool.filter((row) => availability === 'all' || (availability === 'available') === (row.cases.length === 0))
  const selected = visible.find((row) => row.officer.id === selectedId) ?? visible.find((row) => row.cases.length) ?? visible[0] ?? null
  const filtered = availability !== 'all' || needle

  const pick = (id) => { setSelectedId(id); setPanel('cases') }

  return (
    <main className="dx-page flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-6 xl:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-strong">Officer Dispatch</h1>
          <p className="mt-1.5 text-sm text-slate-400">Registered officers come from shared accounts. Case counts and the accident queue follow the selected report source; online and on-duty availability is checked on the map.</p>
        </div>
        <button type="button" onClick={() => setPanel('queue')} className={`inline-flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-left transition ${queue.length ? 'border-orange-400/40 bg-orange-500/10 hover:bg-orange-500/15' : 'border-edge/10 bg-edge/[.04] hover:bg-edge/[.07]'}`}>
          <i className={`fa-solid fa-hourglass-half ${queue.length ? 'text-orange-600 dark:text-orange-300' : 'text-slate-400'}`} aria-hidden="true" />
          <span><span className="block text-lg font-semibold leading-none tabular-nums text-strong">{queue.length}</span><span className="text-[11px] text-slate-400">Awaiting dispatch</span></span>
        </button>
      </header>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(290px,350px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
        <section aria-label="Officer roster" className="flex min-h-0 flex-col overflow-hidden dx-card">
          <div className="space-y-3 border-b border-edge/[.08] p-3">
            <label className="relative block">
              <span className="sr-only">Search officers</span>
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search officer or unit" className="h-9 w-full rounded-xl border border-edge/10 bg-edge/[.04] pl-8 pr-3 text-xs text-strong placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none" />
            </label>

            <div role="tablist" aria-label="Availability" className="flex gap-4 border-b border-edge/10">
              {tabs.map(([id, text, count]) => (
                <button key={id} type="button" role="tab" aria-selected={availability === id} onClick={() => setAvailability(id)} className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[11px] font-medium transition ${availability === id ? 'border-orange-500 text-strong' : 'border-transparent text-slate-400 hover:text-strong'}`}>
                  {text}<span className="rounded-full bg-edge/10 px-1.5 text-[10px] tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 max-h-[360px] flex-1 space-y-1 overflow-y-auto p-2 xl:max-h-none" aria-label="Officers">
            {visible.map(({ officer, cases }) => <RosterRow key={officer.id} officer={officer} count={cases.length} selected={panel === 'cases' && selected?.officer.id === officer.id} onSelect={() => pick(officer.id)} />)}
            {!visible.length && <li className="px-3 py-8 text-center text-xs text-slate-400">{officers.length ? 'No officers match.' : 'No registered officers loaded. Sign in or refresh shared records.'}</li>}
          </ul>

          {filtered && (
            <div className="flex items-center justify-between border-t border-edge/[.08] px-3 py-2 text-[11px] text-slate-400">
              <span>Showing {visible.length} of {officers.length}</span>
              <button type="button" onClick={() => { setQuery(''); setAvailability('all') }} className="font-medium text-orange-700 hover:underline dark:text-orange-300">Clear filters</button>
            </div>
          )}
        </section>

        <section aria-label="Details" className="flex min-h-[420px] min-w-0 flex-col overflow-hidden dx-card xl:min-h-0">
          <div role="tablist" aria-label="Detail view" className="flex gap-1 border-b border-edge/[.08] px-3 pt-2.5">
            {[['cases', 'Officer cases', selected?.cases.length ?? 0], ['queue', 'Awaiting dispatch', queue.length]].map(([id, text, count]) => (
              <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={`-mb-px flex items-center gap-2 rounded-t-lg border-b-2 px-3 pb-2 pt-1 text-xs font-medium transition ${panel === id ? 'border-orange-500 text-strong' : 'border-transparent text-slate-400 hover:text-strong'}`}>
                {text}<span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${id === 'queue' && count ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300' : 'bg-edge/10 text-slate-400'}`}>{count}</span>
              </button>
            ))}
          </div>
          {panel === 'queue'
            ? <QueuePanel queue={queue} label={label} onOpenReport={onOpenReport} />
            : selected
              ? <CasesPanel key={selected.officer.id} entry={selected} label={label} onOpenReport={onOpenReport} />
              : <p className="grid flex-1 place-items-center p-8 text-center text-xs text-slate-400">Select an officer from the list to see their cases.</p>}
        </section>
      </div>
    </main>
  )
}
