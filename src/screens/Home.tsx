import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { airportByIata } from '../data/airports'
import { IconGear, IconLog, IconCards, IconDice, IconCheck, IconReturn, IconGlobe, IconPassport } from '../components/icons'
import { currentCard } from '../data/memberships'
import { Card } from './Collection'
import { formatDuration } from '../lib/flight'

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export default function Home() {
  const home = useStore((s) => airportByIata(s.homeIata ?? ''))
  const totalMiles = useStore((s) => s.totalMiles)
  const flights = useStore((s) => s.flights)
  const setScreen = useStore((s) => s.setScreen)
  const pickRandom = useStore((s) => s.pickRandomDestination)
  const now = useClock()

  const today = flights.filter((f) => f.startedAt >= startOfToday())
  // streak: consecutive days (ending today or yesterday) with a completed flight
  const dayKeys = new Set(
    flights.filter((f) => f.completed).map((f) => new Date(f.startedAt).toDateString()),
  )
  let streak = 0
  {
    const d = new Date()
    if (!dayKeys.has(d.toDateString())) d.setDate(d.getDate() - 1)
    while (dayKeys.has(d.toDateString())) {
      streak++
      d.setDate(d.getDate() - 1)
    }
  }
  const todayFocus = today.reduce((s, f) => s + f.completedSec, 0)
  const completedCount = flights.filter((f) => f.completed).length
  const recent = flights.slice(0, 5)
  const card = currentCard(totalMiles)

  const lt = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-7 flex flex-col gap-6 stagger">
        {/* header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight leading-tight">FocusFlight</h1>
            <p className="text-[13px] text-white/50 mt-0.5">
              {home?.iata} · {home?.city} · {lt}
            </p>
          </div>
          <button onClick={() => setScreen('settings')} aria-label="Instellingen" className="ios-btn">
            <IconGear size={19} />
          </button>
        </header>

        {/* membership card teaser */}
        <button onClick={() => setScreen('collection')} className="text-left active:scale-[0.99] transition-transform">
          <Card card={card} large />
        </button>

        {/* stats row — no boxes, just dividers */}
        <div className="grid grid-cols-4 divide-x divide-white/10 text-center py-1">
          <Stat label="Vandaag" value={formatDuration(todayFocus)} />
          <Stat label="Kilometers" value={totalMiles.toLocaleString('nl-NL')} />
          <Stat label="Vluchten" value={String(completedCount)} />
          <Stat label="Streak" value={`${streak}d`} />
        </div>

        {/* primary CTA */}
        <div className="flex flex-col gap-2.5">
          <button className="btn-primary w-full text-[17px]" onClick={() => setScreen('booking')}>
            Boek mijn vlucht
          </button>
          <div className="flex flex-wrap gap-2 [&>button]:flex-1 [&>button]:basis-[30%]">
            <button
              className="btn-ghost !px-2 text-[14px]"
              onClick={() => {
                pickRandom()
                setScreen('booking')
              }}
            >
              <IconDice size={16} /> Rndm
            </button>
            <button className="btn-ghost !px-2 text-[14px]" onClick={() => setScreen('flightlog')}>
              <IconLog size={16} /> Logboek
            </button>
            <button className="btn-ghost !px-2 text-[14px]" onClick={() => setScreen('collection')}>
              <IconCards size={16} /> Kaarten
            </button>
            <button className="btn-ghost !px-2 text-[14px]" onClick={() => setScreen('globe')}>
              <IconGlobe size={16} /> Globe
            </button>
            <button className="btn-ghost !px-2 text-[14px]" onClick={() => setScreen('passport')}>
              <IconPassport size={16} /> Paspoort
            </button>
          </div>
        </div>

        {/* recent flights */}
        {recent.length > 0 && (
          <section>
            <p className="avlabel uppercase tracking-[0.12em] mb-2.5">Recente vluchten</p>
            <div className="card overflow-hidden divide-y divide-white/[0.07]">
              {recent.map((f) => {
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[13px] text-white/45 tabular-nums w-11">
                      {new Date(f.startedAt).toLocaleTimeString('nl-NL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold truncate">
                        {f.fromIata} → {f.toIata}{' '}
                        <span className="text-white/45 font-normal">{f.toCity}</span>
                      </span>
                      <span className="block text-[12px] text-white/40">
                        {formatDuration(f.completedSec)} · {f.miles.toLocaleString('nl-NL')} km
                      </span>
                    </span>
                    {f.completed ? (
                      <IconCheck size={16} className="text-emerald-400" />
                    ) : (
                      <IconReturn size={16} className="text-amber-400" />
                    )}
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
    <div className="px-2">
      <p className="text-[19px] font-bold tabular-nums">{value}</p>
      <p className="text-[12px] text-white/45 mt-0.5">{label}</p>
    </div>
  )
}
