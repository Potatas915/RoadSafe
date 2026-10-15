
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'
import { summary } from '../data/mock.js'
import { reportPoints as mockReportPoints, TYPES } from '../data/reportPoints.js'

// Vite environment variables

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY
const API_KEY = import.meta.env.VITE_API_KEY
const REPORTS_API_URL = import.meta.env.VITE_REPORTS_API_URL

// Load MapLibre's worker from the public directory.
setWorkerUrl('/maplibre-gl-csp-worker.js')


const MAP_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        `https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    {
      id: 'basemap',
      type: 'raster',
      source: 'basemap',
      paint: {
        'raster-brightness-min': 0.12,
        'raster-brightness-max': 1,
        'raster-contrast': 0.35,
      },
    },
  ],
}


const CENTER = [120.88, 14.85]
const EMPTY = { type: 'FeatureCollection', features: [] }

// Fetch reports from an API when configured.
// Expected response: a GeoJSON FeatureCollection.
// Without an API URL, use the existing mock data.
async function fetchReports(signal) {
  if (!REPORTS_API_URL) {
    return mockReportPoints
  }

  const headers = {
    Accept: 'application/geo+json, application/json',
  }

  // Only use this header if your API expects a Bearer token.
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`
  }

  const response = await fetch(REPORTS_API_URL, {
    method: 'GET',
    headers,
    signal,
  })

  if (!response.ok) {
    throw new Error(`Reports API failed: ${response.status}`)
  }

  const data = await response.json()

  if (
    data?.type !== 'FeatureCollection' ||
    !Array.isArray(data.features)
  ) {
    throw new Error(
      'Invalid API response: expected a GeoJSON FeatureCollection.'
    )
  }

  return data
}

export default function MapView({ onOpenReport, onNavigate }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const openRef = useRef(onOpenReport)

  openRef.current = onOpenReport

  const [ready, setReady] = useState(false)
  const [reportPoints, setReportPoints] = useState(mockReportPoints)
  const [apiError, setApiError] = useState('')
  const [selected, setSelected] = useState([
    'intersection',
    'congestion',
    'distraction',
  ])
  const [includePending, setIncludePending] = useState(false)

  // Load API data when an endpoint is configured.
  useEffect(() => {
    if (!REPORTS_API_URL) return

    const controller = new AbortController()
    let active = true

    async function loadReports() {
      try {
        const data = await fetchReports(controller.signal)

        if (!active) return

        setReportPoints(data)
        setApiError('')
      } catch (error) {
        if (!active || error.name === 'AbortError') return

        console.error('Unable to load reports:', error)
        setApiError(
          'Could not load live reports. Displaying available fallback data.'
        )
      }
    }

    loadReports()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  // Filter the reports displayed by the map and metrics.
  const visible = useMemo(
    () =>
      reportPoints.features.filter((feature) => {
        const properties = feature.properties ?? {}

        return (
          selected.includes(properties.type) &&
          (includePending || properties.status === 'Verified')
        )
      }),
    [reportPoints, selected, includePending]
  )

  const metrics = useMemo(
    () =>
      TYPES
        .filter((type) => selected.includes(type.key))
        .map((type) => {
          const count = visible.filter(
            (feature) => feature.properties?.type === type.key
          ).length

          return {
            label: type.label,
            pct: visible.length
              ? Math.round((count / visible.length) * 100)
              : 0,
          }
        }),
    [visible, selected]
  )

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER,
      zoom: 10,
      attributionControl: { compact: true },
    })

    mapRef.current = map

    map.addControl(
      new NavigationControl({ showCompass: false }),
      'bottom-right'
    )

    map.on('error', (event) => {
      console.error('MapLibre error:', event.error || event)
    })

    map.once('style.load', () => {
      if (mapRef.current !== map) return

      // Source for heatmap and individual report points.
      map.addSource('reports', {
        type: 'geojson',
        data: EMPTY,
      })

      // Source for clustered report points.
      map.addSource('report-clusters', {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 12,
      })

      // Heatmap.
      map.addLayer({
        id: 'report-heat',
        type: 'heatmap',
        source: 'reports',
        maxzoom: 15,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'severity'],
            1, 0.4,
            3, 1,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 0.8,
            14, 2.2,
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 18,
            12, 34,
            15, 60,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(249,115,22,0)',
            0.2, 'rgba(127,29,29,0.45)',
            0.45, 'rgba(220,38,38,0.65)',
            0.7, 'rgba(249,115,22,0.85)',
            1, 'rgba(251,191,36,0.95)',
          ],
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 0.9,
            15, 0,
          ],
        },
      })

      // Cluster hotspot rings.
      map.addLayer({
        id: 'cluster-rings',
        type: 'circle',
        source: 'report-clusters',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(239,68,68,0.12)',
          'circle-stroke-color': '#ef4444',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.5,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            26,
            5, 38,
            10, 52,
          ],
        },
      })

      // Glow behind report points.
      map.addLayer({
        id: 'report-dots-glow',
        type: 'circle',
        source: 'reports',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 8,
            15, 20,
          ],
          'circle-color': '#f97316',
          'circle-blur': 1,
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0,
            12, 0.3,
          ],
        },
      })

      // Individual clickable report points.
      map.addLayer({
        id: 'report-dots',
        type: 'circle',
        source: 'reports',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 3,
            15, 8,
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            3, '#ef4444',
            2, '#f97316',
            '#fbbf24',
          ],
          'circle-stroke-color': '#fff7ed',
          'circle-stroke-width': 1,
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0.5,
            12, 1,
          ],
        },
      })

      // Clicking a point opens its report.
      map.on('click', 'report-dots', (event) => {
        const id = event.features?.[0]?.properties?.id

        if (id != null) {
          openRef.current?.(id)
        }
      })

      // Clicking a cluster zooms into it.
      map.on('click', 'cluster-rings', async (event) => {
        const feature = event.features?.[0]

        if (!feature) return

        const coordinates = feature.geometry.coordinates
        const clusterId = feature.properties.cluster_id

        try {
          const source = map.getSource('report-clusters')

          const zoom = await source.getClusterExpansionZoom(clusterId)

          map.easeTo({
            center: coordinates,
            zoom,
          })
        } catch (error) {
          console.warn('Unable to expand cluster:', error)

          map.easeTo({
            center: coordinates,
            zoom: map.getZoom() + 2,
          })
        }
      })

      // Pointer cursor for clickable layers.
      ;['report-dots', 'cluster-rings'].forEach((layer) => {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = ''
        })
      })

      console.log('MapLibre ready: layers added')

      map.resize()
      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  // Update both map sources whenever the filtered data changes.
  useEffect(() => {
    const map = mapRef.current

    if (!ready || !map) return

    const data = {
      type: 'FeatureCollection',
      features: visible,
    }

    map.getSource('reports')?.setData(data)
    map.getSource('report-clusters')?.setData(data)
  }, [ready, visible])

  const toggleType = (key) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key]
    )
  }

  return (
    <main className="flex-1 relative bg-slate-950 overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0">
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Summary cards */}
      <div className="absolute top-6 left-6 right-6 grid grid-cols-4 gap-4 z-10 pointer-events-none">
        {summary.map((item) => (
          <div
            key={item.label}
            className="pointer-events-auto bg-darkCard/90 backdrop-blur-md border border-darkBorder p-4 rounded-2xl shadow-2xl flex items-center justify-between"
          >
            <div>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                {item.label}
              </p>
              <h3 className={`text-2xl font-bold mt-0.5 ${item.valueClass}`}>
                {item.value}
              </h3>
            </div>

            <div className={`p-3 rounded-xl border ${item.iconClass}`}>
              <i className={`fa-solid ${item.icon} text-base`} />
            </div>
          </div>
        ))}
      </div>

      {/* Layer filters */}
      <div className="absolute top-28 left-6 w-72 bg-darkCard/90 backdrop-blur-md border border-darkBorder rounded-2xl p-5 shadow-2xl z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xs text-white uppercase tracking-wider">
            Road Analysis
          </h3>

          <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded font-medium">
            Bulacan Sector
          </span>
        </div>

        <div className="space-y-3 text-xs">
          {TYPES.map((type) => (
            <label
              key={type.key}
              className="flex items-center gap-3 text-slate-300 cursor-pointer hover:text-white transition"
            >
              <input
                type="checkbox"
                checked={selected.includes(type.key)}
                onChange={() => toggleType(type.key)}
                className="accent-orange-500 rounded w-4 h-4"
              />

              {type.label}
            </label>
          ))}
        </div>

        <label className="mt-4 pt-3 border-t border-darkBorder flex items-center gap-3 text-xs text-slate-300 cursor-pointer hover:text-white transition">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(event) => setIncludePending(event.target.checked)}
            className="accent-orange-500 rounded w-4 h-4"
          />

          Include unverified (pending) reports
        </label>

        <div className="mt-4 pt-3 border-t border-darkBorder text-[11px] text-slate-400 flex justify-between items-center">
          <span>Events on map:</span>
          <span className="font-bold text-white font-mono">
            {visible.length}
          </span>
        </div>

        {apiError && (
          <p role="status" className="mt-3 text-xs text-amber-400">
            {apiError}
          </p>
        )}
      </div>

      {/* Incident metrics */}
      <div className="absolute top-28 right-6 w-72 bg-darkCard/90 backdrop-blur-md border border-darkBorder rounded-2xl p-5 shadow-2xl z-10 space-y-4">
        <h4 className="font-bold text-xs text-white uppercase tracking-wider">
          Incident Metrics
        </h4>

        {metrics.length === 0 && (
          <p className="text-xs text-slate-400">
            Select at least one layer to see metrics.
          </p>
        )}

        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="flex justify-between text-[11px] mb-1 font-medium">
              <span className="text-slate-300">{metric.label}</span>
              <span className="text-orange-400 font-bold">
                {metric.pct}%
              </span>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-600 to-amber-500 h-full rounded-full"
                style={{ width: `${metric.pct}%` }}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => onNavigate?.('analytics-view')}
          className="w-full py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-500/20 transition"
        >
          Export Full PDF / CSV Report
        </button>
      </div>
    </main>
  )
}
