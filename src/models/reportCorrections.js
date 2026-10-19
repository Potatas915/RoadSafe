export const VEHICLE_TYPES = ['car', 'motorcycle', 'tricycle', 'jeepney', 'van', 'bus', 'truck', 'bicycle', 'other', 'unknown']
export const canCorrectReport = report => !report.isDuplicate && !report.verification?.verifiedAt && !report.assignedOfficerId
  && ['Submitted', 'Under Review', 'Additional Information Required'].includes(report.status)

export function correctionDraft(report) {
  return {
    categoryId: report.categoryId,
    occurredAt: new Date(Date.parse(report.occurredAt) + 8 * 3600000).toISOString().slice(0, 23),
    originalOccurredAt: report.occurredAt,
    address: report.location.address ?? '', latitude: String(report.location.coordinates?.latitude ?? ''),
    longitude: String(report.location.coordinates?.longitude ?? ''), vehicleStatus: report.vehicleStatus ?? (report.vehicles.length ? 'known' : 'unknown'),
    counts: Object.fromEntries(report.vehicles.map(v => [v.type, String(v.count)])),
    injuryStatus: report.injuries.status, injuredCount: String(report.injuries.injuredCount ?? ''), fatalityCount: String(report.injuries.fatalityCount ?? ''),
  }
}

export function correctionValues(draft, now = Date.now()) {
  if (!draft.latitude.trim() || !draft.longitude.trim()) throw new Error('Confirm both coordinates.')
  const latitude = Number(draft.latitude), longitude = Number(draft.longitude)
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Coordinates are out of range.')
  const time = Date.parse(`${draft.occurredAt}+08:00`)
  if (!Number.isFinite(time) || time > now + 300000) throw new Error('Choose a valid incident time that is not in the future.')
  const whole = (value, min) => {
    const n = Number(value)
    if (!/^\d+$/.test(value) || !Number.isInteger(n) || n < min || n > 999) throw new Error(`Counts must be whole numbers from ${min} to 999.`)
    return n
  }
  const vehicles = draft.vehicleStatus === 'known' ? VEHICLE_TYPES.filter(type => draft.counts[type]?.trim()).map(type => ({ type, count: whole(draft.counts[type].trim(), 1) })) : []
  if (draft.vehicleStatus === 'known' && !vehicles.length) throw new Error('Enter at least one vehicle count.')
  const status = draft.injuryStatus
  const injuredCount = ['unknown', 'none'].includes(status) ? status === 'none' ? 0 : null : draft.injuredCount.trim() ? whole(draft.injuredCount.trim(), status === 'injured' ? 1 : 0) : null
  const fatalityCount = ['unknown', 'none', 'injured'].includes(status) ? status === 'unknown' ? null : 0 : draft.fatalityCount.trim() ? whole(draft.fatalityCount.trim(), 1) : null
  return { categoryId: draft.categoryId, occurredAt: time === Date.parse(draft.originalOccurredAt) ? draft.originalOccurredAt : new Date(time).toISOString(),
    location: { address: draft.address.trim() || null, coordinates: { latitude, longitude } },
    vehicleStatus: draft.vehicleStatus, vehicles, injuries: { status, injuredCount, fatalityCount } }
}
