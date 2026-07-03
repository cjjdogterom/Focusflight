import { useStore } from '../store'
import AirportSearch from '../components/AirportSearch'

export default function Onboarding() {
  const setHome = useStore((s) => s.setHome)

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 max-w-lg mx-auto animate-fade-in">
      <div className="text-center mb-8 flex flex-col items-center gap-2">
        <h1 className="text-[32px] font-bold tracking-tight">FocusFlight</h1>
        <p className="text-white/55 max-w-xs">
          Boek een vlucht, blijf gefocust tot de landing. Kies eerst je thuisbasis.
        </p>
      </div>
      <div className="w-full card p-4">
        <p className="avlabel uppercase tracking-[0.12em] mb-3">Selecteer thuisbasis</p>
        <AirportSearch onPick={(a) => void setHome(a.iata)} placeholder="Jouw thuisluchthaven…" />
      </div>
      <p className="avlabel mt-6">Gegevens blijven lokaal op dit apparaat</p>
    </div>
  )
}
