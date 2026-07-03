import raw from './airports.json'
import type { Airport } from '../types'

// All scheduled-service airports worldwide with an IATA code (OurAirports,
// public domain): [iata, icao, name, city, iso_country, lat, lon, isLarge]
type Row = [string, string, string, string, string, number, number, number]

const region =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['nl'], { type: 'region' })
    : null

function countryName(cc: string): string {
  try {
    return region?.of(cc) ?? cc
  } catch {
    return cc
  }
}

interface AirportX extends Airport {
  big: boolean
}

export const AIRPORTS: AirportX[] = (raw as Row[]).map((r) => ({
  iata: r[0],
  icao: r[1],
  name: r[2],
  city: r[3],
  country: countryName(r[4]),
  lat: r[5],
  lon: r[6],
  big: r[7] === 1,
}))

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]))

export function airportByIata(iata: string): Airport | undefined {
  return BY_IATA.get(iata)
}

/** ranked search: IATA match first, then city/name/country; large airports first */
export function searchAirports(query: string, limit = 40): Airport[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return AIRPORTS.filter((a) => a.big).slice(0, limit)
  }
  const scored: { a: AirportX; s: number }[] = []
  for (const a of AIRPORTS) {
    let s = -1
    const iata = a.iata.toLowerCase()
    if (iata === q) s = 100
    else if (iata.startsWith(q)) s = 60
    else {
      const city = a.city.toLowerCase()
      const name = a.name.toLowerCase()
      if (city.startsWith(q)) s = 50
      else if (name.startsWith(q)) s = 40
      else if (city.includes(q) || name.includes(q)) s = 20
      else if (a.country.toLowerCase().includes(q)) s = 8
    }
    if (s >= 0) scored.push({ a, s: s + (a.big ? 5 : 0) })
  }
  scored.sort((x, y) => y.s - x.s || x.a.city.localeCompare(y.a.city))
  return scored.slice(0, limit).map((x) => x.a)
}
