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
 * Smooth turn between a runway-aligned point and the route, as a quadratic
 * Bézier whose runway-side tangent equals the runway heading. Degrees-space
 * interpolation is fine over the ~10–20 km these blends span.
 */
function blend(from: LngLat, to: LngLat, headingDeg: number, mode: 'out' | 'in'): LngLat[] {
  const gapM = distanceKm(from, to) * 1000
  // never longer than ~60% of the gap, or the curve overshoots its target
  const l = Math.min(6000, Math.max(Math.min(1200, gapM * 0.6), gapM * 0.4))
  const ctrl = mode === 'out' ? offsetM(from, headingDeg, l) : offsetM(to, headingDeg + 180, l)
  // unwrap longitudes around `from` so routes near the antimeridian stay local
  const un = (lon: number) => {
    let d = lon - from[0]
    if (d > 180) d -= 360
    if (d < -180) d += 360
    return from[0] + d
  }
  const cx = un(ctrl[0])
  const tx = un(to[0])
  const pts: LngLat[] = []
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1)
    const a = 1 - t
    pts.push([
      wrapLon(a * a * from[0] + 2 * a * t * cx + t * t * tx),
      a * a * from[1] + 2 * a * t * ctrl[1] + t * t * to[1],
    ])
  }
  return pts
}

/** threshold → ground roll → straight initial climb → turn towards the route */
export function departurePath(rw: RunwayInfo, firstFix: LngLat): LngLat[] {
  const pts: LngLat[] = []
  for (let i = 0; i <= 4; i++) {
    pts.push(offsetM(rw.threshold, rw.headingDeg, (rw.lengthM * i) / 4))
  }
  // climb straight ahead past the runway end before any turn (like a real SID)
  const climbEnd = offsetM(rw.end, rw.headingDeg, 2800)
  pts.push(climbEnd)
  pts.push(...blend(climbEnd, firstFix, rw.headingDeg, 'out'))
  return pts
}

/** turn onto a long straight final → threshold → roll out on the strip */
export function arrivalPath(rw: RunwayInfo, lastFix: LngLat): LngLat[] {
  const approach = (rw.headingDeg + 180) % 360
  const finalStart = offsetM(rw.threshold, approach, 9000) // ~9 km final
  const pts: LngLat[] = []
  pts.push(...blend(lastFix, finalStart, rw.headingDeg, 'in'))
  pts.push(finalStart)
  pts.push(offsetM(rw.threshold, approach, 4500))
  pts.push(offsetM(rw.threshold, approach, 1500))
  pts.push(rw.threshold)
  // decelerate on the runway and stop ~70% down the strip
  for (let i = 1; i <= 3; i++) {
    pts.push(offsetM(rw.threshold, rw.headingDeg, rw.lengthM * 0.7 * (i / 3)))
  }
  return pts
}
