import { db } from './persistence'
import { crossTrackKm, distanceKm, type LngLat } from './geo'
import type { Airport } from '../types'

// Live waypoint routes for ANY airport pair, from the free Flight Plan Database
// API (real filed flight plans). Results are cached forever in IndexedDB, so
// each route is fetched at most once. Falls back silently (null) when the API
// is down, rate-limited or blocked — the caller then uses the built-in
// catalogue or a great-circle.

export type FetchedNode = [number, number, string] // [lon, lat, ident]

const API = 'https://api.flightplandatabase.com'
const inFlight = new Map<string, Promise<FetchedNode[] | null>>()

async function getJSON(url: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController()
  const t = window.setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    window.clearTimeout(t)
  }
}

interface PlanNode {
  lat?: number
  lon?: number
  ident?: string
}

async function fetchFromApi(from: Airport, to: Airport): Promise<FetchedNode[] | null> {
  const a: LngLat = [from.lon, from.lat]
  const b: LngLat = [to.lon, to.lat]
  const gcKm = distanceKm(a, b)

  const list = (await getJSON(
    `${API}/search/plans?fromICAO=${from.icao}&toICAO=${to.icao}&limit=8&sort=distance`,
    6000,
  )) as { id: number }[]
  if (!Array.isArray(list) || list.length === 0) return null

  let best: { nodes: FetchedNode[]; count: number; pathLen: number } | null = null
  for (const cand of list.slice(0, 4)) {
    let plan: { route?: { nodes?: PlanNode[] } }
    try {
      plan = (await getJSON(`${API}/plan/${cand.id}?include=route`, 6000)) as typeof plan
    } catch {
      continue
    }
    const nodes = (plan.route?.nodes ?? []).filter(
      (n) => typeof n.lat === 'number' && typeof n.lon === 'number',
    )
    if (nodes.length < 5) continue
    // quality: no wild detours from the great circle, sane total length
    let pathLen = 0
    let maxDev = 0
    for (let i = 0; i < nodes.length; i++) {
      const p: LngLat = [nodes[i].lon as number, nodes[i].lat as number]
      if (i > 0) pathLen += distanceKm([nodes[i - 1].lon as number, nodes[i - 1].lat as number], p)
      maxDev = Math.max(maxDev, crossTrackKm(a, b, p))
    }
    if (maxDev > Math.max(450, gcKm * 0.25) || pathLen > gcKm * 1.5) continue
    const mapped: FetchedNode[] = nodes.map((n) => [
      Math.round((n.lon as number) * 1000) / 1000,
      Math.round((n.lat as number) * 1000) / 1000,
      (n.ident ?? '').toString().slice(0, 6),
    ])
    if (!best || nodes.length > best.count) best = { nodes: mapped, count: nodes.length, pathLen }
  }
  return best?.nodes ?? null
}

/** cached fetch; returns null on any failure (caller falls back) */
export async function fetchRealRoute(from: Airport, to: Airport): Promise<FetchedNode[] | null> {
  const key = `${from.iata}-${to.iata}`
  try {
    const hit = await db.routes.get(key)
    if (hit) return hit.nodes
  } catch {
    /* cache unavailable */
  }
  const existing = inFlight.get(key)
  if (existing) return existing

  const p = (async () => {
    try {
      const nodes = await fetchFromApi(from, to)
      if (nodes && nodes.length >= 5) {
        await db.routes.put({ key, nodes, ts: Date.now() })
        // eslint-disable-next-line no-console
        console.log(`[routeFetch] echte route ${key}: ${nodes.length} waypoints`)
        return nodes
      }
      return null
    } catch {
      return null // API down / CORS / rate limit -> silent fallback
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, p)
  return p
}

/** fire-and-forget warm-up (called when a destination is picked) */
export function prefetchRoute(from: Airport | undefined, to: Airport | undefined): void {
  if (!from || !to) return
  void fetchRealRoute(from, to)
}
