import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { ACCIDENT_CATEGORIES, isOfficiallyVerified, reportSummary } from '../models/report.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)
const options = { responsive: true, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
export default function DashboardView({ reports }) {
  const summary = reportSummary(reports)
  const counts = new Map()
  for (const report of reports) {
    const month = new Date(new Date(report.submittedAt).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  const months = [...counts.keys()].sort()
  const trendData = { labels: months, datasets: [{ label: 'Submitted reports (Manila month)', data: months.map((month) => counts.get(month)), borderColor: '#f97316', backgroundColor: '#f9731620', fill: true, tension: .3 }] }
  const verified = reports.filter(isOfficiallyVerified)
  const typeData = { labels: ACCIDENT_CATEGORIES.map((c) => c.label), datasets: [{ data: ACCIDENT_CATEGORIES.map((c) => verified.filter((r) => r.categoryId === c.id).length), backgroundColor: ACCIDENT_CATEGORIES.map((c) => c.color), borderWidth: 0 }] }
  return <main className="flex-1 p-6 overflow-y-auto space-y-6">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{[['Total reports', summary.total], ['Awaiting review / clarification', summary.pending], ['Officially verified', summary.verified], ['Resolved / Closed', summary.closed]].map(([label, value]) => <section key={label} className="bg-darkCard border border-darkBorder p-5 rounded-2xl"><h3 className="text-xs text-slate-400">{label}</h3><p className="text-2xl font-bold">{value}</p></section>)}</div>
    <p className="text-xs text-slate-400">Officially verified includes assigned, in-progress and closed verified records. Counts come from the current shared dataset.</p>
    <div className="grid xl:grid-cols-2 gap-6"><section className="bg-darkCard border border-darkBorder p-5 rounded-2xl"><h3 className="mb-4">Reports by submission month</h3><Line data={trendData} options={options} /></section><section className="bg-darkCard border border-darkBorder p-5 rounded-2xl"><h3 className="mb-4">Verified accidents by category</h3>{verified.length ? <div className="max-w-xs mx-auto"><Doughnut data={typeData} options={options} /></div> : <p>No verified reports yet.</p>}</section></div>
  </main>
}
