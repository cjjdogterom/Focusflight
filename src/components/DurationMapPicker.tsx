import { useEffect, useMemo, useRef, useState } from 'react'
import { AIRPORTS } from '../data/airports'
import { STANDARD } from '../data/aircraft'
import { flightMinutes, formatMinutes } from '../lib/flight'
import { distanceKm } from '../lib/geo'
import type { Airport } from '../types'
import { IconX, IconPlane } from './icons'

// Full-screen "pick by focus duration" — a satellite map centred on the
// departure airport with a soft ring at the reachable distance, candidate
// airports as tappable badges, and a ruler scrubber at the bottom, like the
// reference app.

const MIN_MIN = 25
const MAX_MIN = 720
const STEP = 5
const TICK_PX = 9

/** inverse of flightMinutes: how far you get in `min` minutes */
function distForMinutes(min: number): number {
  return Math.max(30, ((min - 16) * STANDARD.cruiseKmh) / (60 * 1.07))
}

const mercY = (lat: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

export default function DurationMapPicker({
  origin,
  mapStyle,
  initialMin,
  onBook,
  onClose,
}: {
  origin: Airport
  mapStyle: 'dark' | 'sat'
  initialMin: number
  onBook: (a: Airport) => void
  onClose: () => void
}) {
  const [targetMin, setTargetMin] = useState(initialMin)
  const [selected, setSelected] = useState<Airport | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const suggestions = useMemo(() => {
    const rows: { a: Airport & { big?: boolean }; min: number; diff: number }[] = []
    for (const a of AIRPORTS as (Airport & { big?: boolean })[]) {
      if (a.iata === origin.iata) continue
      const d = distanceKm([origin.lon, origin.lat], [a.lon, a.lat])
      const min = flightMinutes(d, STANDARD)
      const diff = Math.abs(min - targetMin)
      if (diff <= 6) rows.push({ a, min, diff })
    }
    rows.sort((x, y) => Number(!!y.a.big) - Number(!!x.a.big) || x.diff - y.diff)
    return rows.slice(0, 6)
  }, [origin, targetMin])

  // keep the selection in sync with what is on offer
  useEffect(() => {
    if (!selected || !suggestions.some((s) => s.a.iata === selected.iata)) {
      setSelected(suggestions[0]?.a ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => setSize({ w: wrap.clientWidth, h: wrap.clientHeight }))
    ro.observe(wrap)
    setSize({ w: wrap.clientWidth, h: wrap.clientHeight })
    return () => ro.disconnect()
  }, [])

  // map maths: fit the reachable ring inside the viewport
  const ringKm = distForMinutes(targetMin)
  const view = useMemo(() => {
    const { w, h } = size
    if (!w || !h) return null
    const fitPx = Math.min(w, h * 0.62) * 0.5
    const pxPerKm = fitPx / ringKm
    const pxPerDegLat = pxPerKm * 110.54
    const worldPx = pxPerDegLat * 180 * 1.2 // rough mercator world height
    const z = Math.max(2, Math.min(11, Math.round(Math.log2(worldPx / 256) + 0.4)))
    const scale = 256 * 2 ** z
    const cwx = ((origin.lon + 180) / 360) * scale
    const cwy = mercY(origin.lat) * scale
    const project = (lon: number, lat: number): [number, number] => [
      ((lon + 180) / 360) * scale - cwx + w / 2,
      mercY(lat) * scale - cwy + h * 0.4,
    ]
    return { z, scale, project, w, h }
  }, [size, ringKm, origin])

  // draw tiles + ring
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !view) return
    const { w, h } = size
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0b0d10'
    ctx.fillRect(0, 0, w, h)

    const { z, scale, project } = view
    const n = 2 ** z
    const cwx = ((origin.lon + 180) / 360) * scale
    const cwy = mercY(origin.lat) * scale
    const x0 = Math.floor((cwx - w / 2) / 256)
    const x1 = Math.floor((cwx + w / 2) / 256)
    const y0 = Math.max(0, Math.floor((cwy - h * 0.4) / 256))
    const y1 = Math.min(n - 1, Math.floor((cwy + h * 0.6) / 256))
    let cancelled = false
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const wx = ((tx % n) + n) % n
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          if (cancelled) return
          ctx.drawImage(img, tx * 256 - cwx + w / 2, ty * 256 - cwy + h * 0.4, 256.6, 256.6)
        }
        img.src =
          mapStyle === 'sat'
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${wx}`
            : `https://${'abcd'[(wx + ty) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${wx}/${ty}.png`
      }
    }
    return () => {
      cancelled = true
    }
  }, [view, mapStyle, origin, ringKm, size])

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0d10] animate-fade-in">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {/* soft reachable-distance ring + origin dot */}
        {view &&
          (() => {
            const [cx, cy] = view.project(origin.lon, origin.lat)
            const rPx = (ringKm / 110.54) * (view.scale / 360)
            return (
              <>
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: cx - rPx,
                    top: cy - rPx,
                    width: rPx * 2,
                    height: rPx * 2,
                    background:
                      'radial-gradient(circle, rgba(255,255,255,0.07) 55%, rgba(255,255,255,0.045) 96%, rgba(255,255,255,0) 100%)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
                  }}
                />
                <div
                  className="absolute w-3.5 h-3.5 rounded-full bg-white border-[3px] border-black/80 pointer-events-none"
                  style={{ left: cx - 7, top: cy - 7 }}
                />
              </>
            )
          })()}
        {/* airport badges on the map */}
        {view &&
          suggestions.map(({ a }) => {
            const [x, y] = view.project(a.lon, a.lat)
            if (x < 16 || x > size.w - 16 || y < 16 || y > size.h * 0.72) return null
            const active = selected?.iata === a.iata
            return (
              <button
                key={a.iata}
                onClick={() => setSelected(a)}
                style={{ left: x, top: y }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md font-bold text-[12px] px-1.5 py-0.5 shadow-lg transition ${
                  active ? 'bg-white text-black scale-110' : 'bg-[#ffc800] text-[#0b0d10]'
                }`}
              >
                <IconPlane size={11} />
                {a.iata}
              </button>
            )
          })}
      </div>

      {/* close */}
      <button
        onClick={onClose}
        aria-label="Sluiten"
        className="absolute top-5 right-5 ios-btn z-10"
      >
        <IconX size={17} />
      </button>

      {/* bottom sheet: chips + ruler + CTA */}
      <div className="absolute inset-x-0 bottom-0 pb-6 pt-3 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
        <div className="max-w-lg mx-auto px-5 flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {suggestions.map(({ a, min }) => {
              const active = selected?.iata === a.iata
              return (
                <button
                  key={a.iata}
                  onClick={() => setSelected(a)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-left transition active:scale-[0.97] ${
                    active ? 'bg-white/95 text-black' : 'bg-black/55 border border-white/12'
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-md font-bold text-[11px] px-1.5 py-0.5 ${
                      active ? 'bg-black text-white' : 'bg-[#ffc800] text-[#0b0d10]'
                    }`}
                  >
                    <IconPlane size={10} />
                    {a.iata}
                  </span>
                  <span className="block text-[13px] font-semibold mt-1 max-w-[7.5rem] truncate">
                    {a.city}
                  </span>
                  <span className={`block text-[11px] ${active ? 'text-black/55' : 'text-white/50'}`}>
                    {formatMinutes(min)}
                  </span>
                </button>
              )
            })}
            {suggestions.length === 0 && (
              <p className="text-[12px] text-white/45 py-3">Schuif voor bestemmingen op deze duur.</p>
            )}
          </div>

          <RulerScrubber value={targetMin} onChange={setTargetMin} />

          <button
            className="btn-primary w-full text-[17px]"
            disabled={!selected}
            onClick={() => selected && onBook(selected)}
          >
            {selected ? `Boek mijn vlucht — ${selected.city}` : 'Kies een bestemming'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** horizontal ruler: drag the tick strip under a fixed marker */
function RulerScrubber({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const suppress = useRef(false)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    suppress.current = true
    el.scrollLeft = ((value - MIN_MIN) / STEP) * TICK_PX
    const id = window.setTimeout(() => (suppress.current = false), 80)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    if (suppress.current) return
    const el = scrollerRef.current
    if (!el) return
    const v = MIN_MIN + Math.round(el.scrollLeft / TICK_PX) * STEP
    onChange(Math.max(MIN_MIN, Math.min(MAX_MIN, v)))
  }

  const innerW = ((MAX_MIN - MIN_MIN) / STEP) * TICK_PX
  const labels: { min: number; left: number }[] = []
  for (let m = 30; m <= MAX_MIN; m += 30) {
    labels.push({ min: m, left: ((m - MIN_MIN) / STEP) * TICK_PX })
  }

  return (
    <div className="relative select-none">
      {/* fixed marker */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 z-10 flex flex-col items-center pointer-events-none">
        <div className="w-0 h-0 border-x-[6px] border-x-transparent border-t-[7px] border-t-white" />
      </div>
      <p className="text-center text-[22px] font-bold tabular-nums tracking-tight mb-1 [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
        {formatMinutes(value)}
      </p>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="overflow-x-scroll no-scrollbar cursor-grab active:cursor-grabbing"
      >
        <div
          className="relative h-9"
          style={{
            width: innerW,
            marginLeft: '50%',
            marginRight: '50%',
            paddingRight: 1,
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 9px)',
            backgroundSize: `${TICK_PX * 6}px 14px, ${TICK_PX}px 9px`,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: '0 0',
          }}
        >
          <div
            className="absolute inset-y-0 left-0 right-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.85) 0 1.5px, transparent 1.5px ' +
                TICK_PX * 6 +
                'px)',
              backgroundSize: `${TICK_PX * 6}px 15px`,
              backgroundRepeat: 'repeat-x',
            }}
          />
          {labels.map((l) => (
            <span
              key={l.min}
              style={{ left: l.left }}
              className="absolute top-[18px] -translate-x-1/2 text-[10px] tabular-nums text-white/60"
            >
              {l.min < 60 ? `${l.min}m` : `${Math.floor(l.min / 60)}u ${l.min % 60 ? `${l.min % 60}m` : '0m'}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
