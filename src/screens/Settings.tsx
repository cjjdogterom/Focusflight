import { useState } from 'react'
import { useStore } from '../store'
import { IconBack } from '../components/icons'
import { airportByIata } from '../data/airports'
import AirportSearch from '../components/AirportSearch'
import { db } from '../lib/persistence'

export default function Settings() {
  const home = useStore((s) => airportByIata(s.homeIata ?? ''))
  const setHome = useStore((s) => s.setHome)
  const setScreen = useStore((s) => s.setScreen)
  const soundOn = useStore((s) => s.soundOn)
  const setSound = useStore((s) => s.setSound)
  const strictMode = useStore((s) => s.strictMode)
  const setStrict = useStore((s) => s.setStrict)
  const transitMode = useStore((s) => s.transitMode)
  const setTransit = useStore((s) => s.setTransit)

  const [pickingHome, setPickingHome] = useState(false)

  const resetData = async () => {
    if (window.confirm('Alle vluchten, mijlen en instellingen wissen?')) {
      await db.delete()
      window.location.reload()
    }
  }

  if (pickingHome) {
    return (
      <div className="h-full overflow-y-auto no-scrollbar">
        <div className="max-w-lg mx-auto px-5 py-6 animate-fade-in">
          <Header title="Thuisbasis wijzigen" onBack={() => setPickingHome(false)} />
          <div className="card p-4 mt-4">
            <AirportSearch
              onPick={(a) => {
                void setHome(a.iata)
                setPickingHome(false)
                setScreen('settings')
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="max-w-lg mx-auto px-5 py-6 flex flex-col gap-4 animate-fade-in">
        <Header title="Instellingen" onBack={() => setScreen('home')} />

        <button
          onClick={() => setPickingHome(true)}
          className="card p-4 flex items-center justify-between text-left hover:bg-white/[0.05]"
        >
          <span>
            <span className="avlabel block mb-1">Thuisbasis</span>
            <span className="font-semibold">
              <span className="font-mono text-sky-accent">{home?.iata}</span> · {home?.city}
            </span>
          </span>
          <span className="text-white/40">›</span>
        </button>

        <Toggle
          label="Cabinegeluid"
          hint="Zacht luchtstroom- en motorgeluid tijdens de vlucht"
          on={soundOn}
          onChange={setSound}
        />
        <Toggle
          label="Strikte modus"
          hint="Waarschuw wanneer je tijdens een vlucht van tabblad wisselt"
          on={strictMode}
          onChange={setStrict}
        />
        <Toggle
          label="Doorreis-modus"
          hint="Je volgende vlucht vertrekt vanaf je laatste bestemming — sessies rijgen zich aaneen tot een wereldreis"
          on={transitMode}
          onChange={setTransit}
        />

        <div className="card p-4 text-[13px] text-white/55 leading-relaxed">
          <p className="avlabel mb-1.5">Over deze app</p>
          Route AMS–BCN: echte OFP-route (SID KUDAD 3E · N872 · UM728/UN857 ·
          STAR ALBER 2W), bron: operationeel vluchtplan — niet voor echte navigatie.
          Kaartdata: Natural Earth (publiek domein) · luchthavens: OurAirports. Echte
          merknamen en livery's uitsluitend voor privégebruik.
        </div>

        <button
          onClick={() => void resetData()}
          className="btn bg-rose-600/15 text-rose-300 border border-rose-600/30 hover:bg-rose-600/25 w-full"
        >
          Alle gegevens wissen
        </button>

        <p className="text-center avlabel mt-2">FocusFlight · v0.2</p>
      </div>
    </div>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="glass-icon !w-11 !h-11"
        aria-label="Terug"
      >
        <IconBack size={19} />
      </button>
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
  )
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="card p-4 flex items-center justify-between text-left hover:bg-white/[0.05]"
    >
      <span className="flex-1 pr-4">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-white/50 mt-0.5">{hint}</span>
      </span>
      <span className={`avswitch ${on ? 'avswitch--on' : 'avswitch--off'}`}>
        <span className={`avswitch-knob ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}
