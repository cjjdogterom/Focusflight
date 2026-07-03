import { useStore } from '../store'
import { IconBack } from '../components/icons'
import { airportByIata } from '../data/airports'
import { STANDARD } from '../data/aircraft'
import { liveryById } from '../data/liveries'
import { distanceKm } from '../lib/geo'
import { flightMinutes, formatMinutes, intentMeta } from '../lib/flight'

export default function BoardingPass() {
  const home = useStore((s) =>
    airportByIata(
      (s.booking.originIata ??
        (s.transitMode ? s.flights.find((f) => f.completed)?.toIata ?? s.homeIata : s.homeIata)) ??
        '',
    ),
  )
  const booking = useStore((s) => s.booking)
  const boarding = useStore((s) => s.boarding)
  const setScreen = useStore((s) => s.setScreen)
  const beginFlight = useStore((s) => s.beginFlight)
  const dest = booking.destinationIata ? airportByIata(booking.destinationIata) : undefined
  const livery = liveryById(booking.liveryId)
  const intent = intentMeta(booking.intent)

  if (!home || !dest || !boarding) return null

  const dist = distanceKm([home.lon, home.lat], [dest.lon, dest.lat])
  const durationMin = flightMinutes(dist, STANDARD)
  const eta = new Date(Date.now() + durationMin * 60_000)
  const etaStr = eta.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const now = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date()
    .toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace('.', '')

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-md mx-auto px-5 py-8 flex flex-col gap-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreen('booking')}
            className="glass-icon !w-11 !h-11"
            aria-label="Terug"
          >
            <IconBack size={19} />
          </button>
          <h1 className="text-xl font-bold">Boarding pass</h1>
        </div>

        {/* ticket */}
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50 bg-[#f7f9fc] text-night-900">
          {/* airline band */}
          <div
            className="px-5 py-4 text-white flex items-center justify-between"
            style={{ background: `linear-gradient(100deg, ${livery.tail} 0%, #0a3a63 130%)` }}
          >
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/75">
                {livery.airline}
              </p>
              <p className="font-mono text-xl font-bold leading-tight">{boarding.flightNo}</p>
            </div>
            <div className="text-right font-mono text-[11px] text-white/85 leading-relaxed">
              <p>{dateStr}</p>
            </div>
          </div>

          {/* route */}
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p className="font-mono text-4xl font-bold leading-none">{home.iata}</p>
              <p className="font-mono text-[10px] text-night-900/45 mt-1">{home.icao}</p>
              <p className="text-xs text-night-900/60 max-w-[7.5rem] truncate">{home.city}</p>
            </div>
            <div className="flex-1 flex flex-col items-center px-3 text-night-900/50">
              <img src="/plane-klm-top.png" alt="" className="w-9" />
              <div className="w-full flex items-center mt-1">
                <span className="h-px flex-1 bg-night-900/20" />
                <span className="px-1 font-mono text-[10px]">
                  {Math.round(dist).toLocaleString('nl-NL')} KM
                </span>
                <span className="h-px flex-1 bg-night-900/20" />
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-4xl font-bold leading-none">{dest.iata}</p>
              <p className="font-mono text-[10px] text-night-900/45 mt-1">{dest.icao}</p>
              <p className="text-xs text-night-900/60 max-w-[7.5rem] truncate ml-auto">{dest.city}</p>
            </div>
          </div>

          {/* fields */}
          <div className="px-5 pb-5 grid grid-cols-4 gap-x-3 gap-y-3">
            <Field label="Boarding" value={now} />
            <Field label="Aankomst" value={etaStr} />
            <Field label="Gate" value={boarding.gate} />
            <Field label="Seat" value={boarding.seat} />
            <Field label="Cabine" value={intent.label} />
            <Field label="Block" value={formatMinutes(durationMin)} className="col-span-2" />
          </div>

          {/* perforation + stub */}
          <div className="relative border-t-2 border-dashed border-night-900/20">
            <span className="absolute -left-3.5 -top-3.5 w-7 h-7 rounded-full bg-night-900" />
            <span className="absolute -right-3.5 -top-3.5 w-7 h-7 rounded-full bg-night-900" />
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-night-900/45">Passagier</p>
                  <p className="font-semibold text-sm">FOCUS TRAVELLER</p>
                </div>
                <p className="font-mono text-[11px] text-night-900/55">
                  {boarding.flightNo} · {boarding.seat} · GRP 1
                </p>
              </div>
              <div className="barcode rounded-sm" />
            </div>
          </div>
        </div>

        <button className="btn-primary w-full text-lg" onClick={() => beginFlight()}>
          Board &amp; start focus
        </button>
        <p className="text-center avlabel">
          Deuren sluiten bij vertrek — {formatMinutes(durationMin)} aan boord
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[9px] uppercase tracking-[0.2em] text-night-900/45">{label}</p>
      <p className="font-mono font-semibold text-sm truncate mt-0.5">{value}</p>
    </div>
  )
}
