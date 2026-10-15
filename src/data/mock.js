export const reports = [
  {
    id: 'RA-2025-000123',
    timestamp: 'Oct 15, 2026 - 14:32',
    location: 'McArthur Hwy, Malolos',
    type: 'Collision',
    typeClass: 'bg-red-500/10 text-red-400',
    status: 'Pending Review',
    statusClass: 'bg-amber-500/10 text-amber-400',
    officer: 'Unassigned',
    action: 'Review',
  },
  {
    id: 'RA-2025-000124',
    timestamp: 'Oct 15, 2026 - 12:15',
    location: 'National Road, Baliuag',
    type: 'Pedestrian',
    typeClass: 'bg-orange-500/10 text-orange-400',
    status: 'Verified',
    statusClass: 'bg-emerald-500/10 text-emerald-400',
    officer: 'Officer Mark Santos',
    action: 'Manage',
  },
]

export const officers = [
  { name: 'Officer Mark Santos', unit: 'BL-TM-04 | Baliuag Sector', assignment: 'RA-2025-000124', pulse: true },
  { name: 'Officer Juan Dela Cruz', unit: 'BL-TM-09 | Malolos Sector', assignment: null, pulse: false },
]

export const summary = [
  { label: 'Total Reports', value: 248, valueClass: 'text-white', icon: 'fa-folder-open', iconClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { label: 'Pending Review', value: 32, valueClass: 'text-amber-400', icon: 'fa-clock', iconClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { label: 'Verified Accidents', value: 176, valueClass: 'text-emerald-400', icon: 'fa-circle-check', iconClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { label: 'Closed / Resolved', value: 40, valueClass: 'text-purple-400', icon: 'fa-box-archive', iconClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
]

export const metrics = [
  { label: 'Dangerous Intersections', pct: 24 },
  { label: 'Driver Distractions', pct: 68 },
  { label: 'Severe Congestion', pct: 41 },
]
