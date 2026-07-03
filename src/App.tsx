import { useEffect } from 'react'
import { useStore } from './store'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Booking from './screens/Booking'
import BoardingPass from './screens/BoardingPass'
import ActiveFlight from './screens/ActiveFlight'
import Landing from './screens/Landing'
import FlightLog from './screens/FlightLog'
import Collection from './screens/Collection'
import Settings from './screens/Settings'
import Globe from './screens/Globe'
import Passport from './screens/Passport'

export default function App() {
  const ready = useStore((s) => s.ready)
  const screen = useStore((s) => s.screen)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="h-full grid place-items-center text-white/60">
        <div className="animate-pulse-soft">FocusFlight wordt geladen…</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden">
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'home' && <Home />}
      {screen === 'booking' && <Booking />}
      {screen === 'boarding' && <BoardingPass />}
      {screen === 'flying' && <ActiveFlight />}
      {screen === 'landing' && <Landing />}
      {screen === 'flightlog' && <FlightLog />}
      {screen === 'collection' && <Collection />}
      {screen === 'settings' && <Settings />}
      {screen === 'globe' && <Globe />}
      {screen === 'passport' && <Passport />}
    </div>
  )
}
