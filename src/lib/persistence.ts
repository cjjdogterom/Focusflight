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
