import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { AIRPORTS, airportByIata, searchAirports } from '../data/airports'
import { STANDARD } from '../data/aircraft'
import { IconPlane, IconBack, IconCheck } from '../components/icons'
import { distanceKm } from '../lib/geo'
import { prefetchRoute } from '../lib/routeFetch'
import { INTENTS, flightMinutes, formatMinutes } from '../lib/flight'
import type { Airport } from '../types'

export default function Booking() {
  // vertrek: expliciete keuze > doorreis-positie > thuisbasis
  const home = useStore((s) =>
    airportByIata(
      (s.booking.originIata ??
        (s.transitMode ? s.flights.find((f) => f.completed)?.toIata ?? s.homeIata : s.homeIata)) ??
        '',
    ),
  )
  const homeBase = useStore((s) => s.homeIata)
  const transitMode = useStore((s) => s.transitMode)
  const mapStyle = useStore((s) => s.mapStyle)
  const startBoarding = useStore((s) => s.startBoarding)
  const booking = useStore((s) => s.booking)
  const update = useStore((s) => s.updateBooking)
  const setScreen = useStore((s) => s.setScreen)

  const [pickingDest, setPickingDest] = useState(false)
  const [pickingOrigin, setPickingOrigin] = useState(false)
  const [targetMin, setTargetMin] = useState(45)

  const flights = useStore((s) => s.flights)
  // airports you have already visited (departed or landed, completed flights)
  const visited = useMemo(() => {
    const set = new Set<string>()
    for (const f of flights) {
      if (!f.completed) continue
      set.add(f.toIata)
      set.add(f.fromIata)
    }
    return set
  }, [flights])

  // airports whose real flight time matches the focus duration you want
  const suggestions = useMemo(() => {
    if (!home) return []
    const rows: { a: Airport & { big?: boolean }; min: number; diff: number }[] = []
    for (const a of AIRPORTS as (Airport & { big?: boolean })[]) {
      if (a.iata === home.iata) continue
      const d = distanceKm([home.lon, home.lat], [a.lon, a.lat])
      const min = flightMinutes(d, STANDARD)
      const diff = Math.abs(min - targetMin)
      if (diff <= 6) rows.push({ a, min, diff })
    }
    rows.sort((x, y) => Number(!!y.a.big) - Number(!!x.a.big) || x.diff - y.diff)
    return rows.slice(0, 4)
  }, [home, targetMin, visited])

  const dest = booking.destinationIata ? airportByIata(booking.destinationIata) : undefined
  const dist = home && dest ? distanceKm([home.lon, home.lat], [dest.lon, dest.lat]) : 0
  const durationMin = dist ? flightMinutes(dist, STANDARD) : 0

  if (pickingDest && home) {
    return (
      <DestinationPicker
        home={home}
        title="Waarheen?"
        visitedSet={visited}
        onBack={() => setPickingDest(false)}
        onPick={(a) => {
          update({ destinationIata: a.iata })
          prefetchRoute(home, a) // warm the real-route cache
          setPickingDest(false)
        }}
      />
    )
  }

  if (pickingOrigin && home) {
    return (
      <DestinationPicker
        home={home}
        title="Vertrek vanaf?"
        visitedSet={visited}
        onBack={() => setPickingOrigin(false)}
        onPick={(a) => {
          update({ originIata: a.iata === homeBase ? null : a.iata })
          setPickingOrigin(false)
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-7 flex flex-col gap-6 animate-fade-in stagger">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('home')} className="ios-btn" aria-label="Terug">
            <IconBack size={19} />
          </button>
          <h1 className="text-[22px] font-bold tracking-tight">Nieuwe vlucht</h1>
        </div>

        {/* route: vertrek én bestemming zijn klikbaar */}
        {transitMode && home && home.iata !== homeBase && !booking.originIata && (
          <p className="text-[12px] text-white/50 -mb-3">
            Doorreis — je vertrekt vanaf je laatste bestemming.
          </p>
        )}
        <div className="card p-5 flex items-center justify-between">
          <button
            onClick={() => setPickingOrigin(true)}
            className="text-left active:scale-[0.97] transition-transform"
            aria-label="Vertrekpunt wijzigen"
          >
            <Endpoint code={home?.iata ?? '—'} city={home?.city ?? ''} />
            <span className="block text-[10px] text-white/35 mt-1">wijzig vertrek</span>
          </button>
          <div className="flex-1 flex flex-col items-center px-3 text-white/30">
            <span className="text-[11px] font-medium tabular-nums text-white/40">
              {dist ? `${Math.round(dist).toLocaleString('nl-NL')} km` : ''}
            </span>
            <div className="w-full flex items-center">
              <span className="h-px flex-1 bg-white/15" />
              <IconPlane size={15} className="mx-1.5" />
              <span className="h-px flex-1 bg-white/15" />
            </div>
          </div>
          <button
            onClick={() => setPickingDest(true)}
            className="text-right active:scale-[0.97] transition-transform"
            aria-label="Bestemming kiezen"
          >
            {dest ? (
              <>
                <Endpoint code={dest.iata} city={dest.city} align="right" />
                <span className="block text-[10px] text-white/35 mt-1">wijzig bestemming</span>
              </>
            ) : (
              <span className="text-white font-semibold text-[15px]">Kies bestemming</span>
            )}
          </button>
        </div>

        {/* pick by focus duration: slider + matching destinations */}
        <section>
          <p className="avlabel uppercase tracking-[0.12em] mb-2.5">Kies op focusduur</p>
          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[26px] font-bold tracking-tight tabular-nums leading-none">
                {formatMinutes(targetMin)}
              </p>
              <p className="text-[12px] text-white/45">schuif en kies een bestemming</p>
            </div>
            <input
              type="range"
              min={25}
              max={720}
              step={5}
              value={targetMin}
              onChange={(e) => setTargetMin(Number(e.target.value))}
              className="w-full accent-white"
              aria-label="Focusduur"
            />
            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
              {suggestions.map(({ a, min }) => {
                const active = booking.destinationIata === a.iata
                const been = visited.has(a.iata)
                return (
                  <button
                    key={a.iata}
                    onClick={() => {
                      update({ destinationIata: a.iata })
                      if (home) prefetchRoute(home, a)
                    }}
                    className={`shrink-0 rounded-xl px-3 py-2 text-left transition active:scale-[0.97] ${
                      active ? 'bg-white text-black' : 'card'
                    }`}
                  >
                    <IataBadge iata={a.iata} visited={been} active={active} />
                    <span className="block text-[13px] font-semibold mt-1 max-w-[7rem] truncate">
                      {a.city}
                    </span>
                    <span className={`block text-[11px] ${active ? 'text-black/55' : 'text-white/45'}`}>
                      {formatMinutes(min)}
                    </span>
                  </button>
                )
              })}
              {suggestions.length === 0 && (
                <p className="text-[12px] text-white/40 py-2">
                  Geen bestemming op precies deze duur — schuif iets verder.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* aircraft photo preview — no type shown, just the plane */}
        <div className="card px-6 pt-5 pb-5 grid place-items-center overflow-hidden">
          <img
            src="/plane-klm-top.png"
            alt=""
            className="w-24 drop-shadow-[0_12px_16px_rgba(0,0,0,0.5)]"
            style={{ transform: 'rotate(18deg)' }}
          />
          {dest ? (
            <div className="text-center mt-6">
              <p className="text-[13px] text-white/50">Focussessie = vluchtduur</p>
              <p className="text-[34px] font-bold tracking-tight tabular-nums leading-tight">
                {formatMinutes(durationMin)}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-white/45 mt-6 text-center">
              Kies een bestemming — de echte vluchtduur wordt je focussessie.
            </p>
          )}
        </div>

        {/* intent */}
        <section>
          <p className="avlabel uppercase tracking-[0.12em] mb-2.5">Doel van de vlucht</p>
          <div className="grid grid-cols-3 gap-2.5">
            {INTENTS.map((i) => (
              <button
                key={i.id}
                onClick={() => update({ intent: i.id })}
                className={`rounded-2xl px-3 py-3.5 text-center transition-all active:scale-[0.97] ${
                  booking.intent === i.id
                    ? 'bg-white text-black'
                    : 'card text-white hover:bg-white/[0.08]'
                }`}
              >
                <span className="block font-semibold text-[15px]">{i.label}</span>
                <span
                  className={`block text-[11px] mt-0.5 ${
                    booking.intent === i.id ? 'text-black/55' : 'text-white/45'
                  }`}
                >
                  {i.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>

        <button className="btn-primary w-full text-[17px]" disabled={!dest} onClick={() => startBoarding()}>
          {dest ? 'Boek mijn vlucht' : 'Kies eerst een bestemming'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DestinationPicker({
  home,
  title = 'Waarheen?',
  visitedSet,
  onPick,
  onBack,
}: {
  home: Airport
  title?: string
  visitedSet: Set<string>
  onPick: (a: Airport) => void
  onBack: () => void
}) {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    return searchAirports(q, 60)
      .filter((a) => a.iata !== home.iata)
      .map((a) => {
        const d = distanceKm([home.lon, home.lat], [a.lon, a.lat])
        return { a, dist: d, min: flightMinutes(d, STANDARD) }
      })
  }, [q, home])

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-7 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="ios-btn" aria-label="Terug">
            <IconBack size={19} />
          </button>
          <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op stad, land of code…"
          className="w-full rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-3.5 outline-none focus:border-white/30 placeholder:text-white/30 mb-4 text-[15px]"
        />
        <div className="card overflow-hidden divide-y divide-white/[0.06]">
          {rows.map(({ a, dist, min }) => (
            <button
              key={a.iata}
              onClick={() => onPick(a)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06] active:bg-white/[0.1] transition"
            >
              <IataBadge iata={a.iata} visited={visitedSet.has(a.iata)} className="min-w-[52px] justify-center" />
              <span className="flex-1 min-w-0">
                <span className="block truncate font-semibold text-[14px]">{a.city}</span>
                <span className="block truncate text-[12px] text-white/45">
                  {a.name} · {a.country} · {Math.round(dist).toLocaleString('nl-NL')} km
                </span>
              </span>
              <span className="text-[14px] font-semibold tabular-nums text-white/85">
                {formatMinutes(min)}
              </span>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-white/40 text-sm">Geen vliegveld gevonden.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Endpoint({ code, city, align = 'left' }: { code: string; city: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[26px] font-bold tracking-tight leading-none tabular-nums">{code}</p>
      <p className="text-[12px] text-white/50 truncate max-w-[8rem] mt-1">{city}</p>
    </div>
  )
}


/** yellow IATA badge; orange outline + check once you have been there */
export function IataBadge({
  iata,
  visited,
  active = false,
  className = '',
}: {
  iata: string
  visited: boolean
  active?: boolean
  className?: string
}) {
  if (visited && !active) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border-[1.5px] border-orange-400 text-orange-300 font-bold text-[11px] px-1.5 py-0.5 ${className}`}
      >
        <IconCheck size={10} />
        {iata}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-bold text-[11px] px-1.5 py-0.5 ${
        active ? 'bg-black text-white' : 'bg-[#ffc800] text-[#0b0d10]'
      } ${className}`}
    >
      <IconPlane size={10} />
      {iata}
    </span>
  )
}