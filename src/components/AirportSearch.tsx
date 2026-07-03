import { useMemo, useState } from 'react'
import { searchAirports } from '../data/airports'
import type { Airport } from '../types'

export default function AirportSearch({
  onPick,
  placeholder = 'Zoek stad of luchthaven…',
  excludeIata,
}: {
  onPick: (a: Airport) => void
  placeholder?: string
  excludeIata?: string | null
}) {
  const [q, setQ] = useState('')
  const results = useMemo(
    () => searchAirports(q, 30).filter((a) => a.iata !== excludeIata),
    [q, excludeIata],
  )

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-sky-accent placeholder:text-white/30"
      />
      <div className="grid grid-cols-1 gap-2 max-h-[52vh] overflow-y-auto no-scrollbar pr-1">
        {results.map((a) => (
          <button
            key={a.iata}
            onClick={() => onPick(a)}
            className="flex items-center gap-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 px-4 py-3 text-left transition"
          >
            <span className="font-mono text-sky-accent text-lg w-14">{a.iata}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium">{a.city}</span>
              <span className="block truncate text-sm text-white/50">
                {a.name} · {a.country}
              </span>
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <div className="text-white/40 text-sm px-2 py-6 text-center">Geen luchthaven gevonden.</div>
        )}
      </div>
    </div>
  )
}
