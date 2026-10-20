// Repeatable randomized selections keep demos stable across refreshes.
export function demoEvidence(index) {
 const seed = (Math.imul(index + 1, 2654435761) ^ (index << 8)) >>> 0
 const first = (seed ^ (seed >>> 16)) >>> 0
 return [first % 5, (first % 5 + 1 + (seed >>> 8) % 4) % 5].map((photo, slot) => ({
 id: `demo-photo-${index}-${slot}`, fileName: `Demo accident photo ${photo + 1}`,
 mimeType: 'image/jpeg', url: `/demo-accidents/accident-${photo + 1}.jpg`,
 }))
}
