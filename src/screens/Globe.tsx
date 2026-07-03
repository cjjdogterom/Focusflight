import { useMemo, useRef } from 'react'
import { useStore } from '../store'
import { airportByIata } from '../data/airports'
import GlobeView, { type GlobeHandle, type GlobeRoute } from '../components/GlobeView'
import { IconBack } from '../components/icons'
import type { LngLat } from '../lib/geo'

export default function Globe() {
  const setScreen = useStore((s) => s.setScreen)
  const flights = useStore((s) => s.flights)
  const totalMiles = useStore((s) => s.totalMiles)
  const globeRef = useRef<GlobeHandle>(null)

  // unique flown pairs (completed flights) for the globe arcs
  const { routes, pairs } = useMemo(() => {
    const seen = new Map<string, { from: LngLat; to: LngLat; label: string; count: number; mid: LngLat }>()
    for (const f of flights) {
      if (!f.completed) continue
      const a = airportByIata(f.fromIata)
      const b = airportByIata(f.toIata)
      if (!a || !b) continue
      const key = [f.fromIata, f.toIata].sort().join('-')
      const cur = seen.get(key)
      if (cur) cur.count++
      else
        seen.set(key, {
          from: [a.lon, a.lat],
          to: [b.lon, b.lat],
          label: `${f.fromIata} – ${f.toIata}`,
          count: 1,
          mid: [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2],
        })
    }
    const list = [...seen.values()]
    return {
      routes: list.map((r): GlobeRoute => ({ from: r.from, to: r.to })),
      pairs: list,
    }
  }, [flights])

  const around = totalMiles / 40075

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#04070d]">
      <GlobeView ref={globeRef} routes={routes} />

      {/* header */}
      <div className="absolute top-0 left-0 right-0 p-5 flex items-center gap-3 pointer-events-none">
        <button onClick={() => setScreen('home')} className="ios-btn pointer-events-auto" aria-label="Terug">
          <IconBack size={19} />
        </button>
        <div className="[text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
          <h1 className="text-[22px] font-bold tracking-tight leading-tight">Jouw wereld</h1>
          <p className="text-[12px] text-white/55">
            {pairs.length} routes · {totalMiles.toLocaleString('nl-NL')} km ·{' '}
            {around >= 0.1 ? `${around.toFixed(1).replace('.', ',')}× rond de aarde` : 'net begonnen'}
          </p>
        </div>
      </div>

      {/* flown routes menu */}
      <div className="absolute bottom-0 inset-x-0 p-4">
        <div className="glass rounded-2xl max-w-lg mx-auto overflow-hidden">
          <p className="avlabel uppercase tracking-[0.12em] px-4 pt-3 pb-1.5">Gevlogen routes</p>
          {pairs.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-white/45">
              Nog geen voltooide vluchten — je routes verschijnen hier op de globe.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto no-scrollbar divide-y divide-white/[0.06]">
              {pairs.map((p) => (
                <button
                  key={p.label}
                  onClick={() => globeRef.current?.focus(p.mid[0], p.mid[1])}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.06] active:bg-white/[0.1] transition"
                >
                  <span className="font-semibold text-[14px] tabular-nums">{p.label}</span>
                  <span className="text-[12px] text-white/45">
                    {p.count}× gevlogen
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
