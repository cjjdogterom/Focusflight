// Self-contained great-circle geometry (no external geo dependency).
// Produces evenly-spaced great-circle points so a marker moving by constant
// fraction travels at (near) constant ground speed.

export type LngLat = [number, number] // [lon, lat]

const R_KM = 6371.0088
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Great-circle (haversine) distance in kilometres. */
export function distanceKm(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Central angle (radians) between two points. */
function centralAngle(a: LngLat, b: LngLat): number {
  return distanceKm(a, b) / R_KM
}

/**
 * Sample `n` points along the great circle from a to b.
 * Longitudes are wrapped to [-180, 180]; the caller splits at the antimeridian
 * for rendering. Equal fraction steps == equal arc length.
 */
export function greatCirclePoints(a: LngLat, b: LngLat, n = 128): LngLat[] {
  const d = centralAngle(a, b)
  if (d < 1e-9) return [a, b]
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])]
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])]
  const sinD = Math.sin(d)
  const pts: LngLat[] = []
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    const A = Math.sin((1 - f) * d) / sinD
    const B = Math.sin(f * d) / sinD
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y))
    const lon = Math.atan2(y, x)
    pts.push([toDeg(lon), toDeg(lat)])
  }
  return pts
}

/** Initial bearing (degrees, 0..360, clockwise from north) from a to b. */
export function bearing(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const dLon = toRad(b[0] - a[0])
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Perpendicular (cross-track) distance in km of point p from the great circle a→b. */
export function crossTrackKm(a: LngLat, b: LngLat, p: LngLat): number {
  const dAP = distanceKm(a, p) / R_KM
  const brAP = toRad(bearing(a, p))
  const brAB = toRad(bearing(a, b))
  const s = Math.sin(dAP) * Math.sin(brAP - brAB)
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, s))) * R_KM)
}

/**
 * Interpolate a position at fraction t (0..1) along a pre-sampled point array,
 * and the heading at that point. Assumes points are ~equally spaced.
 */
export function positionAt(points: LngLat[], t: number): { pos: LngLat; heading: number } {
  const clamped = Math.max(0, Math.min(1, t))
  const last = points.length - 1
  const f = clamped * last
  const i = Math.min(last - 1, Math.floor(f))
  const frac = f - i
  const p0 = points[i]
  const p1 = points[i + 1]
  // Handle antimeridian wrap when interpolating longitude
  let lon0 = p0[0]
  let lon1 = p1[0]
  if (Math.abs(lon1 - lon0) > 180) {
    if (lon1 > lon0) lon0 += 360
    else lon1 += 360
  }
  let lon = lon0 + (lon1 - lon0) * frac
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360
  const lat = p0[1] + (p1[1] - p0[1]) * frac
  return { pos: [lon, lat], heading: bearing(p0, p1) }
}

/**
 * Resample a polyline (e.g. real airway waypoints, unevenly spaced) into `n`
 * points spaced equally by arc length, so a marker moving by constant fraction
 * travels at ~constant ground speed. Handles antimeridian crossings.
 */
export function densifyByDistance(coords: LngLat[], n = 240): LngLat[] {
  if (coords.length < 2) return coords
  const cum: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + Math.max(1e-6, distanceKm(coords[i - 1], coords[i])))
  }
  const total = cum[cum.length - 1]
  const out: LngLat[] = []
  let seg = 0
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total
    while (seg < coords.length - 2 && cum[seg + 1] < target) seg++
    const segLen = cum[seg + 1] - cum[seg]
    const frac = segLen > 0 ? (target - cum[seg]) / segLen : 0
    const a = coords[seg]
    const b = coords[seg + 1]
    let lon0 = a[0]
    let lon1 = b[0]
    if (Math.abs(lon1 - lon0) > 180) {
      if (lon1 > lon0) lon0 += 360
      else lon1 += 360
    }
    let lon = lon0 + (lon1 - lon0) * frac
    if (lon > 180) lon -= 360
    if (lon < -180) lon += 360
    out.push([lon, a[1] + (b[1] - a[1]) * frac])
  }
  return out
}

/**
 * Split a wrapped point array into segments at antimeridian jumps, returning
 * GeoJSON MultiLineString coordinates suitable for rendering without a seam.
 */
export function splitAtAntimeridian(points: LngLat[]): LngLat[][] {
  const segments: LngLat[][] = [[]]
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (i > 0 && Math.abs(p[0] - points[i - 1][0]) > 180) {
      segments.push([])
    }
    segments[segments.length - 1].push(p)
  }
  return segments.filter((s) => s.length > 1)
}
