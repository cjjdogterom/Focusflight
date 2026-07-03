import { useMemo } from 'react'
import { useStore } from '../store'
import { airportByIata } from '../data/airports'
import { deriveStamps, type PassportStamp } from '../lib/achievements'
import { IconBack, IconPlane } from '../components/icons'

// Digital passport booklet: one ink stamp per country you have landed in.
// Stamps are derived from the flight log, so they are fully retroactive.

const INKS = [
  { ink: '#e08585', name: 'rood' },
  { ink: '#7fa3e0', name: 'blauw' },
  { ink: '#7fc79b', name: 'groen' },
  { ink: '#b394d6', name: 'paars' },
  { ink: '#d6b184', name: 'sepia' },
] as const

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function Passport() {
  const setScreen = useStore((s) => s.setScreen)
  const flights = useStore((s) => s.flights)
  const home = useStore((s) => airportByIata(s.homeIata ?? ''))

  const stamps = useMemo(() => deriveStamps(flights), [flights])

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-6 animate-fade-in stagger">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('home')} className="ios-btn" aria-label="Terug">
            <IconBack size={19} />
          </button>
          <div>
            <h1 className="text-[22px] font-bold tracking-tight leading-tight">Paspoort</h1>
            <p className="text-[12px] text-white/45">
              {stamps.length === 1 ? '1 land bezocht' : `${stamps.length} landen bezocht`}
            </p>
          </div>
        </div>

        {/* passport cover */}
        <div
          className="rounded-2xl px-6 py-7 relative overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, #17223d 0%, #0d1426 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 18px 40px -18px rgba(0,0,0,0.8)',
          }}
        >
          <div className="absolute inset-3 rounded-xl border border-[#c9a86a]/35 pointer-events-none" />
          <p className="text-center text-[10px] tracking-[0.34em] uppercase text-[#c9a86a]/80">
            FocusFlight Club
          </p>
          <div className="grid place-items-center my-5 text-[#c9a86a]">
            <IconPlane size={34} />
          </div>
          <p className="text-center font-serif text-[24px] font-semibold tracking-[0.14em] text-[#d9bd85]">
            PASPOORT
          </p>
          <p className="text-center text-[11px] text-white/40 mt-3 tracking-wide">
            Houder · {home?.city ?? '—'} ({home?.iata ?? '—'})
          </p>
        </div>

        {/* stamp pages */}
        {stamps.length === 0 ? (
          <div className="card p-6 text-center text-[13px] text-white/45 leading-relaxed">
            Nog geen stempels — land ergens en het land verschijnt hier met een eigen stempel.
          </div>
        ) : (
          <section>
            <p className="avlabel uppercase tracking-[0.12em] mb-3">Stempels</p>
            <div className="grid grid-cols-2 gap-4">
              {stamps.map((st) => (
                <Stamp key={st.country} stamp={st} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Stamp({ stamp }: { stamp: PassportStamp }) {
  const h = hashCode(stamp.country)
  const { ink } = INKS[h % INKS.length]
  const rot = (h % 11) - 5 // -5..+5 graden
  const round = h % 3 === 0
  const date = new Date(stamp.firstAt)
    .toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
  return (
    <div className="grid place-items-center py-2">
      <div
        className={`px-4 py-3.5 text-center w-full ${round ? 'rounded-[2.5rem]' : 'rounded-lg'}`}
        style={{
          color: ink,
          border: `2px solid ${ink}`,
          boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 0 0 3px ${ink}55`,
          transform: `rotate(${rot}deg)`,
          opacity: 0.92,
        }}
      >
        <p className="text-[9px] tracking-[0.3em] uppercase opacity-80">Aankomst</p>
        <p className="font-serif font-bold text-[16px] leading-tight uppercase tracking-wide mt-1 break-words">
          {stamp.country}
        </p>
        <p className="text-[10px] font-mono mt-1.5 opacity-90">
          {stamp.iata} · {date}
        </p>
        <p className="text-[9px] mt-0.5 opacity-65">
          {stamp.landings === 1 ? 'eerste landing' : `${stamp.landings}× geland`}
        </p>
      </div>
    </div>
  )
}
