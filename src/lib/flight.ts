import type { Aircraft, FlightPhase, Intent } from '../types'

export interface IntentMeta {
  id: Intent
  label: string
  blurb: string
  color: string
}

export const INTENTS: IntentMeta[] = [
  { id: 'study', label: 'Study', blurb: 'Leren & verwerken', color: '#7c9cff' },
  { id: 'work', label: 'Work', blurb: 'Diep werk & taken', color: '#4fc3f7' },
  { id: 'create', label: 'Create', blurb: 'Maken & schrijven', color: '#ffb86b' },
]

export function intentMeta(id: Intent): IntentMeta {
  return INTENTS.find((i) => i.id === id) ?? INTENTS[1]
}

/**
 * Real block time for a route flown by a given aircraft — this IS the focus
 * session length. Slower aircraft take longer over the same distance.
 * = taxi-out + climb/cruise/descent (airborne, with a slowdown factor) + taxi-in.
 */
export function flightMinutes(distanceKm: number, aircraft: Aircraft): number {
  const airborne = (distanceKm / aircraft.cruiseKmh) * 60
  const ground = 16 // taxi out + taxi in
  return Math.max(8, Math.round(airborne * 1.07 + ground))
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}u ${String(m).padStart(2, '0')}m`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0) return `${h}u ${String(m).padStart(2, '0')}m`
  return `${m} min`
}

const PHASE_LABELS: Record<FlightPhase, string> = {
  boarding: 'Boarding',
  taxi: 'Taxiën',
  takeoff: 'Vertrek',
  climb: 'Klimmen',
  cruise: 'Kruishoogte',
  descent: 'Daling',
  landing: 'Landing',
  arrived: 'Geland',
}

export function phaseLabel(phase: FlightPhase): string {
  return PHASE_LABELS[phase]
}

/** Map progress fraction (0..1) to a flight phase. */
export function phaseForProgress(t: number): FlightPhase {
  if (t <= 0) return 'takeoff'
  if (t < 0.03) return 'takeoff'
  if (t < 0.1) return 'climb'
  if (t < 0.88) return 'cruise'
  if (t < 0.97) return 'descent'
  if (t < 1) return 'landing'
  return 'arrived'
}

/** Flight miles earned for a given flown distance/fraction. */
export function milesFor(distanceKm: number, fraction: number): number {
  return Math.round(distanceKm * Math.max(0, Math.min(1, fraction)))
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const smooth = (f: number) => f * f * (3 - 2 * f)

export interface Telemetry {
  speedKmh: number
  altitudeM: number
}

/**
 * Realistic speed/altitude profile across the flight: starts on the runway
 * (0 speed, 0 altitude), takes off, climbs to cruise, then descends and lands.
 */
export function flightDynamics(t: number, aircraft: Aircraft): Telemetry {
  const cr = aircraft.cruiseKmh
  const alt = aircraft.cruiseAltM
  let speedKmh = 0
  let altitudeM = 0
  if (t <= 0) {
    speedKmh = 0
    altitudeM = 0
  } else if (t < 0.03) {
    const f = t / 0.03
    speedKmh = lerp(0, 300, f)
    altitudeM = lerp(0, 800, f)
  } else if (t < 0.1) {
    const f = (t - 0.03) / 0.07
    speedKmh = lerp(300, cr, smooth(f))
    altitudeM = lerp(800, alt, smooth(f))
  } else if (t < 0.88) {
    speedKmh = cr
    altitudeM = alt
  } else if (t < 0.97) {
    const f = (t - 0.88) / 0.09
    speedKmh = lerp(cr, 280, smooth(f))
    altitudeM = lerp(alt, 400, smooth(f))
  } else if (t < 1) {
    const f = (t - 0.97) / 0.03
    speedKmh = lerp(280, 0, f)
    altitudeM = lerp(400, 0, f)
  }
  return { speedKmh: Math.round(speedKmh), altitudeM: Math.round(altitudeM) }
}
