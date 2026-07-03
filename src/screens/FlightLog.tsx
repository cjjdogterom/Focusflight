import { useStore } from '../store'
import { IconBack, IconX } from '../components/icons'
import { formatDuration } from '../lib/flight'
import type { FlightLogEntry } from '../types'

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

export default function FlightLog() {
  const flights = useStore((s) => s.flights)
  const totalMiles = useStore((s) => s.totalMiles)
  const setScreen = useStore((s) => s.setScreen)
  const removeFlight = useStore((s) => s.removeFlight)

  const onDelete = (f: FlightLogEntry) => {
    if (
      window.confirm(
        `Vlucht ${f.fromIata} – ${f.toIata} verwijderen? Kilometers, stempels en certificaten worden herrekend.`,
      )
    ) {
      void removeFlight(f.id)
    }
  }

  const totalFocus = flights.reduce((s, f) => s + f.completedSec, 0)

  const exportCSV = () => {
    const blob = new Blob([toCSV(flights)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'focusflight-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

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
          <section className="card overflow-hidden">
            {/* logbook header row */}
            <div className="grid grid-cols-[64px_1fr_56px_20px_24px] gap-2 px-4 py-2 border-b border-white/10 avlabel">
              <span>Datum</span>
              <span>Route</span>
              <span>Block</span>
              <span />
              <span />
            </div>
            <div className="divide-y divide-white/5">
              {flights.map((f) => {
                return (
                  <div
                    key={f.id}
                    className="group grid grid-cols-[64px_1fr_56px_20px_24px] gap-2 px-4 py-2.5 items-center font-mono text-[12.5px]"
                  >
                    <span className="text-white/55">
                      {new Date(f.startedAt).toLocaleDateString('nl-NL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      {new Date(f.startedAt).toLocaleTimeString('nl-NL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="truncate">
                      <span className="text-sky-accent">{f.fromIata}</span>
                      <span className="text-white/35">–</span>
                      <span className="text-sky-accent">{f.toIata}</span>{' '}
                      <span className="text-white/55">{f.toCity}</span>
                    </span>
                    <span className="text-av-amber tabular-nums">{formatDuration(f.completedSec)}</span>
                    <span className={f.completed ? 'text-av-green' : 'text-av-amber'}>
                      {f.completed ? '✓' : '↩'}
                    </span>
                    <button
                      onClick={() => onDelete(f)}
                      aria-label={`Verwijder vlucht ${f.fromIata} naar ${f.toIata}`}
                      className="grid place-items-center w-6 h-6 rounded-md text-white/25 hover:text-rose-300 hover:bg-rose-500/10 active:scale-90 transition"
                    >
                      <IconX size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
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
