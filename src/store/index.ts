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
  getSetting,
  saveFlight,
  setSetting,
} from '../lib/persistence'

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
  startBoarding: () => void
  beginFlight: () => Promise<void>
  finishFlight: (completedSec: number, fraction: number) => Promise<void>
  abortFlight: (completedSec: number, fraction: number) => Promise<void>
  removeFlight: (id: string) => Promise<void>
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
    set({
      ready: true,
      homeIata,
      soundOn,
      soundscape,
      strictMode,
      mapStyle,
      followPref,
      transitMode,
      flights,
      totalMiles,
      screen: homeIata ? 'home' : 'onboarding',
    })
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

  updateBooking: (patch) => set((s) => ({ booking: { ...s.booking, ...patch } })),

  pickRandomDestination: () => {
    const home = get().getOrigin()
    const pool = AIRPORTS.filter((a) => a.iata !== home)
    const dest = pool[Math.floor(Math.random() * pool.length)]
    set((s) => ({ booking: { ...s.booking, destinationIata: dest.iata } }))
  },

  startBoarding: () =>
    set({
      screen: 'boarding',
      boarding: { seat: seatCode(), gate: gateCode(), flightNo: flightNo() },
    }),

  beginFlight: async () => {
    const { booking, boarding } = get()
    const from = airportByIata(get().getOrigin() ?? '')
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
    set({ active, screen: 'flying' })
  },

  finishFlight: async (completedSec, fraction) => {
    const { active } = get()
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
      endedAt: Date.now(),
    }
    await saveFlight(entry)
    set((s) => {
      const earned = newlyUnlocked(s.totalMiles, s.totalMiles + miles)
      const flights = [entry, ...s.flights]
      // new passport stamp: first completed landing in this country?
      const before = new Set(deriveStamps(s.flights).map((st) => st.country))
      const stamp = deriveStamps(flights).find((st) => !before.has(st.country))
      const certs = certificatesEarnedAt(flights, entry.endedAt)
      return {
        lastResult: entry,
        flights,
        totalMiles: s.totalMiles + miles,
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
    const { active } = get()
    if (!active) return
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
    }
    await saveFlight(entry)
    set((s) => ({
      lastResult: entry,
      flights: [entry, ...s.flights],
      totalMiles: s.totalMiles + miles,
      active: null,
      screen: 'home',
    }))
  },
}))

if (import.meta.env.DEV) {
  ;(window as unknown as { ff?: typeof useStore }).ff = useStore
}
