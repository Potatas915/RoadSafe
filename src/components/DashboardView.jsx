import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

const trendData = {
  labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
  datasets: [{
    label: 'Accident Reports',
    data: [35, 42, 38, 39, 62, 48],
    borderColor: '#f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    fill: true,
    tension: 0.4,
  }],
}

const trendOptions = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
  },
}

const typeData = {
  labels: ['Collision', 'Pedestrian', 'Rollover', 'Distraction'],
  datasets: [{
    data: [55, 20, 15, 10],
    backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#a855f7'],
    borderWidth: 0,
  }],
}

const typeOptions = {
  responsive: true,
  plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 } } } },
}

export default function DashboardView() {
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl shadow-xl">
          <h3 className="font-bold text-sm text-white mb-1">Reports Trend Over Time</h3>
          <p className="text-xs text-slate-400 mb-4">Monthly aggregate submissions across Central Luzon</p>
          <Line data={trendData} options={trendOptions} height={120} />
        </div>
        <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl shadow-xl">
          <h3 className="font-bold text-sm text-white mb-1">Accident Types Distribution</h3>
          <p className="text-xs text-slate-400 mb-4">Categorized breakdown of verified incidents</p>
          <div className="flex justify-center">
            <div className="w-60 h-60">
              <Doughnut data={typeData} options={typeOptions} />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
