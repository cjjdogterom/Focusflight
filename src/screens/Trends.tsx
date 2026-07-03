import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { IconBack } from '../components/icons'
import { formatDuration } from '../lib/flight'
import type { FlightLogEntry } from '../types'

// Trends: widget cards over the flight log — streak, focus time with a
// 30-day sparkline, flight count and the average per weekday.

type Period = 'total' | 'month' | 'week'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'total', label: 'Totaal' },
  { id: 'month', label: 'Maand' },
  { id: 'week', label: 'Week' },
]

const dayKey = (ms: number) => new Date(ms).toDateString()

export default function Trends() {
  const setScreen = useStore((s) => s.setScreen)
  const flights = useStore((s) => s.flights)
  const [period, setPeriod] = useState<Period>('total')

  const filtered = useMemo(() => {
    if (period === 'total') return flights
    const now = new Date()
    const start = new Date(now)
    if (period === 'week') {
      const dow = (now.getDay() + 6) % 7 // maandag = 0
      start.setDate(now.getDate() - dow)
    } else {
      start.setDate(1)
    }
    start.setHours(0, 0, 0, 0)
    return flights.filter((f) => f.startedAt >= start.getTime())
  }, [flights, period])

  const focusSec = filtered.reduce((sum, f) => sum + f.completedSec, 0)
  const completedCount = filtered.filter((f) => f.completed).length

  // streak over the FULL log (a streak is not period-bound)
  const streak = useMemo(() => {
    const days = new Set(flights.filter((f) => f.completed).map((f) => dayKey(f.startedAt)))
    let n = 0
    const d = new Date()
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
    while (days.has(d.toDateString())) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }, [flights])

  // last 14 days as dots (filled = flew that day)
  const dots = useMemo(() => {
    const days = new Set(flights.filter((f) => f.completed).map((f) => dayKey(f.startedAt)))
    const out: { flew: boolean; today: boolean }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push({ flew: days.has(d.toDateString()), today: i === 0 })
    }
    return out
  }, [flights])

  // daily focus over the last 30 days for the sparkline
  const spark = useMemo(() => {
    const perDay = new Map<string, number>()
    for (const f of flights) {
      const k = dayKey(f.startedAt)
      perDay.set(k, (perDay.get(k) ?? 0) + f.completedSec)
    }
    const vals: number[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      vals.push(perDay.get(d.toDateString()) ?? 0)
    }
    return vals
  }, [flights])

  // average focus per weekday, over days that actually had focus
  const weekday = useMemo(() => {
    const perDay = new Map<string, { sec: number; dow: number }>()
    for (const f of filtered) {
      const d = new Date(f.startedAt)
      const k = d.toDateString()
      const cur = perDay.get(k) ?? { sec: 0, dow: (d.getDay() + 6) % 7 }
      cur.sec += f.completedSec
      perDay.set(k, cur)
    }
    const sums = new Array(7).fill(0)
    const counts = new Array(7).fill(0)
    for (const { sec, dow } of perDay.values()) {
      sums[dow] += sec
      counts[dow]++
    }
    const avg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
    const overallDays = [...perDay.values()].length
    const overall = overallDays ? focusSec / overallDays : 0
    return { avg, overall }
  }, [filtered, focusSec])

  const sparkMax = Math.max(1, ...spark)
  const sparkPath = spark
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / 29) * 100).toFixed(1)},${(34 - (v / sparkMax) * 30).toFixed(1)}`)
    .join(' ')
  const wdMax = Math.max(1, ...weekday.avg)
  const WD = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-4 animate-fade-in stagger">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('home')} className="ios-btn" aria-label="Terug">
            <IconBack size={19} />
          </button>
          <h1 className="text-[22px] font-bold tracking-tight flex-1">Trends</h1>
          <div className="flex rounded-full bg-white/[0.07] border border-white/10 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold transition ${
                  period === p.id ? 'bg-white text-black' : 'text-white/55'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* streak */}
        <div className="card p-5">
          <p className="avlabel uppercase tracking-[0.12em]">Vluchtstreak</p>
          <p className="text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-1">
            {streak}
            <span className="text-[17px] font-semibold text-white/60">d</span>
          </p>
          <div className="flex gap-1.5 mt-3">
            {dots.map((d, i) => (
              <span
                key={i}
                className={`flex-1 h-6 rounded-full ${
                  d.flew ? 'bg-sky-300/90' : 'bg-white/[0.09]'
                } ${d.today ? 'ring-1 ring-white/60' : ''}`}
              />
            ))}
          </div>
        </div>

        {/* focus time + sparkline */}
        <div className="card p-5">
          <p className="avlabel uppercase tracking-[0.12em]">Focustijd</p>
          <p className="text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-1">
            {formatDuration(focusSec)}
          </p>
          <svg viewBox="0 0 100 36" className="w-full h-16 mt-2" preserveAspectRatio="none" aria-hidden="true">
            <path d={`${sparkPath} L100,36 L0,36 Z`} fill="rgba(167,139,250,0.16)" stroke="none" />
            <path d={sparkPath} fill="none" stroke="rgba(196,181,253,0.9)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="text-[11px] text-white/40 mt-1">Laatste 30 dagen</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* flights */}
          <div className="card p-5">
            <p className="avlabel uppercase tracking-[0.12em]">Vluchten</p>
            <p className="text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-1">
              {completedCount}
            </p>
            <p className="text-[11px] text-white/40 mt-1">
              {filtered.length - completedCount > 0
                ? `+ ${filtered.length - completedCount} omgeleid`
                : 'alles geland'}
            </p>
          </div>

          {/* km */}
          <div className="card p-5">
            <p className="avlabel uppercase tracking-[0.12em]">Kilometers</p>
            <p className="text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-1">
              {filtered.reduce((s, f) => s + f.miles, 0).toLocaleString('nl-NL')}
            </p>
            <p className="text-[11px] text-white/40 mt-1">in deze periode</p>
          </div>
        </div>

        {/* weekday average */}
        <div className="card p-5">
          <p className="avlabel uppercase tracking-[0.12em]">Weekdag-gemiddelde</p>
          <p className="text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-1">
            {formatDuration(weekday.overall)}
          </p>
          <p className="text-[11px] text-white/40">gemiddelde over dagen met focus</p>
          <div className="flex items-end gap-2 mt-4 h-24">
            {weekday.avg.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-md bg-gradient-to-t from-sky-500/40 to-sky-300/80"
                  style={{ height: `${Math.max(3, (v / wdMax) * 100)}%` }}
                />
                <span className="text-[10px] text-white/40">{WD[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
