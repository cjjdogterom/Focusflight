import { useState } from 'react'
import { useStore } from '../store'
import { IconBack, IconPlane } from '../components/icons'
import {
  MEMBERSHIP_CARDS,
  currentCard,
  nextCard,
  type MembershipCard,
} from '../data/memberships'
import { deriveCertificates } from '../lib/achievements'

export default function Collection() {
  const setScreen = useStore((s) => s.setScreen)
  const totalMiles = useStore((s) => s.totalMiles)
  const flights = useStore((s) => s.flights)
  const certificates = deriveCertificates(flights)
  const active = currentCard(totalMiles)
  const next = nextCard(totalMiles)
  const progress = next ? ((totalMiles - active.kmMin) / (next.kmMin - active.kmMin)) * 100 : 100
  const [cardOut, setCardOut] = useState(false)

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-7 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('home')} className="ios-btn" aria-label="Terug">
            <IconBack size={19} />
          </button>
          <h1 className="text-[22px] font-bold tracking-tight">Membership</h1>
        </div>

        {/* active card in its leather wallet — tap to slide it out */}
        <div>
          <button
            onClick={() => setCardOut((v) => !v)}
            className="block w-full text-left"
            aria-label={cardOut ? 'Kaart terugsteken' : 'Kaart uit de portemonnee halen'}
          >
            <div className="relative pt-2 pb-1 overflow-visible">
              {/* the card, tucked into the pocket */}
              <div className={`wallet-card ${cardOut ? 'wallet-card--out' : ''} relative z-0 px-3`}>
                <Card card={active} large />
              </div>
              {/* the stitched leather pocket over the lower half */}
              <div className="leather relative z-10 -mt-[34%] h-44 rounded-2xl">
                <div className="leather-stitch" />
                <div className="absolute inset-x-0 bottom-5 text-center">
                  <p className="leather-emboss text-[12px] uppercase">FocusFlight Club</p>
                  <p className="text-[10px] text-white/25 mt-1.5">
                    {cardOut ? 'tik om terug te steken' : 'tik om je kaart te pakken'}
                  </p>
                </div>
              </div>
            </div>
          </button>
          <div className="mt-5">
            <div className="h-[5px] rounded-full bg-white/12 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${active.to}, ${active.from})`,
                }}
              />
            </div>
            <div className="flex justify-between mt-3">
              <div>
                <p className="text-[19px] font-bold tabular-nums leading-tight">
                  {totalMiles.toLocaleString('nl-NL')} <span className="text-[13px] font-medium text-white/50">km</span>
                </p>
                <p className="text-[12px] text-white/45">Totale afstand</p>
              </div>
              {next && (
                <div className="text-right">
                  <p className="text-[19px] font-bold tabular-nums leading-tight">
                    {(next.kmMin - totalMiles).toLocaleString('nl-NL')}{' '}
                    <span className="text-[13px] font-medium text-white/50">km</span>
                  </p>
                  <p className="text-[12px] text-white/45">Tot volgende kaart</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* wallet */}
        <section>
          <p className="avlabel uppercase tracking-[0.12em] mb-3">Alle kaarten</p>
          <div className="grid grid-cols-2 gap-3.5">
            {MEMBERSHIP_CARDS.map((c) => {
              const unlocked = totalMiles >= c.kmMin
              return (
                <div key={c.id} className={unlocked ? '' : 'opacity-40 grayscale'}>
                  <Card card={c} />
                  <p className="text-[11px] text-white/45 mt-1.5 px-0.5">
                    {unlocked ? 'In je collectie' : `Vanaf ${c.kmMin.toLocaleString('nl-NL')} km`}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* milestone certificates */}
        {certificates.length > 0 && (
          <section>
            <p className="avlabel uppercase tracking-[0.12em] mb-3">Certificaten</p>
            <div className="flex flex-col gap-3.5">
              {certificates.map((c) => (
                <div key={c.id} className="card px-5 py-4 relative overflow-hidden">
                  <div className="absolute inset-2 rounded-xl border border-white/[0.13] pointer-events-none" />
                  <p className="text-[9px] tracking-[0.3em] uppercase text-white/40">
                    FocusFlight Club · Certificaat
                  </p>
                  <h3 className="font-serif text-[18px] font-semibold mt-1.5 leading-snug">{c.title}</h3>
                  <p className="text-[13px] text-white/55 mt-1 leading-relaxed">{c.detail}</p>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/[0.08]">
                    <span className="font-mono text-[12px] text-white/60 tabular-nums">{c.routeLabel}</span>
                    <span className="text-[11px] text-white/40">
                      {new Date(c.dateMs).toLocaleDateString('nl-NL', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

/** engraved metal membership card */
export function Card({ card, large = false }: { card: MembershipCard; large?: boolean }) {
  return (
    <div
      className={`metal-card finish-${card.finish} ${large ? 'aspect-[1.62]' : 'aspect-[1.58]'}`}
      style={{
        background: `linear-gradient(150deg, ${card.from} 0%, ${card.to} 100%)`,
        color: card.text,
      }}
    >
      <div className={`absolute ${large ? 'top-5 left-5' : 'top-3.5 left-3.5'} flex items-center gap-1.5 opacity-70`}>
        <IconPlane size={large ? 15 : 12} />
        <p className={`uppercase tracking-[0.22em] font-semibold ${large ? 'text-[10px]' : 'text-[8px]'}`}>
          FocusFlight Club
        </p>
      </div>
      <p
        className={`metal-engrave absolute font-semibold ${
          large ? 'bottom-9 right-6 text-[30px]' : 'bottom-7 right-4 text-[19px]'
        }`}
      >
        {card.name}
      </p>
      <p
        className={`metal-engrave absolute italic opacity-75 ${
          large ? 'bottom-4 right-6 text-[12px]' : 'bottom-3 right-4 text-[9px]'
        }`}
      >
        {card.tagline}
      </p>
    </div>
  )
}
