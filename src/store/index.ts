import { create } from 'zustand'
import type { FlightLogEntry, Intent } from '../types'
import { AIRPORTS, airportByIata } from '../data/airports'
import { STANDARD } from '../data/aircraft'
import { LIVERIES } from '../data/liveries'
import { getRoute, type Route } from '../lib/routeEngine'
import { fetchRealRoute } from '../lib/routeFetch'
import { flightMinutes, milesFor } from '../lib/flight'
import { newlyUnlocked } from '../data/memberships'
import { deriveStamps, certificatesEarnedAt } from '../lib/achievements'
import type { SoundscapeId } from '../lib/audio'
import {
  allFlights,
  deleteFlight,
  getFlightById,
  getSetting,
  loadActiveFlight,
  patchActiveFlight,
  saveActiveFlight,
  saveFlight,
  setSetting,
} from '../lib/persistence'
import { acquireFlightLock, hasFlightLock } from '../lib/flightLock'

export type Screen =
  | 'onboarding'
  | 'home'
  | 'booking'
  | 'boarding'
  | 'flying'
  | 'landing'
  | 'flightlog'
  | 'collection'
  | 'settings'
  | 'passport'
  | 'trends'

export interface BookingDraft {
  /** departure override — null means home base / transit position */
  originIata: string | null
  destinationIata: string | null
  aircraftId: string
  liveryId: string
  intent: Intent
}

export interface BoardingInfo {
  seat: string
  gate: string
  flightNo: string
}

export interface ActiveFlight {
  route: Route
  aircraftId: string
  liveryId: string
  intent: Intent
  durationSec: number
  startedAtMs: number
  seat: string
  gate: string
  flightNo: string
  /** set when a persisted flight is restored after a reload — initial timer state */
  resume?: { elapsedMs: number; paused: boolean }
}

interface State {
  ready: boolean
  screen: Screen
  homeIata: string | null
  soundOn: boolean
  soundscape: SoundscapeId
  strictMode: boolean
  mapStyle: 'dark' | 'sat'
  followPref: 'off' | 'north' | 'track'
  /** doorreis-modus: next flight departs from your last destination */
  transitMode: boolean

  booking: BookingDraft
  boarding: BoardingInfo | null
  active: ActiveFlight | null
  lastResult: FlightLogEntry | null
  /** membership card earned on the most recent landing, if any */
  newCardId: string | null
  /** country stamped into the passport on the most recent landing, if new */
  newStamp: string | null
  /** certificate ids earned (or improved) on the most recent landing */
  newCertIds: string[]
  /** intrusive thoughts parked during the current flight */
  activeSquawks: string[]

  flights: FlightLogEntry[]
  totalMiles: number

  init: () => Promise<void>
  setScreen: (s: Screen) => void
  setHome: (iata: string) => Promise<void>
  setSound: (on: boolean) => void
  setSoundscape: (s: SoundscapeId) => void
  setStrict: (on: boolean) => void
  setMapStyle: (m: 'dark' | 'sat') => void
  setFollowPref: (m: 'off' | 'north' | 'track') => void
  setTransit: (on: boolean) => void
  /** departure airport: home base, or the last destination in transit mode */
  getOrigin: () => string | null

  updateBooking: (patch: Partial<BookingDraft>) => void
  pickRandomDestination: () => void
  startBoarding: (info?: Partial<BoardingInfo>) => void
  beginFlight: () => Promise<void>
  finishFlight: (completedSec: number, fraction: number, endedAtMs?: number) => Promise<void>
  abortFlight: (completedSec: number, fraction: number) => Promise<void>
  /** anchor the flight clock in wall time so it survives reload/offline */
  persistFlightClock: (elapsedMs: number, running: boolean) => void
  removeFlight: (id: string) => Promise<void>
  addSquawk: (text: string) => void
  /** effective departure: booking override, else transit position / home */
  getBookingOrigin: () => string | null
}

function seatCode(): string {
  const row = 1 + Math.floor(Math.random() * 32)
  const letter = 'ABCDEF'[Math.floor(Math.random() * 6)]
  return `${row}${letter}`
}
function gateCode(): string {
  return `${'ABCD'[Math.floor(Math.random() * 4)]}${1 + Math.floor(Math.random() * 24)}`
}
function flightNo(): string {
  return `FF${100 + Math.floor(Math.random() * 899)}`
}

const DEFAULT_BOOKING: BookingDraft = {
  originIata: null,
  destinationIata: null,
  aircraftId: STANDARD.id, // fixed standard aircraft (never shown)
  liveryId: LIVERIES[0].id, // KLM
  intent: 'work',
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  screen: 'onboarding',
  homeIata: null,
  soundOn: true,
  soundscape: 'cabin',
  strictMode: false,
  mapStyle: 'dark',
  followPref: 'off',
  transitMode: false,

  booking: { ...DEFAULT_BOOKING },
  boarding: null,
  active: null,
  lastResult: null,
  newCardId: null,
  newStamp: null,
  newCertIds: [],
  activeSquawks: [],

  flights: [],
  totalMiles: 0,

  init: async () => {
    const homeIata = await getSetting<string | null>('homeIata', null)
    const soundOn = await getSetting<boolean>('soundOn', true)
    const soundscape = await getSetting<SoundscapeId>('soundscape', 'cabin')
    const strictMode = await getSetting<boolean>('strictMode', false)
    const mapStyle = await getSetting<'dark' | 'sat'>('mapStyle', 'dark')
    const followPref = await getSetting<'off' | 'north' | 'track'>('followPref', 'off')
    const transitMode = await getSetting<boolean>('transitMode', false)
    const flights = await allFlights()
    const totalMiles = flights.reduce((sum, f) => sum + f.miles, 0)

    // resume a flight that was in the air when the app was last closed —
    // the wall-clock anchor keeps it ticking through reloads and offline time.
    // Only the tab that wins the flight lock restores it; a second window
    // opens at Home instead of forking the same flight.
    const rec = await loadActiveFlight()
    const owned = rec?.active ? await acquireFlightLock() : false
    const a = owned ? ((rec!.active as ActiveFlight | undefined) ?? null) : null
    const c = rec?.clock
    const elapsedMs =
      a && c ? (c.running ? c.elapsedMs + Math.max(0, Date.now() - c.wallMs) : c.elapsedMs) : 0
    const landedAway = a != null && elapsedMs >= a.durationSec * 1000
    const inAir = a != null && !landedAway

    set({
      ready: !landedAway, // auto-land below flips it after the log is written
      homeIata,
      soundOn,
      soundscape,
      strictMode,
      mapStyle,
      followPref,
      transitMode,
      flights,
      totalMiles,
      ...(inAir
        ? {
            active: { ...a, resume: { elapsedMs, paused: !c!.running } },
            activeSquawks: rec!.squawks,
            screen: 'flying' as Screen,
          }
        : { screen: (homeIata ? 'home' : 'onboarding') as Screen }),
    })

    if (landedAway) {
      // landed while the app was away — log the completed flight and greet
      // the user with the landing screen
      const endedAt = c!.running ? c!.wallMs + (a.durationSec * 1000 - c!.elapsedMs) : Date.now()
      set({ active: a, activeSquawks: rec!.squawks })
      await get().finishFlight(a.durationSec, 1, endedAt)
      set({ ready: true })
    }
  },

  setScreen: (screen) => set({ screen }),

  setHome: async (iata) => {
    await setSetting('homeIata', iata)
    set({ homeIata: iata, screen: 'home' })
  },

  setSound: (on) => {
    set({ soundOn: on })
    void setSetting('soundOn', on)
  },
  setSoundscape: (sc) => {
    set({ soundscape: sc })
    void setSetting('soundscape', sc)
  },
  setStrict: (on) => {
    set({ strictMode: on })
    void setSetting('strictMode', on)
  },

  setMapStyle: (m) => {
    set({ mapStyle: m })
    void setSetting('mapStyle', m)
  },

  setFollowPref: (m) => {
    set({ followPref: m })
    void setSetting('followPref', m)
  },

  setTransit: (on) => {
    set({ transitMode: on })
    void setSetting('transitMode', on)
  },

  getOrigin: () => {
    const s = get()
    if (!s.transitMode) return s.homeIata
    const last = s.flights.find((f) => f.completed)
    return last?.toIata ?? s.homeIata
  },

  getBookingOrigin: () => {
    const s = get()
    return s.booking.originIata ?? s.getOrigin()
  },

  addSquawk: (text) => {
    const t = text.trim()
    if (!t) return
    set((s) => ({ activeSquawks: [...s.activeSquawks, t].slice(0, 20) }))
    if (get().active && hasFlightLock()) void patchActiveFlight({ squawks: get().activeSquawks })
  },

  persistFlightClock: (elapsedMs, running) => {
    if (!hasFlightLock()) return
    void patchActiveFlight({ clock: { elapsedMs, running, wallMs: Date.now() } })
  },

  updateBooking: (patch) => set((s) => ({ booking: { ...s.booking, ...patch } })),

  pickRandomDestination: () => {
    const home = get().getBookingOrigin()
    const pool = AIRPORTS.filter((a) => a.iata !== home)
    const dest = pool[Math.floor(Math.random() * pool.length)]
    set((s) => ({ booking: { ...s.booking, destinationIata: dest.iata } }))
  },

  startBoarding: (info) =>
    set({
      screen: 'boarding',
      // real flight data (check-in on the departure board) overrides the
      // generated boarding info — flight number and gate come from Schiphol
      boarding: { seat: seatCode(), gate: gateCode(), flightNo: flightNo(), ...info },
    }),

  beginFlight: async () => {
    const { booking, boarding } = get()
    const from = airportByIata(get().getBookingOrigin() ?? '')
    const to = booking.destinationIata ? airportByIata(booking.destinationIata) : undefined
    if (!from || !to) return
    const info = boarding ?? { seat: seatCode(), gate: gateCode(), flightNo: flightNo() }
    // real waypoints for any pair (usually already cached by the prefetch);
    // hard 4s cap so boarding never hangs on a slow network
    const fetched = await Promise.race([
      fetchRealRoute(from, to),
      new Promise<null>((r) => window.setTimeout(() => r(null), 4000)),
    ])
    const route = getRoute(from, to, fetched)
    const durationSec = flightMinutes(route.distanceKm, STANDARD) * 60
    const active: ActiveFlight = {
      route,
      aircraftId: booking.aircraftId,
      liveryId: booking.liveryId,
      intent: booking.intent,
      durationSec,
      startedAtMs: Date.now(),
      seat: info.seat,
      gate: info.gate,
      flightNo: info.flightNo,
    }
    set({ active, screen: 'flying', activeSquawks: [] })
    // persist only when this tab owns the flight lock — never hijack a
    // flight that is still running in another window
    if (await acquireFlightLock()) {
      void saveActiveFlight({
        active,
        squawks: [],
        clock: { elapsedMs: 0, running: true, wallMs: active.startedAtMs },
      })
    }
  },

  finishFlight: async (completedSec, fraction, endedAtMs) => {
    const { active, activeSquawks } = get()
    if (!active) return
    const miles = milesFor(active.route.distanceKm, fraction)
    const entry: FlightLogEntry = {
      id: `${active.startedAtMs}`,
      fromIata: active.route.from.iata,
      toIata: active.route.to.iata,
      fromCity: active.route.from.city,
      toCity: active.route.to.city,
      aircraftId: active.aircraftId,
      liveryId: active.liveryId,
      intent: active.intent,
      durationSec: active.durationSec,
      completedSec: Math.round(completedSec),
      distanceKm: Math.round(active.route.distanceKm),
      miles,
      completed: true,
      startedAt: active.startedAtMs,
      endedAt: endedAtMs ?? Date.now(),
      squawks: activeSquawks.length ? activeSquawks : undefined,
    }
    await saveFlight(entry)
    if (hasFlightLock()) await saveActiveFlight(null)
    set((s) => {
      // dedupe by id: a stale persisted record could auto-land a flight
      // that is already in the log — never double-count it
      const rest = s.flights.filter((f) => f.id !== entry.id)
      const prevTotal = rest.reduce((sum, f) => sum + f.miles, 0)
      const flights = [entry, ...rest]
      const totalMiles = prevTotal + miles
      const earned = newlyUnlocked(prevTotal, totalMiles)
      // new passport stamp: first completed landing in this country?
      const before = new Set(deriveStamps(rest).map((st) => st.country))
      const stamp = deriveStamps(flights).find((st) => !before.has(st.country))
      const certs = certificatesEarnedAt(flights, entry.endedAt)
      return {
        lastResult: entry,
        flights,
        totalMiles,
        newCardId: earned.length ? earned[earned.length - 1].id : null,
        newStamp: stamp?.country ?? null,
        newCertIds: certs.map((c) => c.id),
        screen: 'landing',
      }
    })
  },

  removeFlight: async (id) => {
    await deleteFlight(id)
    set((s) => {
      const flights = s.flights.filter((f) => f.id !== id)
      // miles, stamps and certificates are all derived from the log
      return { flights, totalMiles: flights.reduce((sum, f) => sum + f.miles, 0) }
    })
  },

  abortFlight: async (completedSec, fraction) => {
    const { active, activeSquawks } = get()
    if (!active) return
    // if this flight already landed (e.g. finished in another window), never
    // downgrade the completed log entry to a diverted one
    const existing = await getFlightById(`${active.startedAtMs}`)
    if (existing?.completed) {
      if (hasFlightLock()) await saveActiveFlight(null)
      set({ active: null, screen: 'home' })
      return
    }
    const miles = milesFor(active.route.distanceKm, fraction * 0.5) // half credit for a diverted flight
    const entry: FlightLogEntry = {
      id: `${active.startedAtMs}`,
      fromIata: active.route.from.iata,
      toIata: active.route.to.iata,
      fromCity: active.route.from.city,
      toCity: active.route.to.city,
      aircraftId: active.aircraftId,
      liveryId: active.liveryId,
      intent: active.intent,
      durationSec: active.durationSec,
      completedSec: Math.round(completedSec),
      distanceKm: Math.round(active.route.distanceKm),
      miles,
      completed: false,
      startedAt: active.startedAtMs,
      endedAt: Date.now(),
      squawks: activeSquawks.length ? activeSquawks : undefined,
    }
    await saveFlight(entry)
    if (hasFlightLock()) await saveActiveFlight(null)
    set((s) => {
      const rest = s.flights.filter((f) => f.id !== entry.id)
      return {
        lastResult: entry,
        flights: [entry, ...rest],
        totalMiles: rest.reduce((sum, f) => sum + f.miles, 0) + miles,
        active: null,
        screen: 'home',
      }
    })
  },
}))

if (import.meta.env.DEV) {
  ;(window as unknown as { ff?: typeof useStore }).ff = useStore
}
