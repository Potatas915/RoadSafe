import { useState } from 'react'
import { setThemePreference } from '../hooks/useTheme.js'

// Shared pieces for the signed-out landing page (staff sign-in and the demo entry).
// The logo and theme icon switch with CSS; the road, backdrop and module spotlight are CSS/SVG animations.
export const authInput = 'block w-full h-12 rounded-xl border border-edge/15 bg-edge/[.06] px-3.5 text-sm text-strong placeholder:text-slate-500 outline-none transition focus:border-orange-400/80 focus:bg-edge/[.1] focus:ring-4 focus:ring-orange-500/15'

const MODULES = [
  ['fa-earth-americas', 'GIS Tactical Map', 'Live incident map and response coordination'],
  ['fa-chart-pie', 'Dashboard Overview', 'What needs attention first, at a glance'],
  ['fa-triangle-exclamation', 'Report Management', 'Review, verify and assign every report'],
  ['fa-user-shield', 'Officer Dispatch', 'See who is free and who is busy'],
  ['fa-chart-line', 'Analytics & Exports', 'PDF and CSV reports for any timeframe'],
]

const flipTheme = () => setThemePreference(document.documentElement.classList.contains('dark') ? 'light' : 'dark')

function Logo({ className }) {
  return <>
    <img src="/brand/roadsafe-logo-dark.png" alt="" width="64" height="64" className={`hidden dark:block ${className}`} />
    <img src="/brand/roadsafe-logo-light.png" alt="" width="64" height="64" className={`dark:hidden ${className}`} />
  </>
}

// ---- Backdrop: a dusk highway scene. It is blurred with CSS, so it reads as depth and light rather than detail. ----
// Everything is computed from a fixed seed, so the skyline never shifts between renders.
const HORIZON = 540
const SCENE = (() => {
  let seed = 7
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const buildings = [], windows = []
  for (let x = -20; x < 1640;) {
    const w = 28 + rand() * 62
    const h = 50 + rand() * 170 * (1.25 - Math.abs(x - 800) / 1100)
    buildings.push({ x, w, h })
    for (let i = Math.floor(rand() * 5); i > 0; i--) windows.push({ x: x + 6 + rand() * (w - 12), y: HORIZON - h + 8 + rand() * (h - 16), warm: rand() > 0.4 })
    x += w + rand() * 10
  }
  const dashes = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 11) ** 1.7, b = a + 0.03 + 0.07 * a
    const wa = 1.5 + 9 * a, wb = 1.5 + 9 * b
    const ya = HORIZON + 360 * a, yb = HORIZON + 360 * Math.min(b, 1)
    return `${800 - wa},${ya} ${800 + wa},${ya} ${800 + wb},${yb} ${800 - wb},${yb}`
  })
  const lamps = [0.08, 0.2, 0.36, 0.58, 0.85].flatMap((t) => [-1, 1].map((side) => ({ x: 800 + side * (24 + 680 * t), y: HORIZON + 360 * t - 4, r: 5 + t * 34 })))
  const cars = [
    { dx: -330, dur: 7.5, delay: -1, color: '#fff7e6' }, { dx: -400, dur: 9, delay: -5, color: '#fff7e6' }, { dx: -290, dur: 8, delay: -3.5, color: '#fff7e6' },
    { dx: 330, dur: 8.5, delay: -2, color: '#ff4d4d' }, { dx: 410, dur: 7, delay: -6, color: '#ff4d4d' }, { dx: 290, dur: 9.5, delay: -4, color: '#ff4d4d' },
  ]
  return { buildings, windows, dashes, lamps, cars }
})()

function Backdrop() {
  return (
    <div aria-hidden="true" className="lp-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="lp-scene absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--lp-sky-top)" /><stop offset="1" stopColor="var(--lp-sky-bot)" /></linearGradient>
          <radialGradient id="lp-horizon" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ff8a3d" stopOpacity=".75" /><stop offset="1" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
          <radialGradient id="lp-bokeh" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffb066" stopOpacity=".95" /><stop offset="1" stopColor="#ff8a3d" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#lp-sky)" />
        <ellipse cx="800" cy={HORIZON} rx="900" ry="260" fill="url(#lp-horizon)" />
        <g fill="var(--lp-city)">{SCENE.buildings.map((b, i) => <rect key={i} x={b.x} y={HORIZON - b.h} width={b.w} height={b.h + 2} />)}</g>
        <g>{SCENE.windows.map((w, i) => <rect key={i} x={w.x} y={w.y} width="4" height="5" fill={w.warm ? '#ffc58a' : '#dbe8ff'} opacity=".7" />)}</g>
        <rect y={HORIZON} width="1600" height={900 - HORIZON} fill="var(--lp-ground)" />
        <polygon points={`780,${HORIZON} 820,${HORIZON} 1500,900 100,900`} fill="var(--lp-road)" />
        <g stroke="var(--lp-edge-line)" strokeWidth="3"><line x1="782" y1={HORIZON} x2="104" y2="900" /><line x1="818" y1={HORIZON} x2="1496" y2="900" /></g>
        <g fill="var(--lp-dash)">{SCENE.dashes.map((points, i) => <polygon key={i} points={points} />)}</g>
        <g>{SCENE.lamps.map((lamp, i) => <circle key={i} cx={lamp.x} cy={lamp.y} r={lamp.r} fill="url(#lp-bokeh)" />)}</g>
        <g>{SCENE.cars.map((car, i) => (
          <g key={i} className="lp-car" style={{ '--dx': `${car.dx}px`, '--dur': `${car.dur}s`, '--delay': `${car.delay}s` }} fill={car.color}>
            <circle cx="792" cy={HORIZON + 4} r="2.4" /><circle cx="808" cy={HORIZON + 4} r="2.4" />
          </g>
        ))}</g>
      </svg>
    </div>
  )
}

// ---- A winding road with a moving vehicle and response markers. It crosses behind the sign-in card, so the glass has something to blur. ----
const ROAD = 'M -80 700 C 180 720, 330 560, 560 540 S 860 520, 1000 380 S 1180 160, 1300 120'

function Pin({ x, y, color, delay = 0 }) {
  return (
    <g>
      <circle className="lp-ping" cx={x} cy={y} r="11" fill="none" stroke={color} strokeWidth="2" style={{ animationDelay: `${delay}s` }} />
      <circle cx={x} cy={y} r="6.5" fill={color} stroke="#fff" strokeWidth="2" />
    </g>
  )
}

function RoadDecor() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full max-lg:opacity-50">
      <path d={ROAD} fill="none" stroke="var(--lp-road-edge)" strokeWidth="92" />
      <path d={ROAD} fill="none" stroke="var(--lp-asphalt)" strokeWidth="82" />
      <path d={ROAD} fill="none" stroke="#ff9a4d" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="24 22" className="lp-dash" />
      <Pin x={560} y={540} color="#f97316" />
      <Pin x={251} y={635} color="#3b82f6" delay={1.1} />
      <Pin x={1000} y={380} color="#ef4444" delay={2.2} />
      <g className="lp-drive" style={{ offsetPath: `path('${ROAD}')`, '--dur': '16s' }}><circle r="14" fill="#fff4de" opacity=".28" /><circle r="5" fill="#fff4de" /></g>
      <g className="lp-drive" style={{ offsetPath: `path('${ROAD}')`, '--dur': '16s', animationDelay: '-8s' }}><circle r="14" fill="#ff4d4d" opacity=".25" /><circle r="5" fill="#ff5a5a" /></g>
    </svg>
  )
}

export default function AuthLanding({ children, status = 'Web prototype', title = 'Staff sign in' }) {
  return (
    <main className="roadsafe-stage lp-page relative isolate flex min-h-screen overflow-hidden bg-darkBg p-4 text-slate-200 sm:p-6 lg:p-10">
      <Backdrop />
      <div className="lp-glass relative mx-auto grid w-full max-w-[1520px] overflow-hidden rounded-[28px] sm:rounded-[36px] min-h-[calc(100vh-2rem)] sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
        <RoadDecor />

        <section className="relative flex flex-col justify-between gap-14 p-7 sm:p-12 lg:p-16">
          <header className="relative flex flex-wrap items-center gap-4">
            <Logo className="h-12 w-12 rounded-2xl ring-1 ring-edge/15 shadow-lg shadow-orange-500/20" />
            <ul className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-300">
              <li className="lp-chip flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-strong">Command center <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">{MODULES.length}</span></li>
              <li className="rounded-full px-3 py-1.5">Public mobile app</li>
              <li className="hidden rounded-full px-3 py-1.5 md:block">Central Luzon / Bulacan</li>
            </ul>
          </header>

          <div className="relative max-w-xl">
            <p className="text-sm font-medium text-orange-600 dark:text-orange-300">Bulacan command center</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-tight text-strong sm:text-6xl">Road safety,<br /><span className="text-orange-500">faster response.</span></h1>
            <p className="mt-8 max-w-md text-[15px] leading-[1.75] text-slate-300">Technological systems for <span className="text-strong underline decoration-orange-400/70 underline-offset-4">managing accident reports</span> and <span className="text-strong underline decoration-orange-400/70 underline-offset-4">coordinating officer response</span> across Central Luzon / Bulacan.</p>
          </div>

          <div className="lp-chip relative hidden max-w-sm rounded-2xl p-4 sm:block" aria-label="Modules in this system">
            <div className="relative h-[46px] w-full">
              {MODULES.map(([icon, name, text], i) => (
                <div key={name} className="lp-spot absolute inset-0 flex items-center gap-3.5" style={{ '--i': i }}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-edge/10 bg-edge/[.08] text-orange-500"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
                  <span><span className="block text-sm font-semibold text-strong">{name}</span><span className="block text-xs text-slate-400">{text}</span></span>
                </div>
              ))}
            </div>
            <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-edge/10"><div className="lp-bar h-full w-full rounded-full bg-orange-500" /></div>
          </div>
        </section>

        <section className="relative flex items-center justify-center p-4 pb-7 sm:p-8 lg:p-12">
          <div className="lp-card relative w-full max-w-[470px] rounded-[28px] p-7 sm:p-10">
            <div className="mb-9 flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-strong">{title}</h2>
              <div className="flex items-center gap-2.5">
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{status}</span>
                <button type="button" onClick={flipTheme} aria-label="Switch between light and dark theme" title="Switch theme" className="grid h-9 w-9 place-items-center rounded-full border border-edge/15 bg-edge/[.06] text-slate-400 transition hover:bg-edge/10 hover:text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"><i className="fa-solid fa-moon dark:hidden" aria-hidden="true" /><i className="fa-solid fa-sun hidden dark:inline" aria-hidden="true" /></button>
              </div>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}

// Labeled text box with a leading icon. Password boxes get a show/hide toggle.
export function Field({ label, icon, required = false, type = 'text', ...props }) {
  const [shown, setShown] = useState(false)
  const isPassword = type === 'password'
  return (
    <label className="block text-xs font-medium text-slate-300">{label}{required && <span className="text-red-500"> *</span>}
      <span className="relative mt-2 block">
        <i className={`fa-solid ${icon} pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-slate-500`} aria-hidden="true" />
        <input {...props} required={required} type={isPassword && shown ? 'text' : type} className={`${authInput} pl-11 ${isPassword ? 'pr-12' : ''}`} />
        {isPassword && <button type="button" onClick={() => setShown((value) => !value)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"><i className={`fa-solid ${shown ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" /></button>}
      </span>
    </label>
  )
}

export function PanelNote({ title = 'Need access?', children }) {
  return <div className="mt-8 space-y-1.5 border-t border-edge/10 pt-6"><p className="text-xs font-medium text-slate-300">{title}</p><p className="text-xs leading-relaxed text-slate-400">{children}</p></div>
}

export function SubmitButton({ children, busy = false, ...props }) {
  return (
    <button {...props} disabled={busy || props.disabled} className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-b from-orange-500 to-orange-700 text-sm font-semibold text-white shadow-lg shadow-orange-700/30 ring-1 ring-inset ring-white/25 transition hover:from-orange-400 hover:to-orange-600 hover:shadow-orange-600/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:opacity-50">
      {children}<i className="fa-solid fa-arrow-right text-xs transition group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  )
}
