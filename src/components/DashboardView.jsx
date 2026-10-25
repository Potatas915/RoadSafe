import { useCategories } from './CategoryContext.js'
import useTheme from '../hooks/useTheme.js'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { REPORT_STATUS, REPORT_STATUSES, isOfficiallyVerified, reportSummary } from '../models/report.js'
import { caseSeverity } from '../models/caseSeverity.js'
import DashboardIncidentFeed from './DashboardIncidentFeed.jsx'
import './dashboard.css'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

// Chart.js draws on a canvas, so it cannot read CSS variables: pick colors per theme here.
const chartTheme = (dark) => {
  const tick = dark ? '#a99d94' : '#64748b'
  const tooltip = dark
    ? { backgroundColor: '#ffffff', titleColor: '#6b7280', bodyColor: '#111827', bodyFont: { weight: '600', size: 13 }, borderWidth: 0, padding: 12, cornerRadius: 14, displayColors: false, caretSize: 0 }
    : { backgroundColor: '#111827', titleColor: '#9ca3af', bodyColor: '#ffffff', bodyFont: { weight: '600', size: 13 }, borderWidth: 0, padding: 12, cornerRadius: 14, displayColors: false, caretSize: 0 }
  const grid = (alpha) => dark ? `rgba(255,255,255,${alpha})` : `rgba(15,23,42,${alpha * 1.2})`
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: tick, font: { size: 11 }, maxRotation: 0, padding: 8 } },
      y: { beginAtZero: true, grid: { color: grid(.06), tickLength: 0, borderDash: [3, 5] }, border: { display: false }, ticks: { color: tick, precision: 0, padding: 12, font: { size: 11 } } },
    },
  }
  return { tooltip, options }
}
// A soft glow under the trend line, like a lit filament.
const lineGlow = {
  id: 'lineGlow',
  beforeDatasetDraw(chart, args) { if (args.meta.type !== 'line') return; chart.ctx.save(); chart.ctx.shadowColor = 'rgba(255, 122, 26, .55)'; chart.ctx.shadowBlur = 16 },
  afterDatasetDraw(chart, args) { if (args.meta.type === 'line') chart.ctx.restore() },
}
const gradient = (rgb) => ({ chart }) => {
  const area = chart.chartArea
  if (!area) return `rgba(${rgb}, .16)`
  const fill = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
  fill.addColorStop(0, `rgba(${rgb}, .38)`)
  fill.addColorStop(1, `rgba(${rgb}, .015)`)
  return fill
}

export default function DashboardView({ reports, onOpenReport }) {
  const ACCIDENT_CATEGORIES = useCategories()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const { tooltip, options } = chartTheme(dark)

  const summary = reportSummary(reports)
  const counts = new Map()
  for (const report of reports) {
    const month = new Date(new Date(report.submittedAt).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  const recordedMonths = [...counts.keys()].sort()
  const months = []
  if (recordedMonths.length) {
    const last = new Date(`${recordedMonths.at(-1)}-01T00:00:00Z`)
    const first = new Date(`${recordedMonths[0]}-01T00:00:00Z`)
    const sixMonths = new Date(last); sixMonths.setUTCMonth(sixMonths.getUTCMonth() - 5)
    const cursor = first < sixMonths ? first : sixMonths
    while (cursor <= last) { months.push(cursor.toISOString().slice(0, 7)); cursor.setUTCMonth(cursor.getUTCMonth() + 1) }
  }
  const trendData = {
    labels: months.map((month) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))),
    datasets: [{ label: 'Submitted reports', data: months.map((month) => counts.get(month) ?? 0), borderColor: '#ff7a1a', backgroundColor: gradient('255, 122, 26'), fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3.5, pointHoverRadius: 7, pointBackgroundColor: '#ffffff', pointBorderColor: '#ff7a1a', pointBorderWidth: 2, pointHoverBackgroundColor: '#ffffff', pointHoverBorderWidth: 3 }],
  }
  const verified = reports.filter(isOfficiallyVerified)
  const typeData = { labels: ACCIDENT_CATEGORIES.map((c) => c.label), datasets: [{ data: ACCIDENT_CATEGORIES.map((c) => verified.filter((r) => r.categoryId === c.id).length), backgroundColor: ACCIDENT_CATEGORIES.map((c) => `${c.color}${dark ? 'cc' : 'dd'}`), borderColor: 'transparent', hoverBackgroundColor: ACCIDENT_CATEGORIES.map((c) => c.color), borderWidth: 0, spacing: 4, borderRadius: 10 }] }
  const statuses = REPORT_STATUSES.map((status) => ({ status, count: reports.filter((r) => r.status === status).length }))
  const open = reports.filter((report) => ![REPORT_STATUS.CLOSED, REPORT_STATUS.REJECTED].includes(report.status))
  const urgent = open.filter((report) => (caseSeverity(report).score ?? 0) >= 60).length
  const share = summary.total ? Math.round(summary.pending / summary.total * 100) : 0
  const pct = (value) => `${summary.total ? Math.round(value / summary.total * 100) : 0}% of all reports`
  const minis = [
    ['Total reports', summary.total, 'fa-file-lines', '#f5c451', 'Everything submitted so far'],
    ['Officially verified', summary.verified, 'fa-circle-check', '#6ee7b7', pct(summary.verified)],
    ['Resolved / Closed', summary.closed, 'fa-check-double', '#93c5fd', pct(summary.closed)],
  ]
  return <main className="dx-page flex-1 min-h-0 overflow-y-auto p-4 md:p-6 xl:flex xl:flex-col xl:overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
      <div><h1 className="text-2xl font-semibold tracking-tight text-strong">Dashboard Overview</h1>
        <p className="mt-1.5 text-sm text-slate-400">What needs attention first, and how reports are trending.</p></div>
      <span className="dx-chip"><i aria-hidden="true" className="fa-solid fa-database text-[10px] text-orange-500" />Current report dataset</span>
    </div>
    <div className="grid gap-4 xl:flex-1 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
        <section aria-labelledby="kicker-attention">
          <h2 id="kicker-attention" className="sr-only">Needs attention first</h2>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
            <div className="dx-card dx-attention col-span-2 xl:col-span-1" title="Counts use the current shared dataset.">
              <p className="dx-attention-label"><i aria-hidden="true" className="fa-solid fa-clock" />Awaiting review</p>
              <p className="dx-attention-value">{summary.pending}</p>
              <div className="dx-attention-facts">
                <span>{share}% of all reports</span>
                <span><i aria-hidden="true" className="fa-solid fa-triangle-exclamation text-[11px]" />{urgent} high or critical open</span>
              </div>
            </div>
            {minis.map(([label, value, icon, color, note]) => <section key={label} className="dx-card dx-tile" style={{ '--kc': color }} title={label === 'Officially verified' ? 'Includes assigned, in-progress and closed verified records.' : undefined}>
              <div className="flex items-center justify-between gap-3"><h3 className="dx-mini-label">{label}</h3><span className="dx-icon"><i aria-hidden="true" className={`fa-solid ${icon} text-xs`} /></span></div>
              <div><p className="dx-mini-value">{value}</p><p className="mt-1.5 text-[11px] text-slate-400">{note}</p></div>
            </section>)}
          </div>
        </section>

        <section aria-labelledby="kicker-trends">
          <h2 id="kicker-trends" className="sr-only">Trends</h2>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:min-h-[clamp(240px,32vh,380px)]">
            <div className="dx-card flex min-w-0 flex-col p-5">
              <h3 className="dx-title">Reports over time</h3><p className="dx-sub mb-3">Monthly submissions · Asia/Manila</p>
              {reports.length ? <div className="relative h-64 xl:h-auto xl:min-h-[200px] xl:flex-1"><Line data={trendData} options={options} plugins={[lineGlow]} aria-label="Reports by submission month" role="img" /></div> : <div className="grid h-64 place-items-center text-xs text-slate-400 xl:h-auto xl:flex-1">No submitted reports yet.</div>}
            </div>
            <div className="dx-card flex min-w-0 flex-col p-5">
              <h3 className="dx-title">Verified by category</h3><p className="dx-sub mb-3">{verified.length} verified reports</p>
              {verified.length ? <div className="flex flex-col items-center gap-3 xl:flex-1 2xl:flex-row 2xl:gap-5">
                <div className="relative h-[130px] w-[130px] shrink-0 2xl:h-[150px] 2xl:w-[150px]"><Doughnut data={typeData} options={{ responsive: true, maintainAspectRatio: false, cutout: '74%', plugins: { legend: { display: false }, tooltip } }} aria-label="Verified accidents by category" role="img" />
                  <div className="dx-donut-center"><span className="text-2xl font-semibold tracking-tight text-strong tabular-nums">{verified.length}</span><span className="text-[11px] text-slate-400">verified</span></div></div>
                <ul className="dx-legend !mt-0 w-full min-w-0 !gap-2 grid-cols-[minmax(0,1fr)] 2xl:flex-1">{ACCIDENT_CATEGORIES.map((c) => <li key={c.id} title={c.label}><i style={{ backgroundColor: c.color }} /><span className="truncate">{c.label}</span><b>{verified.filter((r) => r.categoryId === c.id).length}</b></li>)}</ul>
              </div> : <div className="grid h-64 place-items-center text-xs text-slate-400 xl:h-auto xl:flex-1">No verified reports yet.</div>}
            </div>
          </div>
        </section>

        <section aria-labelledby="kicker-breakdown">
          <h2 id="kicker-breakdown" className="sr-only">Breakdown</h2>
          <div className="dx-card p-5">
            <h3 className="dx-title mb-3">Report status breakdown</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statuses.map(({ status, count }, index) => {
              const color = ['#f5c451', '#fb923c', '#c4b5fd', '#34d399', '#60a5fa', '#22d3ee', '#4ade80', '#f87171'][index]
              return <div key={status} className="dx-status" style={{ '--fc': color }}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="truncate text-slate-400" title={status}>{status}</span><span className="dx-count">{count}</span></div><div className="dx-track"><div className="dx-fill" style={{ width: `${summary.total ? count / summary.total * 100 : 0}%`, background: `linear-gradient(90deg, ${color}66, ${color})` }} /></div></div>
            })}</div>
          </div>
        </section>
      </div>
      <DashboardIncidentFeed reports={reports} onOpenReport={onOpenReport} />
    </div>
  </main>
}
