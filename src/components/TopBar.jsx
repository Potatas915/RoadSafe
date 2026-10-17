export default function TopBar({ live = false, pendingCount = 0, onOpenReports }) {
  return (
    <header className="h-16 bg-darkCard/90 backdrop-blur border-b border-darkBorder px-6 flex items-center justify-between z-20 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold bg-darkBg border border-darkBorder px-3 py-1.5 rounded-lg text-slate-300">
          <i className="fa-solid fa-location-dot text-orange-500"></i> Region: Central Luzon / Bulacan
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {live ? 'Shared records' : 'Web prototype'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <input
            type="text"
            aria-label="Search"
            placeholder="Search report ID, location, officer..."
            className="bg-darkBg border border-darkBorder rounded-lg px-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brandOrange w-64 shadow-inner"
          />
          <i className="fa-solid fa-magnifying-glass absolute right-3 top-2 text-slate-400 text-xs"></i>
        </div>
        <button
          aria-label="Reports awaiting review" title={`${pendingCount} reports awaiting review`}
          onClick={onOpenReports}
          className="relative p-2 text-slate-400 hover:text-white bg-darkBg border border-darkBorder rounded-lg transition"
        >
          <i className="fa-regular fa-bell text-sm"></i>
          
          {pendingCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 px-1 bg-orange-500 text-white rounded-full text-[10px]">{pendingCount}</span>}
        </button>
      </div>
    </header>
  )
}

