import { useEffect } from 'react'
import { useStore } from './store'
import { useTiltGlare } from './lib/useTiltGlare'
import { primeFx } from './lib/audio'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Booking from './screens/Booking'
import BoardingPass from './screens/BoardingPass'
import ActiveFlight from './screens/ActiveFlight'
import Landing from './screens/Landing'
import FlightLog from './screens/FlightLog'
import Collection from './screens/Collection'
import Settings from './screens/Settings'
import Passport from './screens/Passport'
import Trends from './screens/Trends'

export default function App() {
  const ready = useStore((s) => s.ready)
  const screen = useStore((s) => s.screen)
  const init = useStore((s) => s.init)
  useTiltGlare()

  useEffect(() => {
    void init()
  }, [init])

  // iOS: audio contexts must be created/resumed inside a user gesture —
  // prime the shared effects context on the first tap
  useEffect(() => {
    const once = () => {
      primeFx()
      window.removeEventListener('pointerdown', once)
    }
    window.addEventListener('pointerdown', once)
    return () => window.removeEventListener('pointerdown', once)
  }, [])

  if (!ready) {
    return (
      <div className="h-full grid place-items-center text-white/60">
        <div className="animate-pulse-soft">FocusFlight wordt geladen…</div>
      </div>
    )
  }

  return (
    // standalone PWA draws under the iOS status bar / home indicator; pad the
    // regular screens with the safe-area insets, but keep the flight map
    // full-bleed (its overlays carry their own insets)
    <div
      className={`h-full w-full overflow-hidden ${
        screen === 'flying'
          ? ''
          : 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
      }`}
    >
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'home' && <Home />}
      {screen === 'booking' && <Booking />}
      {screen === 'boarding' && <BoardingPass />}
      {screen === 'flying' && <ActiveFlight />}
      {screen === 'landing' && <Landing />}
      {screen === 'flightlog' && <FlightLog />}
      {screen === 'collection' && <Collection />}
      {screen === 'settings' && <Settings />}
      {screen === 'passport' && <Passport />}
      {screen === 'trends' && <Trends />}
    </div>
  )
}
