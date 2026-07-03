export interface Airport {
  iata: string
  icao: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
}

export type AircraftBody = 'regional' | 'narrowbody' | 'widebody' | 'prop'

/** which SVG silhouette to draw for this aircraft */
export type AircraftSilhouette = 'b747' | 'b777' | 'b787' | 'b737' | 'a320' | 'a380' | 'regional' | 'prop'

export interface Aircraft {
  id: string
  name: string
  manufacturer: string
  /** ICAO type designator, e.g. B744 */
  typeCode: string
  body: AircraftBody
  silhouette: AircraftSilhouette
  engines: number
  /** typical cruise speed in km/h — sets the real flight (focus) duration */
  cruiseKmh: number
  /** typical cruise altitude in metres */
  cruiseAltM: number
  /** typical range in km (flavour) */
  rangeKm: number
  /** relative visual scale of the plane marker */
  scale: number
  description: string
}

export type CheatlineStyle = 'none' | 'straight' | 'wave' | 'split'
export type EmblemKind = 'none' | 'crown' | 'roundel' | 'chevron'

export interface Livery {
  id: string
  name: string
  /** real airline this livery represents (private use) */
  airline: string
  /** short titles painted on the fuselage, e.g. "KLM" */
  titles: string
  fuselage: string
  /** lower fuselage / belly colour */
  belly: string
  tail: string
  accent: string
  cheatline: string
  cheatlineStyle: CheatlineStyle
  /** tail emblem colour */
  emblem: string
  emblemKind: EmblemKind
}

export type Intent = 'study' | 'work' | 'create'

export type FlightPhase =
  | 'boarding'
  | 'taxi'
  | 'takeoff'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'landing'
  | 'arrived'

export interface FlightLogEntry {
  id: string
  fromIata: string
  toIata: string
  fromCity: string
  toCity: string
  aircraftId: string
  liveryId: string
  intent: Intent
  /** planned focus duration in seconds */
  durationSec: number
  /** actually completed seconds */
  completedSec: number
  distanceKm: number
  miles: number
  completed: boolean
  startedAt: number
  endedAt: number
}
