// Passport stamps and milestone certificates — both are DERIVED from the
// flight log (no extra persistence), so they are retroactive and always
// consistent with the logbook.

import type { FlightLogEntry } from '../types'
import { airportByIata } from '../data/airports'
import { greatCirclePoints } from './geo'

// ---- passport: one stamp per country you have landed in ----

export interface PassportStamp {
  country: string
  /** IATA + city of the FIRST landing in this country */
  iata: string
  city: string
  firstAt: number
  landings: number
}

export function deriveStamps(flights: FlightLogEntry[]): PassportStamp[] {
  const chrono = [...flights].filter((f) => f.completed).sort((a, b) => a.endedAt - b.endedAt)
  const byCountry = new Map<string, PassportStamp>()
  for (const f of chrono) {
    const arr = airportByIata(f.toIata)
    if (!arr) continue
    const cur = byCountry.get(arr.country)
    if (cur) cur.landings++
    else
      byCountry.set(arr.country, {
        country: arr.country,
        iata: f.toIata,
        city: f.toCity,
        firstAt: f.endedAt,
        landings: 1,
      })
  }
  return [...byCountry.values()] // insertion order = chronological
}

// ---- certificates: understated one-time aviation firsts ----

export interface Certificate {
  id: string
  title: string
  detail: string
  routeLabel: string
  dateMs: number
}

export function deriveCertificates(flights: FlightLogEntry[]): Certificate[] {
  const chrono = [...flights].filter((f) => f.completed).sort((a, b) => a.endedAt - b.endedAt)
  const certs: Certificate[] = []
  const have = (id: string) => certs.some((c) => c.id === id)
  let recordKm = 0
  let recordCert: Certificate | null = null

  for (const f of chrono) {
    const from = airportByIata(f.fromIata)
    const to = airportByIata(f.toIata)
    if (!from || !to) continue
    const label = `${f.fromIata} → ${f.toIata}`

    if (!have('maiden'))
      certs.push({
        id: 'maiden',
        title: 'Eerste vlucht',
        detail: 'De allereerste focusvlucht in het logboek.',
        routeLabel: label,
        dateMs: f.endedAt,
      })

    const transatlantic =
      (from.lon > -25 && to.lon < -50) || (from.lon < -50 && to.lon > -25)
    if (transatlantic && !have('transatlantic'))
      certs.push({
        id: 'transatlantic',
        title: 'Trans-Atlantische oversteek',
        detail: 'Voor het eerst non-stop de Atlantische Oceaan over.',
        routeLabel: label,
        dateMs: f.endedAt,
      })

    if (from.lat * to.lat < 0 && !have('equator'))
      certs.push({
        id: 'equator',
        title: 'Evenaarspassage',
        detail: 'Voor het eerst de evenaar overgestoken.',
        routeLabel: label,
        dateMs: f.endedAt,
      })

    if (!have('polar')) {
      const pts = greatCirclePoints([from.lon, from.lat], [to.lon, to.lat], 48)
      if (pts.some((p) => Math.abs(p[1]) > 66.56))
        certs.push({
          id: 'polar',
          title: 'Poolroute',
          detail: 'Voor het eerst voorbij de poolcirkel gevlogen.',
          routeLabel: label,
          dateMs: f.endedAt,
        })
    }

    if (f.distanceKm > recordKm) {
      recordKm = f.distanceKm
      recordCert = {
        id: 'record',
        title: 'Langste vlucht ooit',
        detail: `${f.distanceKm.toLocaleString('nl-NL')} km non-stop — je verste vlucht tot nu toe.`,
        routeLabel: label,
        dateMs: f.endedAt,
      }
    }
  }

  // the distance record only becomes a certificate once there is competition
  if (recordCert && chrono.length >= 2) certs.push(recordCert)
  return certs.sort((a, b) => a.dateMs - b.dateMs)
}

/** certificates earned (or improved) by the flight that ended at `endedAt` */
export function certificatesEarnedAt(flights: FlightLogEntry[], endedAt: number): Certificate[] {
  return deriveCertificates(flights).filter((c) => c.dateMs === endedAt)
}
