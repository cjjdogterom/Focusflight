import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { airportByIata, searchAirports } from '../data/airports'
import { STANDARD } from '../data/aircraft'
import { IconPlane, IconBack } from '../components/icons'
import { distanceKm } from '../lib/geo'
import { prefetchRoute } from '../lib/routeFetch'
import { INTENTS, flightMinutes, formatMinutes } from '../lib/flight'
import type { Airport } from '../types'

export default function Booking() {
  // in doorreis-modus vertrek je vanaf je laatste bestemming
  const home = useStore((s) =>
    airportByIata(
      (s.transitMode ? s.flights.find((f) => f.completed)?.toIata ?? s.homeIata : s.homeIata) ?? '',
    ),
  )
  const homeBase = useStore((s) => s.homeIata)
  const transitMode = useStore((s) => s.transitMode)
  const booking = useStore((s) => s.booking)
  const update = useStore((s) => s.updateBooking)
  const setScreen = useStore((s) => s.setScreen)
  const startBoarding = useStore((s) => s.startBoarding)

  const [pickingDest, setPickingDest] = useState(false)

  const dest = booking.destinationIata ? airportByIata(booking.destinationIata) : undefined
  const dist = home && dest ? distanceKm([home.lon, home.lat], [dest.lon, dest.lat]) : 0
  const durationMin = dist ? flightMinutes(dist, STANDARD) : 0

  if (pickingDest && home) {
    return (
      <DestinationPicker
        home={home}
        onBack={() => setPickingDest(false)}
        onPick={(a) => {
          update({ destinationIata: a.iata })
          prefetchRoute(home, a) // warm the real-route cache
          setPickingDest(false)
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

        {/* route */}
        {transitMode && home && home.iata !== homeBase && (
          <p className="text-[12px] text-white/50 -mb-3">
            Doorreis — je vertrekt vanaf je laatste bestemming.
          </p>
        )}
        <button
          onClick={() => setPickingDest(true)}
          className="card p-5 text-left active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between">
            <Endpoint code={home?.iata ?? '—'} city={home?.city ?? ''} />
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
            {dest ? (
              <Endpoint code={dest.iata} city={dest.city} align="right" />
            ) : (
              <span className="text-white font-semibold text-[15px]">Kies bestemming</span>
            )}
          </div>
        </button>

        {/* aircraft photo preview — no type shown, just the plane */}
        <div className="card px-6 pt-8 pb-6 grid place-items-center overflow-hidden">
          <img
            src="/plane-klm-top.png"
            alt=""
            className="w-44 drop-shadow-[0_18px_24px_rgba(0,0,0,0.55)]"
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
  onPick,
  onBack,
}: {
  home: Airport
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
          <h1 className="text-[22px] font-bold tracking-tight">Waarheen?</h1>
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
              <span className="inline-flex items-center gap-1 rounded-md bg-[#ffc800] text-[#0b0d10] font-bold text-[12px] px-1.5 py-0.5 min-w-[52px] justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" />
                </svg>
                {a.iata}
              </span>
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
