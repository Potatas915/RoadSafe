import React, { useRef, useState } from 'react'
const h = React.createElement

export default function IncidentPhotoCarousel({ evidence, compact = false }) {
  const photos = evidence.filter(file => file.url && file.mimeType.startsWith('image/'))
  if (!photos.length) return h('p', { className: 'text-xs text-slate-400' }, 'No incident photos available.')
  if (compact || photos.length <= 2) return h('div', { className: 'incident-photo-pair', 'aria-label': 'Incident photos' },
    photos.slice(0, 2).map(photo => compact
      ? h('img', { key: photo.id, src: photo.url, alt: photo.fileName, className: 'incident-photo-static' })
      : h('a', { key: photo.id, href: photo.url, target: '_blank', rel: 'noreferrer', className: 'incident-photo-link' },
        h('img', { src: photo.url, alt: photo.fileName, className: 'incident-photo-static' }))),
  )
  return h(PhotoSlides, { key: photos.map(file => file.id).join('|'), photos })
}

export function photoIndex(position, count) {
  return ((position % count) + count) % count
}

export function swipeStep(dx, dy) {
  return Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0
}

function PhotoSlides({ photos }) {
  const [position, setPosition] = useState(1)
  const [drag, setDrag] = useState(0)
  const start = useRef(null)
  const move = step => setPosition(current => current + step)
  const cancel = () => { start.current = null; setDrag(0) }
  const finish = event => {
    event.stopPropagation()
    const gesture = start.current
    if (!gesture || event.pointerId !== gesture.id) return
    start.current = null
    move(swipeStep(event.clientX - gesture.x, event.clientY - gesture.y))
    setDrag(0)
  }
  const active = photos[photoIndex(position, photos.length)]
  return h('section', { 'aria-label': 'Incident photos', 'aria-roledescription': 'carousel', className: 'space-y-2' },
    h('div', {
      className: 'incident-photo-coverflow', tabIndex: 0,
      'aria-label': 'Swipe photos or use left and right arrow keys',
      onKeyDown: event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      },
      onMouseDown: event => { event.preventDefault(); event.stopPropagation() },
      onTouchStart: event => event.stopPropagation(),
      onTouchMove: event => event.stopPropagation(),
      onClick: event => event.stopPropagation(),
      onDragStart: event => event.preventDefault(),
      onPointerDown: event => {
        event.stopPropagation()
        if (start.current || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: event => {
        event.stopPropagation()
        const gesture = start.current
        if (!gesture || event.pointerId !== gesture.id) return
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
        if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(-110, Math.min(110, dx)))
      },
      onPointerUp: finish,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    }, [-2, -1, 0, 1, 2].map(offset => {
      const slot = position + offset
      const photo = photos[photoIndex(slot, photos.length)]
      return h('div', {
        key: slot, className: 'incident-photo-slide',
        'aria-hidden': offset !== 0,
        style: {
          transform: `translateX(calc(-50% + ${offset * 76}% + ${drag}px)) rotateY(${offset === 0 ? 0 : offset < 0 ? 32 : -32}deg) scale(${offset === 0 ? 1 : .86})`,
          zIndex: 10 - Math.abs(offset),
          visibility: Math.abs(offset) > 1 ? 'hidden' : 'visible',
          transition: drag ? 'none' : undefined,
        },
      }, h('img', { src: photo.url, alt: photo.fileName, draggable: false }))
    })),
    h('a', { href: active.url, target: '_blank', rel: 'noreferrer', className: 'block truncate text-[11px] text-orange-300 underline', title: active.fileName }, active.fileName),
  )
}
