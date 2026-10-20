import { demoEvidence } from './demoEvidence.js'
import { ACCIDENT_CATEGORIES, REPORT_STATUSES, REPORT_STATUS, VERIFIED_STATUSES, ROLES, parseReportsResponse } from '../models/report.js'

// Fictional incidents at representative city-center coordinates, not actual
// crash sites. Explicit coordinates avoid scattering points into water/fields.
const locations = [
  ['Central Luzon', 'Malolos', 'Bulacan', 14.8433, 120.8114],
  ['Central Luzon', 'San Fernando', 'Pampanga', 15.0286, 120.6898],
  ['Central Luzon', 'Tarlac City', 'Tarlac', 15.4869, 120.5900],
  ['Central Luzon', 'Cabanatuan', 'Nueva Ecija', 15.4865, 120.9734],
  ['Central Luzon', 'Balanga', 'Bataan', 14.6761, 120.5361],
  ['Metro Manila', 'Manila', 'Metro Manila', 14.5995, 120.9842],
  ['Metro Manila', 'Quezon City', 'Metro Manila', 14.6760, 121.0437],
  ['Metro Manila', 'Makati', 'Metro Manila', 14.5547, 121.0244],
  ['Metro Manila', 'Pasig', 'Metro Manila', 14.5764, 121.0851],
  ['Metro Manila', 'Marikina', 'Metro Manila', 14.6507, 121.1029],
  ['CALABARZON', 'Bacoor', 'Cavite', 14.4594, 120.9631],
  ['CALABARZON', 'Calamba', 'Laguna', 14.2117, 121.1653],
  ['CALABARZON', 'Batangas City', 'Batangas', 13.7565, 121.0583],
  ['CALABARZON', 'Antipolo', 'Rizal', 14.5864, 121.1760],
  ['CALABARZON', 'Lucena', 'Quezon', 13.9373, 121.6170],
  ['Ilocos', 'Laoag', 'Ilocos Norte', 18.1978, 120.5936],
  ['Ilocos', 'Vigan', 'Ilocos Sur', 17.5747, 120.3869],
  ['Ilocos', 'San Fernando', 'La Union', 16.6159, 120.3166],
  ['Ilocos', 'Dagupan', 'Pangasinan', 16.0433, 120.3333],
  ['Ilocos', 'Urdaneta', 'Pangasinan', 15.9754, 120.5707],
  ['Cagayan Valley', 'Tuguegarao', 'Cagayan', 17.6132, 121.7270],
  ['Cagayan Valley', 'Ilagan', 'Isabela', 17.1485, 121.8890],
  ['Cagayan Valley', 'Cauayan', 'Isabela', 16.9268, 121.7704],
  ['Cagayan Valley', 'Santiago', 'Isabela', 16.6872, 121.5487],
  ['Cagayan Valley', 'Bayombong', 'Nueva Vizcaya', 16.4812, 121.1497],
  ['Bicol Region', 'Daet', 'Camarines Norte', 14.1122, 122.9553],
  ['Bicol Region', 'Naga', 'Camarines Sur', 13.6218, 123.1948],
  ['Bicol Region', 'Legazpi', 'Albay', 13.1391, 123.7438],
  ['Bicol Region', 'Sorsogon City', 'Sorsogon', 12.9700, 124.0058],
  ['Bicol Region', 'Ligao', 'Albay', 13.2167, 123.5167],
]
const narratives = [
  'A sedan and a motorcycle collided while merging at an urban junction. Both vehicles were moved out of the through lane; traffic control was requested.',
  'A delivery van struck a parked motorcycle and left before the parties could exchange details. The reporting party noted the direction of travel for follow-up.',
  'A light delivery truck overturned after its driver swerved on a wet bend. Debris partially blocked one lane while recovery assistance was requested.',
  'A jeepney struck a pedestrian near a crossing during slow-moving traffic. Bystanders assisted the pedestrian while medical assessment was requested.',
  'A car struck a roadside barrier after a tire failure. The vehicle remained on the shoulder with hazard lights on while clearance was arranged.',
]
const users = [
  { id: 'luzon-sample-public', name: 'Sample Citizen', role: ROLES.PUBLIC },
  { id: 'luzon-sample-admin', name: 'Sample Reviewer', role: ROLES.ADMIN },
  { id: 'luzon-sample-officer', name: 'Sample Response Unit', role: ROLES.OFFICER, unit: 'DEMO-UNIT', responderType: 'police' },
]
export const luzonReportsResponse = parseReportsResponse({
  meta: { schemaVersion: 1, sample: true }, included: { users },
  data: locations.map(([region, city, province, latitude, longitude], index) => {
    const category = ACCIDENT_CATEGORIES[index % 5]
    const status = REPORT_STATUSES[index % REPORT_STATUSES.length]
    const verified = VERIFIED_STATUSES.includes(status)
    const severity = index % 3 + 1
    const occurredAt = `2026-10-${String(10 + index % 7).padStart(2, '0')}T${String(6 + index % 14).padStart(2, '0')}:${index % 2 ? '35' : '10'}:00+08:00`
    const submittedAt = new Date(Date.parse(occurredAt) + 5 * 60000).toISOString()
    return {
      id: `DEMO-LUZON-2026-${String(index + 1).padStart(3, '0')}`,
      sample: true, region,
      reporter: { userId: 'luzon-sample-public', name: 'Sample Citizen', contact: null },
      occurredAt, submittedAt,
      location: { address: `City center, ${city}, ${province}`, coordinates: { latitude, longitude } },
      categoryId: category.id,
      description: `Fictional training scenario in ${city}: ${narratives[index % 5]}`,
      vehicles: index % 5 === 0 ? [{ type: 'Sedan', count: 1 }, { type: 'Motorcycle', count: 1 }]
        : index % 5 === 1 ? [{ type: 'Delivery van', count: 1 }, { type: 'Motorcycle', count: 1 }]
          : [{ type: ['Sedan', 'Van', 'Light truck', 'Jeepney', 'Car'][index % 5], count: 1 }],
      injuries: severity === 1 ? { status: 'none', injuredCount: 0, fatalityCount: 0 }
        : { status: 'injured', injuredCount: severity === 3 ? 2 : 1, fatalityCount: 0 },
      severity, evidence: demoEvidence(index), status,
      assignedOfficerId: [REPORT_STATUS.ASSIGNED, REPORT_STATUS.IN_PROGRESS].includes(status) ? 'luzon-sample-officer' : null,
      officialRemarks: verified ? 'Sample-only review completed; not a real emergency record.' : '',
      verification: { verifiedBy: verified ? 'luzon-sample-admin' : null, verifiedAt: verified ? new Date(Date.parse(occurredAt) + 15 * 60000).toISOString() : null },
      rejectionReason: status === REPORT_STATUS.REJECTED ? 'Training scenario: duplicate report of the same incident.' : null,
    }
  }),
})

export const LUZON_SAMPLE_BOUNDS = [[119.8, 12.6], [124.3, 18.6]]
