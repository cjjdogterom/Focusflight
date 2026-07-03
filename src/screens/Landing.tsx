import { useStore } from '../store'
import { MEMBERSHIP_CARDS, nextCard, distanceFact } from '../data/memberships'
import { deriveCertificates } from '../lib/achievements'
import { Card } from './Collection'
import { formatDuration } from '../lib/flight'

export default function Landing() {
  const result = useStore((s) => s.lastResult)
  const newCardId = useStore((s) => s.newCardId)
  const totalMiles = useStore((s) => s.totalMiles)
  const setScreen = useStore((s) => s.setScreen)
  const newCard = MEMBERSHIP_CARDS.find((c) => c.id === newCardId) ?? null
  const next = nextCard(totalMiles)
  const newStamp = useStore((s) => s.newStamp)
  const newCertIds = useStore((s) => s.newCertIds)
  const flights = useStore((s) => s.flights)
  const newCerts = deriveCertificates(flights).filter((c) => newCertIds.includes(c.id))

  if (!result) {
    return (
      <div className="h-full grid place-items-center">
        <button className="btn-primary" onClick={() => setScreen('home')}>
          Terug naar home
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-md mx-auto px-6 py-10 flex flex-col items-center gap-7 stagger">
        <div className="text-center">
          <h1 className="text-[34px] font-bold tracking-tight">Geland</h1>
          <p className="text-white/55 mt-1">Welkom in {result.toCity}. Mooie focus.</p>
        </div>

        {/* flight summary */}
        <div className="card p-6 w-full flex flex-col items-center gap-4">
          <img src="/plane-klm-top.png" alt="" className="w-24 drop-shadow-[0_12px_16px_rgba(0,0,0,0.5)]" />
          <p className="text-[17px] font-semibold tabular-nums">
            {result.fromIata} → {result.toIata}
          </p>
          <div className="w-full grid grid-cols-3 divide-x divide-white/10 text-center">
            <Metric label="Focustijd" value={formatDuration(result.completedSec)} />
            <Metric label="Afstand" value={`${result.distanceKm.toLocaleString('nl-NL')} km`} />
            <Metric label="Mijlen" value={`+${result.miles.toLocaleString('nl-NL')}`} />
          </div>
        </div>

        {/* membership card unlock — editorial serif celebration (reference style) */}
        {newCard && (
          <div className="w-full card-reveal flex flex-col gap-5 pt-2">
            <Card card={newCard} large />
            <div>
              <h2 className="font-serif text-[22px] font-semibold leading-snug">
                {newCard.name}-kaart toegevoegd aan je collectie.
              </h2>
              <div className="w-10 h-px bg-white/25 my-3" />
              <p className="font-serif text-[15px] text-white/70 leading-relaxed">
                Je hebt <strong className="text-white">{totalMiles.toLocaleString('nl-NL')} km</strong> gevlogen.
              </p>
              <p className="font-serif text-[15px] text-white/70 leading-relaxed mt-2">
                {distanceFact(totalMiles)}
              </p>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-4">
              <div>
                <p className="text-[17px] font-bold tabular-nums leading-tight">
                  {totalMiles.toLocaleString('nl-NL')} <span className="text-[12px] font-medium text-white/50">km</span>
                </p>
                <p className="text-[12px] text-white/45">Totale afstand</p>
              </div>
              {next && (
                <div className="text-right">
                  <p className="text-[17px] font-bold tabular-nums leading-tight">
                    {(next.kmMin - totalMiles).toLocaleString('nl-NL')}{' '}
                    <span className="text-[12px] font-medium text-white/50">km</span>
                  </p>
                  <p className="text-[12px] text-white/45">Tot volgende kaart</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* new passport stamp */}
        {newStamp && (
          <button
            onClick={() => setScreen('passport')}
            className="w-full card p-5 text-left flex items-center gap-4 active:scale-[0.99] transition-transform"
          >
            <span
              className="shrink-0 grid place-items-center w-16 h-16 rounded-full border-2 text-center"
              style={{ borderColor: '#7fa3e0', color: '#7fa3e0', transform: 'rotate(-6deg)' }}
            >
              <span className="text-[8px] tracking-[0.2em] uppercase leading-tight px-1">
                Aankomst
              </span>
            </span>
            <span>
              <span className="block font-serif text-[17px] font-semibold leading-snug">
                Nieuwe stempel: {newStamp}
              </span>
              <span className="block text-[12px] text-white/50 mt-0.5">
                Toegevoegd aan je paspoort — tik om te bekijken
              </span>
            </span>
          </button>
        )}

        {/* new certificates */}
        {newCerts.map((c) => (
          <div key={c.id} className="w-full card px-5 py-4 relative overflow-hidden card-reveal">
            <div className="absolute inset-2 rounded-xl border border-white/[0.13] pointer-events-none" />
            <p className="text-[9px] tracking-[0.3em] uppercase text-white/40">Nieuw certificaat</p>
            <h3 className="font-serif text-[18px] font-semibold mt-1.5">{c.title}</h3>
            <p className="text-[13px] text-white/55 mt-1 leading-relaxed">{c.detail}</p>
          </div>
        ))}

        <div className="flex flex-col gap-2.5 w-full">
          <button className="btn-primary w-full" onClick={() => setScreen('booking')}>
            Boek mijn volgende vlucht
          </button>
          <div className="flex gap-2.5">
            <button className="btn-ghost flex-1" onClick={() => setScreen('flightlog')}>
              Logboek
            </button>
            <button className="btn-ghost flex-1" onClick={() => setScreen('home')}>
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <p className="text-[16px] font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-white/45 mt-0.5">{label}</p>
    </div>
  )
}
