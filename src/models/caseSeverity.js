// RoadSafe operational display heuristic v1, not a probability or clinical triage.
// Category + injury impact + additional vehicles; workflow/verification never
// change incident severity. Missing injury data must not imply low severity.
const categoryPoints = { collision: 15, 'hit-and-run': 20, rollover: 25, pedestrian: 25, other: 10 }
const categoryNames = { collision: 'Collision', 'hit-and-run': 'Hit-and-run', rollover: 'Rollover', pedestrian: 'Pedestrian accident', other: 'Other incident' }
export function reportedVehicles(report) {
  if (report.vehicleStatus === 'not_applicable') return 0
  return report.vehicles?.length ? report.vehicles.reduce((sum, vehicle) => sum + vehicle.count, 0) : null
}
export function caseSeverity(report) {
  const injury = report.injuries
  if (injury.status === 'fatal' || injury.fatalityCount > 0) return { score: 100, label: 'Critical', color: '#fb7185', explanation: '100/100: a fatality is reported.' }
  if (injury.status === 'unknown' || injury.injuredCount === null) return { score: null, label: 'Unknown', color: '#94a3b8', explanation: 'Severity cannot be scored until injury information is provided.' }
  const category = categoryPoints[report.categoryId] ?? 10
  const injuries = injury.status === 'injured' ? 30 + Math.min(20, Math.max(0, injury.injuredCount - 1) * 5) : 0
  const vehicleCount = reportedVehicles(report)
  const vehicles = Math.min(15, Math.max(0, (vehicleCount ?? 1) - 1) * 5)
  const score = Math.min(100, category + injuries + vehicles)
  const [label, color] = score >= 80 ? ['Critical', '#fb7185'] : score >= 60 ? ['High', '#fb923c'] : score >= 30 ? ['Medium', '#facc15'] : ['Low', '#86efac']
  const vehicleExplanation = vehicleCount === null ? 'Vehicles not reported: 0 points; score may increase with more information.' : `${vehicleCount} reported vehicles: ${Math.max(0, vehicleCount - 1)} additional × 5 = ${vehicles} points (maximum 15).`
  return { score, label, color, explanation: `${categoryNames[report.categoryId] ?? 'Other incident'}: ${category} points. ${injury.injuredCount} reported injured: ${injuries} points (30 for the first injured person + 5 for each additional; maximum 50). ${vehicleExplanation} Total: ${score}/100 (${label}).` }
}
