import { useStore } from '../store'
import { IconBack, IconX, IconPlane } from '../components/icons'
import { formatDuration } from '../lib/flight'
import type { FlightLogEntry } from '../types'

// Pilot log as a stack of boarding-pass tickets sliding out of a leather
// folder: date + status badge, big IATA pair, times and distance, with
// punched notches on the fold line.

function toCSV(rows: FlightLogEntry[]): string {
  const header = [
    'date',
    'from',
    'to',
    'aircraft',
    'livery',
    'intent',
    'planned_min',
    'completed_sec',
    'distance_km',
    'miles',
    'completed',
  ]
  const lines = rows.map((f) =>
    [
      new Date(f.startedAt).toISOString(),
      f.fromIata,
      f.toIata,
      f.aircraftId,
      f.liveryId,
      f.intent,
      Math.round(f.durationSec / 60),
      f.completedSec,
      f.distanceKm,
      f.miles,
      f.completed ? 'yes' : 'no',
    ].join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

function ticketTime(totalSec: number): string {
  const min = Math.max(1, Math.round(totalSec / 60))
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}u ${min % 60}m`
}

export default function FlightLog() {
  const flights = useStore((s) => s.flights)
  const totalMiles = useStore((s) => s.totalMiles)
  const setScreen = useStore((s) => s.setScreen)
  const removeFlight = useStore((s) => s.removeFlight)

  const totalFocus = flights.reduce((s, f) => s + f.completedSec, 0)

  const onDelete = (f: FlightLogEntry) => {
    if (
      window.confirm(
        `Vlucht ${f.fromIata} – ${f.toIata} verwijderen? Kilometers, stempels en certificaten worden herrekend.`,
      )
    ) {
      void removeFlight(f.id)
    }
  }

  const exportCSV = () => {
    const blob = new Blob([toCSV(flights)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'focusflight-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScreen('home')}
            className="glass-icon !w-11 !h-11"
            aria-label="Terug"
          >
            <IconBack size={19} />
          </button>
          <h1 className="text-xl font-bold flex-1">Pilotenlogboek</h1>
          <button className="btn-ghost text-sm py-2 px-3" onClick={() => setScreen('trends')}>
            Trends
          </button>
          {flights.length > 0 && (
            <button className="btn-ghost text-sm py-2 px-3" onClick={exportCSV}>
              CSV
            </button>
          )}
        </div>

        <div className="du grid grid-cols-3 divide-x divide-panel-edge/50">
          <Stat label="Totale focus" value={formatDuration(totalFocus)} />
          <Stat label="Flight miles" value={totalMiles.toLocaleString('nl-NL')} />
          <Stat label="Vluchten" value={String(flights.length)} />
        </div>

        {flights.length === 0 ? (
          <div className="card p-10 text-center text-white/50">Nog geen vluchten gelogd.</div>
        ) : (
          <div className="flex flex-col gap-4 stagger">
            {flights.map((f) => (
              <div key={f.id} className="ticket p-0 overflow-visible">
                {/* header: date + status */}
                <div className="flex items-center justify-between px-5 pt-4">
                  <p className="text-[13px] text-white/55">{fmtDate(f.startedAt)}</p>
                  <span
                    className={`text-[10px] font-bold tracking-[0.14em] uppercase px-2 py-1 rounded-md ${
                      f.completed
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {f.completed ? 'Geland' : 'Omgeleid'}
                  </span>
                </div>

                {/* route */}
                <div className="flex items-center gap-3 px-5 pt-3 pb-4">
                  <div className="min-w-0">
                    <p className="text-[30px] font-bold tracking-tight leading-none">{f.fromIata}</p>
                    <p className="text-[12px] text-white/50 truncate mt-1">{f.fromCity}</p>
                  </div>
                  <div className="flex-1 flex flex-col items-center px-1 text-white/35">
                    <span className="text-[11px] tabular-nums text-white/45 mb-0.5">
                      {ticketTime(f.completedSec)}
                    </span>
                    <div className="w-full flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                      <span className="h-px flex-1 bg-white/15" />
                      <IconPlane size={14} className="mx-1" />
                      <span className="h-px flex-1 bg-white/15" />
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          f.completed ? 'bg-emerald-400/80' : 'bg-amber-400/80'
                        }`}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[30px] font-bold tracking-tight leading-none">{f.toIata}</p>
                    <p className="text-[12px] text-white/50 truncate mt-1">{f.toCity}</p>
                  </div>
                </div>

                {/* fold line with punched notches */}
                <div className="relative ticket-notch mx-0">
                  <div className="mx-5 border-t border-dashed border-white/15" />
                </div>

                {/* stub: times + distance + delete */}
                <div className="flex items-center px-5 py-3.5">
                  <div className="flex-1">
                    <p className="text-[11px] text-white/40">Vertrek</p>
                    <p className="text-[15px] font-semibold tabular-nums">{fmtTime(f.startedAt)}</p>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-[11px] text-white/40">Afstand</p>
                    <p className="text-[15px] font-semibold tabular-nums">
                      {f.miles.toLocaleString('nl-NL')} km
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-white/40">Aankomst</p>
                    <p className="text-[15px] font-semibold tabular-nums">{fmtTime(f.endedAt)}</p>
                  </div>
                  <button
                    onClick={() => onDelete(f)}
                    aria-label={`Verwijder vlucht ${f.fromIata} naar ${f.toIata}`}
                    className="ml-4 grid place-items-center w-7 h-7 rounded-md text-white/25 hover:text-rose-300 hover:bg-rose-500/10 active:scale-90 transition"
                  >
                    <IconX size={13} />
                  </button>
                </div>

                {f.squawks && f.squawks.length > 0 && (
                  <div className="px-5 pb-4 -mt-1">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/35 mb-1.5">
                      Squawks
                    </p>
                    <ul className="space-y-1">
                      {f.squawks.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12.5px] text-white/65">
                          <span className="mt-[6px] w-1 h-1 rounded-full bg-amber-400/80 shrink-0" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3.5 text-center">
      <p className="font-mono text-lg font-bold text-av-amber tabular-nums">{value}</p>
      <p className="avlabel mt-0.5">{label}</p>
    </div>
  )
}
