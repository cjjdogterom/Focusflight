import { airportByIata } from '../data/airports'

// Real upcoming departures from Schiphol, via our own /api/flights proxy
// (see api/flights.js). You "check in" on one of these and fly it: the
// session gets the real flight number, gate, destination — and because the
// app already sets the focus duration to the real flight time for the
// route, checking in on KL1673 to Barcelona means focusing for ~2 hours.

export interface Departure {
  flightNo: string // "KL 1673"
  airline: string
  destIata: string
  destCity: string
  /** scheduled departure, local Schiphol time "HH:MM" */
  schedTime: string
  scheduleISO: string
  status: string | null // Dutch label, e.g. "Boarding"
  boarding: boolean
  gate: string | null
  demo?: boolean
}

// the big passenger names — cargo, bizjets and obscure charters stay out
const MAJORS: Record<string, string> = {
  KL: 'KLM',
  HV: 'Transavia',
  AF: 'Air France',
  LH: 'Lufthansa',
  BA: 'British Airways',
  EK: 'Emirates',
  EY: 'Etihad',
  QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',
  DL: 'Delta',
  UA: 'United',
  AA: 'American Airlines',
  TK: 'Turkish Airlines',
  LX: 'SWISS',
  OS: 'Austrian',
  SN: 'Brussels Airlines',
  SK: 'SAS',
  AY: 'Finnair',
  IB: 'Iberia',
  VY: 'Vueling',
  VS: 'Virgin Atlantic',
  CX: 'Cathay Pacific',
  KQ: 'Kenya Airways',
  GA: 'Garuda Indonesia',
  CI: 'China Airlines',
  KE: 'Korean Air',
  EW: 'Eurowings',
  A3: 'Aegean',
  LO: 'LOT',
  TP: 'TAP Portugal',
}

const STATUS_NL: Record<string, string> = {
  SCH: 'Gepland',
  DEL: 'Vertraagd',
  WIL: 'Wacht op indeling',
  GTO: 'Gate open',
  BRD: 'Boarding',
  GCL: 'Gate sluit',
  GTD: 'Gate dicht',
  GCH: 'Gate gewijzigd',
  TOM: 'Morgen',
}

interface RawFlight {
  name: string | null
  prefix: string | null
  schedule: string | null
  dest: string | null
  states: string[]
  gate: string | null
  aircraft: string | null
  serviceType: string | null
  mainFlight: string | null
}

function toDeparture(f: RawFlight): Departure | null {
  if (!f.name || !f.prefix || !f.dest || !f.schedule) return null
  const airline = MAJORS[f.prefix]
  if (!airline) return null
  if (f.serviceType && f.serviceType !== 'J') return null // scheduled passenger only
  if (f.mainFlight && f.mainFlight !== f.name) return null // skip codeshare shadows
  if (f.states.includes('DEP') || f.states.includes('CNX') || f.states.includes('TOM')) return null
  const airport = airportByIata(f.dest)
  if (!airport) return null
  const d = new Date(f.schedule)
  if (Number.isNaN(d.getTime())) return null
  const boarding = f.states.includes('BRD') || f.states.includes('GTO') || f.states.includes('GCL')
  const stateCode = ['BRD', 'GCL', 'GTO', 'DEL', 'GCH', 'SCH'].find((s) => f.states.includes(s))
  return {
    flightNo: f.name.replace(/^([A-Z0-9]{2})\s?0*/, '$1 '),
    airline,
    destIata: f.dest,
    destCity: airport.city,
    schedTime: d.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam',
    }),
    scheduleISO: f.schedule,
    status: stateCode ? STATUS_NL[stateCode] : null,
    boarding,
    gate: f.gate,
  }
}

export type DeparturesResult =
  | { kind: 'ok'; departures: Departure[] }
  | { kind: 'not-configured' }
  | { kind: 'unavailable' }

export async function fetchDepartures(): Promise<DeparturesResult> {
  try {
    const r = await fetch('/api/flights')
    if (r.status === 503) return { kind: 'not-configured' }
    if (!r.ok) throw new Error(`${r.status}`)
    const data = (await r.json()) as { flights: RawFlight[] }
    const seen = new Set<string>()
    const departures: Departure[] = []
    for (const raw of data.flights ?? []) {
      const dep = toDeparture(raw)
      if (!dep || seen.has(dep.flightNo)) continue
      seen.add(dep.flightNo)
      departures.push(dep)
    }
    departures.sort((a, b) => a.scheduleISO.localeCompare(b.scheduleISO))
    return { kind: 'ok', departures }
  } catch {
    // dev server has no /api — show a clearly marked demo board so the UI
    // can be exercised; production never takes this path
    if (import.meta.env.DEV) return { kind: 'ok', departures: demoBoard() }
    return { kind: 'unavailable' }
  }
}

function demoBoard(): Departure[] {
  const mk = (min: number) => {
    const d = new Date(Date.now() + min * 60000)
    return {
      iso: d.toISOString(),
      hm: d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    }
  }
  const rows: [string, string, string, string, string | null, string][] = [
    ['KL 1673', 'KLM', 'BCN', 'Barcelona', 'Boarding', 'B24'],
    ['KL 605', 'KLM', 'SFO', 'San Francisco', 'Gate open', 'E18'],
    ['AF 1241', 'Air France', 'CDG', 'Parijs', 'Gepland', 'C11'],
    ['EY 78', 'Etihad', 'AUH', 'Abu Dhabi', 'Gepland', 'F7'],
    ['KL 1775', 'KLM', 'BER', 'Berlijn', 'Gepland', 'B36'],
  ]
  return rows.map(([flightNo, airline, destIata, destCity, status, gate], i) => {
    const t = mk(12 + i * 25)
    return {
      flightNo,
      airline,
      destIata,
      destCity,
      schedTime: t.hm,
      scheduleISO: t.iso,
      status,
      boarding: status === 'Boarding' || status === 'Gate open',
      gate,
      demo: true,
    }
  })
}
