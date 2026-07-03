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
/** index of the segment containing arc-length fraction `t` of the polyline */
export function indexAtFraction(points: LngLat[], t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  let total = 0
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    total += Math.max(1e-9, distanceKm(points[i - 1], points[i]))
    cum.push(total)
  }
  const target = clamped * total
  let i = 0
  while (i < points.length - 2 && cum[i + 1] < target) i++
  return i
}

export function positionAt(points: LngLat[], t: number): { pos: LngLat; heading: number } {
  const clamped = Math.max(0, Math.min(1, t))
  // interpolate by ARC LENGTH so unevenly spaced points (dense turn arcs,
  // sparse cruise legs) still give constant ground speed
  let total = 0
  const cum: number[] = [0]
  for (let k = 1; k < points.length; k++) {
    total += Math.max(1e-9, distanceKm(points[k - 1], points[k]))
    cum.push(total)
  }
  const target = clamped * total
  let i = 0
  while (i < points.length - 2 && cum[i + 1] < target) i++
  const segLen = cum[i + 1] - cum[i]
  const frac = segLen > 0 ? (target - cum[i]) / segLen : 0
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

/**
 * Round every sharp corner into a fly-by turn, like a real aircraft: start
 * turning BEFORE the waypoint along a tangent arc (quadratic Bézier with the
 * waypoint as control point). The turn radius scales with distance from the
 * nearest airport as a proxy for speed: tight (~2.5 km) on SID/STAR legs,
 * wide (~15 km) at cruise. Collinear stretches (runway roll, final) are
 * untouched because their turn angle is ~0.
 */
export function smoothTurns(coords: LngLat[]): LngLat[] {
  if (coords.length < 3) return coords
  const cum: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceKm(coords[i - 1], coords[i]))
  }
  const total = cum[cum.length - 1]
  const out: LngLat[] = [coords[0]]

  for (let i = 1; i < coords.length - 1; i++) {
    const P = coords[i]
    const A = out[out.length - 1] // previous OUTPUT point, so trims chain
    const B = coords[i + 1]
    const mLat = 110.54
    const mLon = Math.max(1e-6, 111.32 * Math.cos(toRad(P[1])))
    const unwrap = (lon: number) => {
      let d = lon - P[0]
      if (d > 180) d -= 360
      if (d < -180) d += 360
      return d
    }
    // local km frame centred on the corner
    const ax = unwrap(A[0]) * mLon
    const ay = (A[1] - P[1]) * mLat
    const bx = unwrap(B[0]) * mLon
    const by = (B[1] - P[1]) * mLat
    const dA = Math.hypot(ax, ay)
    const dB = Math.hypot(bx, by)
    if (dA < 1e-6 || dB < 1e-6) {
      out.push(P)
      continue
    }
    const u1x = ax / dA
    const u1y = ay / dA
    const u2x = bx / dB
    const u2y = by / dB
    const cosTurn = -(u1x * u2x + u1y * u2y)
    const theta = Math.acos(Math.max(-1, Math.min(1, cosTurn)))
    const thetaDeg = (theta * 180) / Math.PI
    // straight enough, or a deliberate hairpin (procedure turn): keep as-is
    if (thetaDeg < 12 || thetaDeg > 175) {
      out.push(P)
      continue
    }
    const dNear = Math.min(cum[i], total - cum[i])
    const radius = Math.min(15, Math.max(2.5, 2.5 + dNear * 0.12))
    let trim = radius * Math.tan(theta / 2)
    trim = Math.min(trim, dA * 0.45, dB * 0.45)
    if (trim < 0.15) {
      out.push(P)
      continue
    }
    // arc entry/exit in the local frame; corner P is the Bézier control (origin)
    const sx = u1x * trim
    const sy = u1y * trim
    const ex = u2x * trim
    const ey = u2y * trim
    const steps = Math.max(3, Math.ceil(thetaDeg / 8))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const w0 = (1 - t) * (1 - t)
      const w2 = t * t
      const x = w0 * sx + w2 * ex
      const y = w0 * sy + w2 * ey
      let lon = P[0] + x / mLon
      if (lon > 180) lon -= 360
      if (lon < -180) lon += 360
      out.push([lon, P[1] + y / mLat])
    }
  }
  out.push(coords[coords.length - 1])
  return out
}
