import type { Airport } from '../types'
import {
  greatCirclePoints,
  distanceKm,
  bearing,
  crossTrackKm,
  splitAtAntimeridian,
  smoothTurns,
  type LngLat,
} from './geo'
import { runwayFor, departurePath, arrivalPath, type RunwayInfo } from './runwayGeo'
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
  /** chosen runway ends, when runway data exists for the airports */
  runways?: { dep: RunwayInfo | null; arr: RunwayInfo | null }
  /** metres of ground roll at each end of `points` (takeoff roll / roll-out) —
   *  the flight profile pins its runway physics to exactly these lengths */
  groundM?: { dep: number; arr: number }
}

const ROUTE_CATALOG = routesData as unknown as Record<string, number[][]>

/**
 * Replace the raw airport endpoints of a path with real runway geometry:
 * a ground roll from the threshold, a straight initial climb and a smooth
 * turn onto the route; mirrored on arrival with a long straight final and a
 * roll-out that stops on the strip.
 */
function withRunways(
  from: Airport,
  to: Airport,
  coords: LngLat[],
): {
  coords: LngLat[]
  dep: RunwayInfo | null
  arr: RunwayInfo | null
  groundM: { dep: number; arr: number }
} {
  const a: LngLat = [from.lon, from.lat]
  const b: LngLat = [to.lon, to.lat]
  // without runway geometry the roll happens along the start/end of the route
  const noRunways = { dep: 1600, arr: 1400 }

  // first/last fixes far enough out that the blend has room to turn
  let fi = 1
  while (fi < coords.length - 1 && distanceKm(a, coords[fi]) < 6) fi++
  let li = coords.length - 2
  while (li > fi && distanceKm(b, coords[li]) < 12) li--
  if (li <= fi) return { coords, dep: null, arr: null, groundM: noRunways }

  const dep = runwayFor(from, bearing(a, coords[fi]))
  const arr = runwayFor(to, bearing(coords[li], b))

  // the sharper the course change between runway and route, the further out
  // the joining fix must be — a departure that doubles back needs a wide turn
  const angDiff = (x: number, y: number) => {
    const d = Math.abs(x - y) % 360
    return d > 180 ? 360 - d : d
  }
  if (dep) {
    const need = () => 6 + (angDiff(dep.headingDeg, bearing(a, coords[fi])) / 180) * 26
    while (fi < li - 1 && distanceKm(a, coords[fi]) < need()) fi++
  }
  if (arr) {
    const need = () => 12 + (angDiff(arr.headingDeg, bearing(coords[li], b)) / 180) * 26
    while (li > fi + 1 && distanceKm(b, coords[li]) < need()) li--
  }
  if (li <= fi) return { coords, dep: null, arr: null, groundM: noRunways }
  const inner = coords.slice(fi, li + 1)
  const depPath = dep ? departurePath(dep, coords[fi]) : null
  const arrPath = arr ? arrivalPath(arr, coords[li]) : null
  const out: LngLat[] = [
    ...(depPath ? depPath.points : [a]),
    ...inner,
    ...(arrPath ? arrPath.points : [b]),
  ]
  return {
    coords: out,
    dep,
    arr,
    groundM: {
      dep: depPath?.groundM ?? noRunways.dep,
      arr: arrPath?.groundM ?? noRunways.arr,
    },
  }
}

function buildRoute(
  from: Airport,
  to: Airport,
  path: LngLat[],
  waypoints: RouteWaypoint[],
  source: 'real' | 'great-circle',
): Route {
  const gcKm = distanceKm([from.lon, from.lat], [to.lon, to.lat])
  // fly-by turns first: real aircraft start turning before the waypoint, and
  // the runway blends then attach tangentially to the already-smooth path
  const built = withRunways(from, to, smoothTurns(path))
  // second pass rounds the roll-out/route junctions; straight stretches
  // (runway, final) and existing arcs are below the threshold and untouched
  const coords = smoothTurns(built.coords)
  const { dep, arr } = built
  // waypoints hugging the airports are trimmed from the geometry; drop them
  // from the chart too, or the planned line would point at ghost fixes
  const keptWaypoints = waypoints.filter(
    (w) =>
      distanceKm([from.lon, from.lat], [w.lon, w.lat]) >= 6 &&
      distanceKm([to.lon, to.lat], [w.lon, w.lat]) >= 12,
  )
  return {
    from,
    to,
    points: coords,
    segments: splitAtAntimeridian(coords),
    waypoints: keptWaypoints,
    distanceKm: gcKm,
    source,
    chart: true,
    runways: { dep, arr },
    groundM: built.groundM,
  }
}

function curatedRoute(from: Airport, to: Airport, list: CuratedWaypoint[]): Route {
  const coords: LngLat[] = list.map((w) => [w.lon, w.lat])
  const waypoints: RouteWaypoint[] = list
    .filter((w) => w.type !== 'AIRPORT')
    .map((w) => ({ lon: w.lon, lat: w.lat, id: w.ident, type: w.type, segment: w.segment, airway: w.airway }))
  return buildRoute(from, to, coords, waypoints, 'real')
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
    let pathKm = distanceKm(a, coords[0]) + distanceKm(coords[coords.length - 1], b)
    for (let i = 1; i < coords.length; i++) pathKm += distanceKm(coords[i - 1], coords[i])
    if (maxDev <= devCap && pathKm <= gcKm * 1.4) {
      const path: LngLat[] = [a, ...coords, b]
      const waypoints: RouteWaypoint[] = catalog.map((n) => ({
        lon: n[0],
        lat: n[1],
        id: typeof n[2] === 'string' ? (n[2] as unknown as string) : '',
        type: 'FIX',
        segment: 'ENROUTE',
        airway: '',
      }))
      return buildRoute(from, to, path, waypoints, 'real')
    }
  }

  return buildRoute(from, to, greatCirclePoints(a, b, 700), [], 'great-circle')
}
