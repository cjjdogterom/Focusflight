import type { Airport } from '../types'
import {
  greatCirclePoints,
  densifyByDistance,
  distanceKm,
  crossTrackKm,
  splitAtAntimeridian,
  type LngLat,
} from './geo'
import routesData from '../data/routes.json'
import { AMS_BCN_ROUTE, type CuratedWaypoint, type RouteSegment, type WaypointType } from '../data/routeAmsBcn'

export type { WaypointType, RouteSegment }

export interface RouteWaypoint {
  lon: number
  lat: number
  id: string
  type: WaypointType
  segment: RouteSegment
  airway: string
}

export interface Route {
  from: Airport
  to: Airport
  points: LngLat[]
  segments: LngLat[][]
  waypoints: RouteWaypoint[]
  distanceKm: number
  source: 'real' | 'great-circle'
  /** render as a detailed IFR navigation chart (curated corridor) */
  chart: boolean
}

const ROUTE_CATALOG = routesData as unknown as Record<string, number[][]>

function curatedRoute(from: Airport, to: Airport, list: CuratedWaypoint[]): Route {
  const coords: LngLat[] = list.map((w) => [w.lon, w.lat])
  const waypoints: RouteWaypoint[] = list
    .filter((w) => w.type !== 'AIRPORT')
    .map((w) => ({ lon: w.lon, lat: w.lat, id: w.ident, type: w.type, segment: w.segment, airway: w.airway }))
  return {
    from,
    to,
    points: densifyByDistance(coords, 900),
    segments: splitAtAntimeridian(coords),
    waypoints,
    distanceKm: distanceKm([from.lon, from.lat], [to.lon, to.lat]),
    source: 'real',
    chart: true,
  }
}

/** reverse a curated route (swap SID<->STAR labels) */
function reversed(list: CuratedWaypoint[]): CuratedWaypoint[] {
  const swap: Record<RouteSegment, RouteSegment> = { SID: 'STAR', STAR: 'SID', ENROUTE: 'ENROUTE' }
  return [...list].reverse().map((w) => ({ ...w, segment: swap[w.segment] }))
}

export function getRoute(
  from: Airport,
  to: Airport,
  fetched?: [number, number, string][] | null,
): Route {
  // Curated, chart-grade IFR route for the AMS–BCN corridor.
  if (from.iata === 'AMS' && to.iata === 'BCN') return curatedRoute(from, to, AMS_BCN_ROUTE)
  if (from.iata === 'BCN' && to.iata === 'AMS') return curatedRoute(from, to, reversed(AMS_BCN_ROUTE))

  const a: LngLat = [from.lon, from.lat]
  const b: LngLat = [to.lon, to.lat]
  const gcKm = distanceKm(a, b)
  // live-fetched real flight plan (named waypoints) takes priority
  const catalog = (fetched && fetched.length >= 5 ? fetched : null) ?? ROUTE_CATALOG[`${from.iata}-${to.iata}`]

  if (catalog && catalog.length >= 5) {
    const coords: LngLat[] = catalog.map((n) => [n[0], n[1]])
    const devCap = Math.max(450, gcKm * 0.25)
    let maxDev = 0
    for (const p of coords) maxDev = Math.max(maxDev, crossTrackKm(a, b, p))
    if (maxDev <= devCap) {
      const path: LngLat[] = [a, ...coords, b]
      const waypoints: RouteWaypoint[] = catalog.map((n) => ({
        lon: n[0],
        lat: n[1],
        id: typeof n[2] === 'string' ? (n[2] as unknown as string) : '',
        type: 'FIX',
        segment: 'ENROUTE',
        airway: '',
      }))
      return {
        from,
        to,
        points: densifyByDistance(path, 700),
        segments: splitAtAntimeridian(path),
        waypoints,
        distanceKm: gcKm,
        source: 'real',
        chart: true,
      }
    }
  }

  const points = greatCirclePoints(a, b, 700)
  return {
    from,
    to,
    points,
    segments: splitAtAntimeridian(points),
    waypoints: [],
    distanceKm: gcKm,
    source: 'great-circle',
    chart: true,
  }
}
