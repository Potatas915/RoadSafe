export default function ReportModal({ reportId, onClose }) {
  if (!reportId) return null

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-6" role="dialog" aria-modal="true">
      <div className="bg-darkCard border border-darkBorder w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-darkBorder flex items-center justify-between bg-slate-900/50">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <span>Report Details:</span> <span className="text-orange-400 font-mono">{reportId}</span>
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Location & Coordinates</span>
              <p className="font-medium text-white">McArthur Highway, Malolos, Bulacan</p>
              <p className="font-mono text-orange-400 text-[11px]">14.8415° N, 120.8114° E</p>
            </div>
            <div className="bg-darkBg p-3 rounded-xl border border-darkBorder space-y-1">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Incident Category</span>
              <p className="font-medium text-white">Multi-Vehicle Collision</p>
              <p className="text-slate-400 text-[11px]">Injuries reported: 2 minor</p>
            </div>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-2">Attached Photo Evidence</span>
            <div className="grid grid-cols-3 gap-3">
              {['Evidence_01.jpg', 'Evidence_02.jpg'].map((f) => (
                <div key={f} className="bg-slate-800 h-24 rounded-xl border border-darkBorder flex items-center justify-center text-slate-500 font-mono text-[11px]">{f}</div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-darkBorder">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Officer Assignment & Status Management</span>
            <div className="grid grid-cols-2 gap-3">
              <select aria-label="Assign officer" className="bg-darkBg border border-darkBorder rounded-xl p-2.5 text-slate-200">
                <option>Assign Officer: Mark Santos</option>
                <option>Assign Officer: Juan Dela Cruz</option>
              </select>
              <select aria-label="Report status" defaultValue="Status: Verified" className="bg-darkBg border border-darkBorder rounded-xl p-2.5 text-slate-200">
                <option>Status: Pending Review</option>
                <option>Status: Verified</option>
                <option>Status: In Progress</option>
                <option>Status: Closed / Resolved</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-darkBorder bg-slate-900/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition">Cancel</button>
          <button
            onClick={() => { alert('Report updated and dispatched successfully!'); onClose() }}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold shadow transition"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
