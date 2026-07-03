import Dexie, { type Table } from 'dexie'
import type { FlightLogEntry } from '../types'

export interface Setting {
  key: string
  value: unknown
}

export interface RouteCacheRow {
  key: string
  nodes: [number, number, string][]
  ts: number
}

class FocusFlightDB extends Dexie {
  flights!: Table<FlightLogEntry, string>
  settings!: Table<Setting, string>
  routes!: Table<RouteCacheRow, string>

  constructor() {
    super('focusflight')
    this.version(1).stores({
      flights: 'id, startedAt, completed',
      settings: 'key',
    })
    this.version(2).stores({
      flights: 'id, startedAt, completed',
      settings: 'key',
      routes: 'key',
    })
  }
}

export const db = new FocusFlightDB()

export async function saveFlight(entry: FlightLogEntry): Promise<void> {
  await db.flights.put(entry)
}

export async function deleteFlight(id: string): Promise<void> {
  await db.flights.delete(id)
}

export async function getFlightById(id: string): Promise<FlightLogEntry | undefined> {
  return db.flights.get(id)
}

export async function allFlights(): Promise<FlightLogEntry[]> {
  const rows = await db.flights.orderBy('startedAt').reverse().toArray()
  return rows
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

// ---------------------------------------------------------------------------
// Active-flight snapshot: lets a started flight survive a reload, a closed
// tab or an offline period. The clock is a wall-time anchor — "at wall time
// `wallMs` the elapsed flight time was `elapsedMs` (and it was running)" —
// so restore never depends on the app having been open in between.

export interface ActiveFlightClock {
  elapsedMs: number
  running: boolean
  wallMs: number
}

export interface ActiveFlightRecord {
  /** serialized store ActiveFlight (typed as unknown to avoid an import cycle) */
  active: unknown
  squawks: string[]
  clock: ActiveFlightClock
}

const ACTIVE_KEY = 'activeFlight'

export async function saveActiveFlight(rec: ActiveFlightRecord | null): Promise<void> {
  await db.settings.put({ key: ACTIVE_KEY, value: rec })
}

export async function loadActiveFlight(): Promise<ActiveFlightRecord | null> {
  const row = await db.settings.get(ACTIVE_KEY)
  return (row?.value as ActiveFlightRecord | null) ?? null
}

export async function patchActiveFlight(patch: Partial<ActiveFlightRecord>): Promise<void> {
  // one readwrite transaction, so a patch can never resurrect a record that a
  // concurrent finish/abort just cleared (it either commits first or sees null)
  await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get(ACTIVE_KEY)
    const cur = (row?.value as ActiveFlightRecord | null) ?? null
    if (!cur) return
    await db.settings.put({ key: ACTIVE_KEY, value: { ...cur, ...patch } })
  })
}
