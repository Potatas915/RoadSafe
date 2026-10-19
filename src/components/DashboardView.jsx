import { useCategories } from './CategoryContext.js'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { REPORT_STATUSES, isOfficiallyVerified, reportSummary } from '../models/report.js'
import DashboardIncidentFeed from './DashboardIncidentFeed.jsx'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

const tooltip = { backgroundColor: 'rgba(24, 30, 38, .96)', titleColor: '#f8fafc', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, padding: 12, cornerRadius: 10, displayColors: true }
const legend = { position: 'bottom', labels: { color: '#a8b2bf', usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 20, font: { size: 11 } } }
const options = {
  responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
  plugins: { legend, tooltip },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,.035)' }, border: { display: false }, ticks: { color: '#8d99a8', font: { size: 10 }, maxRotation: 0 } },
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.065)', tickLength: 0 }, border: { display: false }, ticks: { color: '#8d99a8', precision: 0, padding: 10, font: { size: 10 } } },
  },
}
const gradient = (rgb) => ({ chart }) => {
  const area = chart.chartArea
  if (!area) return `rgba(${rgb}, .16)`
  const fill = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
  fill.addColorStop(0, `rgba(${rgb}, .30)`)
  fill.addColorStop(1, `rgba(${rgb}, .015)`)
  return fill
}

export default function DashboardView({ reports, onOpenReport }) {
  const ACCIDENT_CATEGORIES = useCategories()

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
    datasets: [{ label: 'Submitted reports', data: months.map((month) => counts.get(month) ?? 0), borderColor: '#f5c451', backgroundColor: gradient('245, 196, 81'), fill: true, tension: .35, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#f5c451', pointBorderColor: '#161c24', pointBorderWidth: 2 }],
  }
  const verified = reports.filter(isOfficiallyVerified)
  const typeData = { labels: ACCIDENT_CATEGORIES.map((c) => c.label), datasets: [{ data: ACCIDENT_CATEGORIES.map((c) => verified.filter((r) => r.categoryId === c.id).length), backgroundColor: ACCIDENT_CATEGORIES.map((c) => `${c.color}55`), borderColor: ACCIDENT_CATEGORIES.map((c) => `${c.color}cc`), hoverBackgroundColor: ACCIDENT_CATEGORIES.map((c) => `${c.color}99`), borderWidth: 1.5, spacing: 5, borderRadius: 5 }] }
  const statuses = REPORT_STATUSES.map((status) => ({ status, count: reports.filter((r) => r.status === status).length }))
  const cards = [
    ['Total reports', summary.total, 'fa-file-lines', '#f5c451'],
    ['Awaiting review / clarification', summary.pending, 'fa-clock', '#fb923c'],
    ['Officially verified', summary.verified, 'fa-circle-check', '#6ee7b7'],
    ['Resolved / Closed', summary.closed, 'fa-check-double', '#93c5fd'],
  ]
  const panel = 'rounded-2xl border border-white/[.07] bg-gradient-to-br from-white/[.045] to-white/[.015] shadow-lg'
  return <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6 bg-[#0d121a]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[10px] uppercase tracking-[.2em] text-slate-500 mb-2">RoadSafe analytics</p><h1 className="text-xl font-semibold text-white">Traffic safety overview</h1></div>
      <span className="text-[11px] rounded-full border border-white/10 px-3 py-1.5 text-slate-400">Current report dataset</span>
    </div>
    <div className="grid xl:grid-cols-[350px_minmax(0,1fr)] gap-5 items-start">
    <DashboardIncidentFeed reports={reports} onOpenReport={onOpenReport} />
    <div className="min-w-0 space-y-6 order-first xl:order-last">
    <div className="grid grid-cols-2 2xl:grid-cols-4 gap-3 md:gap-4">{cards.map(([label, value, icon, color]) => <section key={label} className={`${panel} p-4 md:p-5 relative overflow-hidden`} style={{ backgroundImage: `linear-gradient(125deg, ${color}16, ${color}03)` }}>
      <i aria-hidden="true" className={`fa-solid ${icon} text-sm mb-4`} style={{ color }} />
      <h2 className="text-[11px] text-slate-400 min-h-8">{label}</h2><p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
      <span className="absolute left-0 bottom-0 h-px w-full" style={{ background: `linear-gradient(90deg, ${color}80, transparent)` }} />
    </section>)}</div>
    <p className="text-xs text-slate-500">Officially verified includes assigned, in-progress and closed verified records. All counts use the current shared dataset.</p>
    <div className="grid xl:grid-cols-3 gap-4">
      <section className={`${panel} p-4 md:p-5 xl:col-span-2 min-w-0`}>
        <h2 className="text-sm font-medium text-slate-100">Reports over time</h2><p className="text-[11px] text-slate-500 mt-1 mb-5">Monthly submissions · Asia/Manila · quiet months shown as zero</p>
        {reports.length ? <div className="h-72"><Line data={trendData} options={options} aria-label="Reports by submission month" role="img" /></div> : <div className="h-72 grid place-items-center text-xs text-slate-400">No submitted reports yet.</div>}
      </section>
      <section className={`${panel} p-4 md:p-5 min-w-0`}>
        <h2 className="text-sm font-medium text-slate-100">Verified accidents by category</h2><p className="text-[11px] text-slate-500 mt-1 mb-5">Category share of {verified.length} verified reports</p>
        {verified.length ? <div className="h-72"><Doughnut data={typeData} options={{ responsive: true, maintainAspectRatio: false, cutout: '74%', plugins: { legend, tooltip } }} aria-label="Verified accidents by category" role="img" /></div> : <div className="h-72 grid place-items-center text-xs text-slate-400">No verified reports yet.</div>}
      </section>
    </div>
    <section className={`${panel} p-4 md:p-5`}>
      <h2 className="text-sm font-medium text-slate-100 mb-5">Report status breakdown</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5">{statuses.map(({ status, count }, index) => {
        const color = ['#f5c451', '#fb923c', '#c4b5fd', '#6ee7b7', '#93c5fd', '#67e8f9', '#86efac', '#fca5a5'][index]
        return <div key={status}><div className="flex justify-between gap-3 mb-2 text-[11px]"><span className="text-slate-400">{status}</span><span className="text-slate-200 tabular-nums">{count}</span></div><div className="h-1.5 rounded-full bg-white/[.04] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${summary.total ? count / summary.total * 100 : 0}%`, background: `linear-gradient(90deg, ${color}33, ${color}aa)` }} /></div></div>
      })}</div>
    </section>
    </div>
    </div>
  </main>
}
