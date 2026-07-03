// Runway geometry for realistic takeoffs and landings. The runways dataset
// has the longest runway per airport as `{ lengthM, ident }` (e.g. "18R/36L");
// the ident encodes the magnetic heading (18 → ~180°). We synthesise the strip
// as a line through the airport reference point, pick the end best aligned
// with the route, and generate: threshold → ground roll → straight initial
// climb → smooth turn onto the route, and mirrored for the arrival with a
// long straight final and a roll-out that stops ON the runway.

import type { Airport } from '../types'
import { bearing, distanceKm, type LngLat } from './geo'
import runwaysData from '../data/runways.json'

interface RunwayRow {
  lengthM: number
  ident: string
  /** surveyed runway ends: [ident, lat, lon] per end (OurAirports, public domain) */
  ends?: [string, number, number][]
}

const RUNWAYS = runwaysData as unknown as Record<string, RunwayRow>

export interface RunwayInfo {
  /** direction of travel along the runway in degrees (ident × 10) */
  headingDeg: number
  /** runway end ident for the chosen direction, e.g. "18R" */
  ident: string
  /** start of the takeoff roll / landing threshold */
  threshold: LngLat
  /** far end of the strip */
  end: LngLat
  lengthM: number
  /** surveyed geometry: the strip in the satellite imagery IS this runway */
  real?: boolean
}



// local flat-earth offsets — plenty accurate at runway/approach scales
const M_PER_DEG_LAT = 110540
const mPerDegLon = (lat: number) => Math.max(1e-6, 111320 * Math.cos((lat * Math.PI) / 180))

const wrapLon = (lon: number) => (lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon)

function offsetM(p: LngLat, headingDeg: number, distM: number): LngLat {
  const rad = (headingDeg * Math.PI) / 180
  return [
    wrapLon(p[0] + (Math.sin(rad) * distM) / mPerDegLon(p[1])),
    p[1] + (Math.cos(rad) * distM) / M_PER_DEG_LAT,
  ]
}

function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** parse "18R/36L" into usable runway ends (heading + label) */
function parseEnds(ident: string): { headingDeg: number; ident: string }[] {
  const out: { headingDeg: number; ident: string }[] = []
  for (const e of ident.split('/')) {
    const label = e.trim()
    const num = parseInt(label, 10)
    if (!Number.isFinite(num) || num < 1 || num > 36) continue
    out.push({ headingDeg: (num * 10) % 360, ident: label })
  }
  if (out.length === 1) {
    // single-ended data: synthesise the reciprocal end
    const rec = (out[0].headingDeg + 180) % 360
    out.push({ headingDeg: rec, ident: String(Math.round(rec / 10) || 36).padStart(2, '0') })
  }
  return out
}

/** the runway end best aligned with the desired course, or null without data */
export function runwayFor(airport: Airport, courseDeg: number): RunwayInfo | null {
  const data = RUNWAYS[airport.iata]
  // surveyed ends: roll on the actual runway visible in the satellite imagery
  if (data?.ends && data.ends.length === 2) {
    const [e0, e1] = data.ends
    const cands = [
      { from: e0, to: e1 },
      { from: e1, to: e0 },
    ].map((c) => {
      const threshold: LngLat = [c.from[2], c.from[1]]
      const end: LngLat = [c.to[2], c.to[1]]
      return {
        ident: c.from[0],
        headingDeg: bearing(threshold, end),
        threshold,
        end,
        lengthM: data.lengthM,
        real: true,
      }
    })
    cands.sort((x, y) => angDiff(x.headingDeg, courseDeg) - angDiff(y.headingDeg, courseDeg))
    return cands[0]
  }
  if (!data || !data.lengthM) return null
  const ends = parseEnds(data.ident)
  if (!ends.length) return null
  ends.sort((x, y) => angDiff(x.headingDeg, courseDeg) - angDiff(y.headingDeg, courseDeg))
  const pick = ends[0]
  const arp: LngLat = [airport.lon, airport.lat]
  const half = data.lengthM / 2
  return {
    headingDeg: pick.headingDeg,
    ident: pick.ident,
    threshold: offsetM(arp, pick.headingDeg + 180, half),
    end: offsetM(arp, pick.headingDeg, half),
    lengthM: data.lengthM,
  }
}

/**
 * Turn-then-straight join, the way a real aircraft flies it: bank into a
 * constant-radius arc until the heading points at the target, then roll out
 * and fly straight. No overshoot, bounded curvature. Returns the arc samples
 * (the straight leg to `to` is implicit). Empty result = target unreachable
 * with this radius (caller keeps a direct join).
 */
function turnJoin(from: LngLat, fromDirDeg: number, to: LngLat, radiusKm: number): LngLat[] {
  const mLat = 110.54
  const mLon = Math.max(1e-6, 111.32 * Math.cos((from[1] * Math.PI) / 180))
  let dLon = to[0] - from[0]
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  const tx = dLon * mLon
  const ty = (to[1] - from[1]) * mLat
  const h = (fromDirDeg * Math.PI) / 180
  const ux = Math.sin(h)
  const uy = Math.cos(h)
  const sidePref = ux * ty - uy * tx >= 0 ? 1 : -1 // turn towards the target

  for (const side of [sidePref, -sidePref]) {
    // circle centre perpendicular to the current heading
    const cx = -uy * side * radiusKm
    const cy = ux * side * radiusKm
    const dx = tx - cx
    const dy = ty - cy
    const d = Math.hypot(dx, dy)
    if (d <= radiusKm * 1.02) continue // target inside the turn circle
    const beta = Math.atan2(dy, dx)
    const gamma = Math.acos(radiusKm / d)
    for (const cand of [beta + gamma, beta - gamma]) {
      // roll-out point on the circle + its tangent direction for this side
      const qx = cx + radiusKm * Math.cos(cand)
      const qy = cy + radiusKm * Math.sin(cand)
      const tanX = side === 1 ? -Math.sin(cand) : Math.sin(cand)
      const tanY = side === 1 ? Math.cos(cand) : -Math.cos(cand)
      const gx = tx - qx
      const gy = ty - qy
      const gl = Math.hypot(gx, gy)
      if (gl < 1e-6 || (tanX * gx + tanY * gy) / gl < 0.999) continue
      const theta0 = Math.atan2(-cy, -cx)
      let sweep = side === 1 ? cand - theta0 : theta0 - cand
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const steps = Math.max(2, Math.ceil((sweep * 180) / Math.PI / 6))
      const pts: LngLat[] = []
      for (let k = 1; k <= steps; k++) {
        const th = theta0 + side * (sweep * k) / steps
        const x = cx + radiusKm * Math.cos(th)
        const y = cy + radiusKm * Math.sin(th)
        let lon = from[0] + x / mLon
        if (lon > 180) lon -= 360
        if (lon < -180) lon += 360
        pts.push([lon, from[1] + y / mLat])
      }
      return pts
    }
  }
  return []
}

/** course between two nearby points, degrees */
function courseBetween(a: LngLat, b: LngLat): number {
  return bearing(a, b)
}

// real jet physics on the runway: max-thrust roll of ~2.1 m/s² lifts a 747
// off after ~1.6 km (NOT the whole strip), and reversers+autobrake stop it in
// ~1.4 km after touchdown. The flight profile pins its ground phases to these
// exact geometric lengths, so keep them in sync via takeoffRollM/landingRollM.
export function takeoffRollM(rw: RunwayInfo): number {
  return Math.min(1600, rw.lengthM * 0.85)
}
export function landingRollM(rw: RunwayInfo): number {
  return Math.min(1400, rw.lengthM * 0.75)
}

/** threshold → ground roll → straight initial climb → banked turn onto the route */
export function departurePath(
  rw: RunwayInfo,
  firstFix: LngLat,
): { points: LngLat[]; groundM: number } {
  const rollM = takeoffRollM(rw)
  const pts: LngLat[] = []
  // liftoff after the physical takeoff roll, well before the end of the strip
  for (let i = 0; i <= 4; i++) {
    pts.push(offsetM(rw.threshold, rw.headingDeg, (rollM * i) / 4))
  }
  // climb straight ahead past the runway end before any turn (like a real SID)
  const climbEnd = offsetM(rw.end, rw.headingDeg, 2800)
  pts.push(climbEnd)
  pts.push(...turnJoin(climbEnd, rw.headingDeg, firstFix, 3))
  return { points: pts, groundM: rollM }
}

/** banked turn onto a long straight final → threshold → roll out on the strip */
export function arrivalPath(
  rw: RunwayInfo,
  lastFix: LngLat,
): { points: LngLat[]; groundM: number } {
  const approach = (rw.headingDeg + 180) % 360
  const finalStart = offsetM(rw.threshold, approach, 9000) // ~9 km final
  const pts: LngLat[] = []
  // construct the turn backwards from the final: leaving finalStart on the
  // reciprocal heading and joining lastFix, then reverse — so the aircraft
  // arrives at the final exactly runway-aligned
  pts.push(...turnJoin(finalStart, approach, lastFix, 2.5).reverse())
  pts.push(finalStart)
  pts.push(offsetM(rw.threshold, approach, 4500))
  pts.push(offsetM(rw.threshold, approach, 1500))
  pts.push(rw.threshold)
  // braking distance with reversers + autobrake — stop ON the strip
  const rollM = landingRollM(rw)
  for (let i = 1; i <= 3; i++) {
    pts.push(offsetM(rw.threshold, rw.headingDeg, rollM * (i / 3)))
  }
  return { points: pts, groundM: rollM }
}
