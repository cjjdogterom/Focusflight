import type { Aircraft } from '../types'

// Realistic block-to-block flight profile, based on real airline procedure:
//  - takeoff roll at max thrust: ~2.1 m/s² -> Vr (747: ≈ 160 kt) in ±39 s
//    over ~1.6 km — the map position is PINNED to this: during the roll the
//    aircraft covers exactly the runway-roll geometry with constant real
//    acceleration, whatever the session length
//  - initial climb at 3000-3600 ft/min to 10,000 ft, accelerating quickly to
//    the 250 kt IAS limit; above 10,000 ft accelerate to cruise while the
//    climb rate tapers; cruise; ~2200 ft/min descent; slower approach
//  - landing roll: touchdown at ~0.94·Vr, then reversers + autobrake at the
//    real deceleration until standstill — also pinned to the roll-out
//    geometry, so braking looks exactly as fast as in reality
// The airborne part in between is scaled to fill the remaining session time
// over the remaining route distance (focus time = flight time).

export interface Telemetry {
  speedKmh: number
  altitudeM: number
}

export interface FlightProfile {
  distFrac(tSec: number): number
  telemetry(tSec: number): Telemetry
  segments: { roll: number; climb: number; cruise: number; descent: number; landRoll: number }
}

export interface ProfileGeometry {
  /** arc length of the full route geometry (route.points), km */
  pathKm: number
  /** metres of takeoff-roll geometry at the start of the path */
  depRollM: number
  /** metres of roll-out geometry at the end of the path */
  arrRollM: number
}

interface Seg {
  dur: number
  v0: number
  v1: number
  vExp: number // speed easing exponent: <1 = front-loaded (fast early)
  a0: number
  a1: number
  aExp: number // altitude easing exponent
}

interface ClassPerf {
  accel: number // takeoff-roll acceleration m/s² (max thrust)
  initClimb: number // m/s below 10,000 ft (3000+ ft/min for jets)
  highClimb: number // average m/s above 10,000 ft
  lowAltSpeed: number // ~250 kt IAS limit as ground speed, km/h
}

function perf(a: Aircraft): ClassPerf {
  switch (a.body) {
    case 'widebody':
      return { accel: 2.1, initClimb: 16, highClimb: 9.5, lowAltSpeed: 490 }
    case 'narrowbody':
      return { accel: 2.3, initClimb: 15, highClimb: 10, lowAltSpeed: 480 }
    case 'regional':
      return { accel: 2.4, initClimb: 14, highClimb: 10, lowAltSpeed: 470 }
    case 'prop':
    default:
      return { accel: 2.0, initClimb: 9, highClimb: 6, lowAltSpeed: 400 }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const TEN_K = 3048 // 10,000 ft in metres

export function buildProfile(
  durationSec: number,
  aircraft: Aircraft,
  geo: ProfileGeometry,
): FlightProfile {
  const p = perf(aircraft)
  const cruise = aircraft.cruiseKmh
  const alt = aircraft.cruiseAltM
  const midAlt = Math.min(TEN_K, alt * 0.45)

  const pathM = Math.max(geo.pathKm * 1000, geo.depRollM + geo.arrRollM + 1000)
  const depRollM = geo.depRollM
  const arrRollM = geo.arrRollM

  // --- pinned runway physics -------------------------------------------
  // takeoff: constant max-thrust acceleration over exactly the roll geometry
  let tRoll = Math.sqrt((2 * depRollM) / p.accel)
  // landing: touchdown at 0.94·Vr, constant braking over the roll-out
  const vrMs = p.accel * tRoll
  const vTdMs = vrMs * 0.94
  let tLand = (2 * arrRollM) / vTdMs // stops in tLand at decel vTd/tLand

  // degenerate guard (sessions shorter than any real UI flow produces):
  // compress the ground phases, distance stays pinned so accel scales up
  const ground = tRoll + tLand
  if (ground > durationSec * 0.4) {
    const g = (durationSec * 0.4) / ground
    tRoll *= g
    tLand *= g
  }
  // effective ground kinematics — equal to the real values unless compressed
  const aEff = (2 * depRollM) / (tRoll * tRoll)
  const vrEff = aEff * tRoll
  const vTdEff = (2 * arrRollM) / tLand
  const dBrake = vTdEff / tLand
  const vrK = vrEff * 3.6
  const vTdK = vTdEff * 3.6

  // --- airborne middle: fills the remaining time and distance -----------
  const tMid = Math.max(1, durationSec - tRoll - tLand)
  const midM = Math.max(1, pathM - depRollM - arrRollM)

  const tClimbA = midAlt / p.initClimb
  const tClimbB = Math.max(0, alt - midAlt) / p.highClimb
  const tDescA = Math.max(0, alt - midAlt) / 11 // ~2200 ft/min
  const tDescB = midAlt / 6.5 // approach

  let k = 1
  const fixed = tClimbA + tClimbB + tDescA + tDescB
  if (fixed > tMid * 0.8) k = (tMid * 0.8) / fixed

  const segs: Seg[] = [
    // initial climb: rotate & climb hard, accelerate quickly to the 250kt regime
    { dur: tClimbA * k, v0: vrK, v1: p.lowAltSpeed, vExp: 0.4, a0: 0, a1: midAlt, aExp: 0.9 },
    // high climb: accelerate to cruise TAS while the rate tapers
    { dur: tClimbB * k, v0: p.lowAltSpeed, v1: cruise, vExp: 0.55, a0: midAlt, a1: alt, aExp: 0.85 },
    // cruise (duration filled below)
    { dur: 0, v0: cruise, v1: cruise, vExp: 1, a0: alt, a1: alt, aExp: 1 },
    // descent: hold speed long, bleed off late
    { dur: tDescA * k, v0: cruise, v1: p.lowAltSpeed, vExp: 1.7, a0: alt, a1: midAlt, aExp: 1.1 },
    // approach, ending at touchdown speed over the threshold
    { dur: tDescB * k, v0: p.lowAltSpeed, v1: vTdK, vExp: 1.2, a0: midAlt, a1: 0, aExp: 1.05 },
  ]
  const used = segs.reduce((s, g) => s + g.dur, 0)
  segs[2].dur = Math.max(0, tMid - used)

  const starts: number[] = []
  let acc = 0
  for (const s of segs) {
    starts.push(acc)
    acc += s.dur
  }

  // evaluate the airborne profile at tm seconds into the middle phase
  const evalMid = (tm: number): { v: number; a: number } => {
    const t = Math.max(0, Math.min(tMid, tm))
    for (let i = segs.length - 1; i >= 0; i--) {
      if (t >= starts[i]) {
        const s = segs[i]
        const f = s.dur > 0 ? clamp01((t - starts[i]) / s.dur) : 1
        return {
          v: lerp(s.v0, s.v1, Math.pow(f, s.vExp)),
          a: lerp(s.a0, s.a1, Math.pow(f, s.aExp)),
        }
      }
    }
    return { v: vrK, a: 0 }
  }

  // integrate the middle speeds -> normalized distance table for the middle
  const N = 720
  const cum = new Float64Array(N + 1)
  const dt = tMid / N
  for (let i = 1; i <= N; i++) {
    cum[i] = cum[i - 1] + evalMid((i - 0.5) * dt).v * dt
  }
  const total = cum[N] || 1
  for (let i = 0; i <= N; i++) cum[i] /= total

  const midFrac = (tm: number): number => {
    const x = clamp01(tm / tMid) * N
    const i = Math.min(N - 1, Math.floor(x))
    return cum[i] + (cum[i + 1] - cum[i]) * (x - i)
  }

  return {
    distFrac(tSec: number): number {
      const t = Math.max(0, Math.min(durationSec, tSec))
      if (t <= tRoll) {
        // constant acceleration over exactly the runway-roll geometry
        return (0.5 * aEff * t * t) / pathM
      }
      if (t < durationSec - tLand) {
        return (depRollM + midFrac(t - tRoll) * midM) / pathM
      }
      // constant braking over exactly the roll-out geometry
      const tau = Math.min(tLand, t - (durationSec - tLand))
      const brakeDist = vTdEff * tau - 0.5 * dBrake * tau * tau
      return Math.min(1, (depRollM + midM + brakeDist) / pathM)
    },
    telemetry(tSec: number): Telemetry {
      const t = Math.max(0, Math.min(durationSec, tSec))
      if (t <= tRoll) {
        return { speedKmh: Math.round(aEff * t * 3.6), altitudeM: 0 }
      }
      if (t < durationSec - tLand) {
        const { v, a } = evalMid(t - tRoll)
        return { speedKmh: Math.round(v), altitudeM: Math.round(a) }
      }
      const tau = Math.min(tLand, t - (durationSec - tLand))
      return { speedKmh: Math.round(Math.max(0, (vTdEff - dBrake * tau) * 3.6)), altitudeM: 0 }
    },
    segments: {
      roll: tRoll,
      climb: segs[0].dur + segs[1].dur,
      cruise: segs[2].dur,
      descent: segs[3].dur + segs[4].dur,
      landRoll: tLand,
    },
  }
}
