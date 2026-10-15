export default function AnalyticsView() {
  return (
    <main className="flex-1 p-6 overflow-y-auto space-y-6">
      <div className="bg-darkCard border border-darkBorder p-6 rounded-2xl shadow-xl max-w-xl space-y-4">
        <h3 className="font-bold text-base text-white">Generate & Download Reports</h3>
        <p className="text-xs text-slate-400">Export comprehensive analytics summaries for municipal reporting and traffic safety audits.</p>
        <div className="space-y-3 text-xs">
          <label htmlFor="timeframe" className="block text-slate-300 font-medium">Select Timeframe</label>
          <select id="timeframe" className="w-full bg-darkBg border border-darkBorder rounded-xl px-3 py-2 text-slate-200">
            <option>Current Month (October 2026)</option>
            <option>Q3 2026 Summary</option>
            <option>Year-to-Date Annual Audit</option>
          </select>
        </div>
        <div className="pt-2 flex gap-3">
          <button onClick={() => alert('PDF Report generated successfully!')} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold shadow transition text-xs">
            <i className="fa-solid fa-file-pdf mr-2"></i> Download PDF
          </button>
          <button onClick={() => alert('CSV Data exported successfully!')} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold border border-darkBorder transition text-xs">
            <i className="fa-solid fa-file-csv mr-2"></i> Export CSV
          </button>
        </div>
      </div>
    </main>
  )
}
