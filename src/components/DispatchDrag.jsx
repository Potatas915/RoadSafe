import { useEffect, useRef, useState } from 'react'
import './DispatchDrag.css'

// Screen-space HUD; geographic targets are reprojected whenever the map moves.
export default function DispatchDrag({ mapRef, ready, onDispatch, canDispatch, onRecommend, getPersonnel = () => 1 }) {
  const hud = useRef(null), lock = useRef(null), trail = useRef(null)
  const callbacks = useRef({ onDispatch, canDispatch, onRecommend, getPersonnel })
  callbacks.current = { onDispatch, canDispatch, onRecommend, getPersonnel }
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 5000)
    return () => clearTimeout(timer)
  }, [message])
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const canvas = map.getCanvas(), host = map.getContainer()
    let gesture = null, frame = 0, timer, suppressClick = false
    const point = (event) => {
      const rect = host.getBoundingClientRect()
      return { x: (event.clientX - rect.left) * host.clientWidth / rect.width, y: (event.clientY - rect.top) * host.clientHeight / rect.height }
    }
    const query = (where, layers) => {
      const available = layers.filter(id => map.getLayer(id))
      return available.length ? map.queryRenderedFeatures(where, { layers: available }) : []
    }
    const paint = () => {
      frame = 0
      if (!gesture?.dragging) return
      const { x, y } = gesture.point
      const inside = x >= 0 && y >= 0 && x <= host.clientWidth && y <= host.clientHeight
      const targets = inside ? query([[x - 44, y - 44], [x + 44, y + 44]], gesture.medical ? ['roadsafe-medical-stations-layer'] : ['roadsafe-report-points']) : []
      let nearest = null, distance = 44
      for (const feature of targets) {
        if (gesture.medical && !['hospital', 'clinic'].includes(feature.properties.kind?.toLowerCase())) continue
        const position = map.project(feature.geometry.coordinates)
        const next = Math.hypot(position.x - x, position.y - y)
        if (next < distance) { distance = next; nearest = { feature, position } }
      }
      gesture.target = nearest?.feature ?? null
      hud.current.style.transform = `translate(${x}px, ${y}px)`
      hud.current.dataset.locked = String(Boolean(nearest))
      hud.current.querySelector('span').textContent = nearest ? 'TARGET LOCK · RELEASE' : gesture.medical ? 'CHOOSE HOSPITAL / CLINIC' : 'ACQUIRE INCIDENT'
      hud.current.querySelector('small').textContent = gesture.medical ? 'FACILITY INFORMATION · NO DISPATCH' : `${callbacks.current.getPersonnel(gesture.station)} PERSONNEL · LOCAL SIM`
      lock.current.style.opacity = nearest ? '1' : '0'
      if (nearest) lock.current.style.transform = `translate(${nearest.position.x}px, ${nearest.position.y}px)`
      const origin = map.project(gesture.origin)
      trail.current.setAttribute('d', `M${origin.x},${origin.y} Q${origin.x},${y} ${x},${y}`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint) }
    const finish = (commit = false) => {
      if (!gesture) return
      const current = gesture
      if (current.dragging) {
        cancelAnimationFrame(frame)
        paint()
        suppressClick = true
        clearTimeout(timer)
        timer = setTimeout(() => { suppressClick = false }, 400)
        if (commit && current.target && current.medical) {
          const [lng, lat] = current.target.geometry.coordinates
          callbacks.current.onRecommend?.(current.incident, { ...current.target.properties, lng, lat, responderType: 'medical' })
          setMessage('Hospital/clinic selected · see facility card')
        } else if (commit && current.target && callbacks.current.canDispatch(current.station)) {
          callbacks.current.onDispatch(current.station, current.target)
          setMessage(`${callbacks.current.getPersonnel(current.station)} personnel requested · browser-only simulation`)
        } else setMessage('Dispatch cancelled')
      }
      gesture = null
      hud.current.dataset.active = 'false'
      lock.current.style.opacity = '0'
      trail.current.style.opacity = '0'
      canvas.style.cursor = ''
      if (current.panEnabled) map.dragPan.enable()
      if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId)
    }
    const down = (event) => {
      if (event.button !== 0 || !event.isPrimary || gesture) return
      const p = point(event)
      // MapLibre accepts a Point instance or [x, y], not a plain {x, y}.
      const hit = candidate => { const center = map.project(candidate.geometry.coordinates); return Math.hypot(center.x - p.x, center.y - p.y) <= 24 }
      // Prefer the incident when a station badge overlaps its icon.
      const incident = query([p.x, p.y], ['roadsafe-report-points']).find(hit)
      if (incident && callbacks.current.onRecommend) {
        gesture = { medical: true, incident, origin: incident.geometry.coordinates, start: p, point: p, pointerId: event.pointerId, panEnabled: map.dragPan.isEnabled(), dragging: false }
        map.dragPan.disable()
        canvas.setPointerCapture(event.pointerId)
        return
      }
      const feature = query([p.x, p.y], ['roadsafe-police-stations-layer']).find(hit)
      if (!feature) return
      if (feature.layer.id !== 'roadsafe-police-stations-layer') return
      const [lng, lat] = feature.geometry.coordinates
      const station = { ...feature.properties, lng, lat, responderType: 'police' }
      if (!callbacks.current.canDispatch(station)) { setMessage('This station already has a request. Manage it in the station card.'); return }
      gesture = { station, origin: [lng, lat], start: p, point: p, pointerId: event.pointerId, panEnabled: map.dragPan.isEnabled(), dragging: false }
      map.dragPan.disable()
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return
      gesture.point = point(event)
      if (!gesture.dragging && Math.hypot(gesture.point.x - gesture.start.x, gesture.point.y - gesture.start.y) < 5) return
      if (!gesture.dragging) setMessage(gesture.medical ? 'Drag incident to a hospital or clinic · Esc cancels' : 'Drag police station to an incident · Esc cancels')
      gesture.dragging = true
      hud.current.dataset.active = 'true'
      trail.current.style.opacity = '1'
      canvas.style.cursor = 'crosshair'
      event.preventDefault()
      schedule()
    }
    const up = (event) => {
      if (gesture?.pointerId !== event.pointerId) return
      gesture.point = point(event)
      finish(true)
    }
    const cancel = () => finish(false)
    const key = (event) => { if (event.key === 'Escape') cancel() }
    const click = (event) => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false } }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('click', click, true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key)
    canvas.addEventListener('lostpointercapture', cancel)
    map.on('move', schedule)
    return () => {
      cancel(); cancelAnimationFrame(frame); clearTimeout(timer)
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('click', click, true)
      canvas.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key)
      map.off('move', schedule)
    }
  }, [mapRef, ready])
  return <div className="dispatch-overlay">
    <svg className="dispatch-trail"><path ref={trail} /></svg>
    <div ref={lock} className="dispatch-lock"><i /><b /></div>
    <div ref={hud} className="dispatch-hud" data-active="false"><div className="dispatch-reticle">
      <i className="dispatch-orbit" /><i className="dispatch-orbit inner" /><i className="dispatch-pulse" /><b className="dispatch-cross" />
      <span>ACQUIRE INCIDENT</span><small />
    </div></div>
    {message && <p className="dispatch-message" role="status">{message}</p>}
  </div>
}
