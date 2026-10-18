// Original filled silhouettes with even-odd cutouts. Shared by SVG and sprites.
export const ACCIDENT_ICON_PATHS = Object.freeze({
  collision: 'M1 16 L3 8 Q7 8 10 12 L11 14 L10 18 H9 A3 3 0 0 0 3 18 H1 Z M4 9.5 L3.3 12 H8.8 Q7 10 4 9.5 Z M23 18 H21 A3 3 0 0 0 15 18 H13 V13 L16 9 H23 V11 H17 L15.5 13 H23 V15 H21 V16 H23 Z M6 15.5 A2.5 2.5 0 1 1 6 20.5 A2.5 2.5 0 1 1 6 15.5 Z M6 17 A1 1 0 1 0 6 19 A1 1 0 1 0 6 17 Z M18 15.5 A2.5 2.5 0 1 1 18 20.5 A2.5 2.5 0 1 1 18 15.5 Z M18 17 A1 1 0 1 0 18 19 A1 1 0 1 0 18 17 Z M10 10 L8 5 L11 6 L12 2 L14 6 L17 4 L16 8 L13 11 L12 13 Z',
  'hit-and-run': 'M1 9 H5 Q7 9 10 13 L11 16 V19 H9 A3 3 0 0 0 3 19 H1 Z M2 10.5 V13 H7 Q5 10.5 2 10.5 Z M6 16.5 A2.5 2.5 0 1 1 6 21.5 A2.5 2.5 0 1 1 6 16.5 Z M6 18 A1 1 0 1 0 6 20 A1 1 0 1 0 6 18 Z M15 2 A2 2 0 1 1 15 6 A2 2 0 1 1 15 2 Z M14 7 L18 6 L20 3 Q21 2 22 3 L20 8 L17 9 L18 12 L21 10 L24 12 L23 14 L21 13 L17 16 Q15 17 14 15 L12 11 L11 12 L13 16 Q13 18 11 17 L9 12 Q8 11 10 9 Z M17 17 L21 20 Q22 22 20 22 L15 18 Z',
  rollover: 'M1 13 L23 7 L24 11 Q22 18 15 20 L8 20 L2 17 Z M4 13 L5 15 L9 17 L12 17 L11 11 Z M13 10.5 L14 17 Q19 16 21 11 L21 8.5 Z M6 7 A2.6 2.6 0 1 1 6 12.2 A2.6 2.6 0 1 1 6 7 Z M6 8.5 A1.1 1.1 0 1 0 6 10.7 A1.1 1.1 0 1 0 6 8.5 Z M19 3.5 A2.6 2.6 0 1 1 19 8.7 A2.6 2.6 0 1 1 19 3.5 Z M19 5 A1.1 1.1 0 1 0 19 7.2 A1.1 1.1 0 1 0 19 5 Z M1 22 H24 V23 H1 Z',
  pedestrian: 'M14 1 A2.5 2.5 0 1 1 14 6 A2.5 2.5 0 1 1 14 1 Z M11 7 Q13 6 15 8 L14 13 L17 16 L18 21 Q18 23 16 23 Q15 23 15 21 L14 18 L11 15 Q9 14 9 12 L9.5 10 L8 11 L7 14 Q6 16 4.5 14.5 L6 10 Q6.5 9 8 8 Z M15.5 8.5 L19.5 11 Q21 12 19.5 13.5 L15 11 Z M9 15 L12 17 L9 22 Q8 24 6 22.5 Q5.5 22 6 20.5 Z M2 20 H5 L4 23 H0 Z M11 20 H13 L13.5 23 H10.5 Z M20 20 H22 L24 23 H21 Z',
  other: 'M10.3 3 Q12 0 13.7 3 L24 21 Q25 23 22 23 H2 Q-1 23 0 21 Z M11 8 H13 V15 H11 Z M12 17 A1.3 1.3 0 1 1 12 19.6 A1.3 1.3 0 1 1 12 17 Z',
})
export const SEVERITY_ICON_COLORS = ['#86efac', '#facc15', '#fb923c', '#fb7185', '#94a3b8']
export const accidentIconId = (category, color) => `roadsafe-accident-${category}-${color}`

export function registerAccidentIcons(map) {
  for (const [category, path] of Object.entries(ACCIDENT_ICON_PATHS)) for (const color of SEVERITY_ICON_COLORS) {
    const id = accidentIconId(category, color)
    if (map.hasImage(id)) continue
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)
    ctx.beginPath(); ctx.arc(16, 16, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#0d121ae8'; ctx.fill()
    ctx.strokeStyle = `${color}70`; ctx.lineWidth = 1; ctx.stroke()
    ctx.translate(4, 4)
    ctx.fillStyle = color
    ctx.fill(new Path2D(path), 'evenodd')
    map.addImage(id, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 })
  }
}
