import type { Aircraft } from '../types'

// Realistic block-to-block flight profile, based on real airline procedure:
//  - takeoff roll at max thrust: ~2.1 m/s² -> Vr in ±35-40 s (747: Vr ≈ 160 kt)
//  - initial climb immediately after rotation at 3000-3600 ft/min to 10,000 ft,
//    accelerating quickly to the 250 kt IAS limit (~490 km/h GS)
//  - above 10,000 ft: accelerate to ~300 kt / Mach .84 while the climb rate
//    tapers off; top of climb after ±15-18 min
//  - cruise, then a ~2200 ft/min descent, a slower approach segment and a
//    landing roll on the arrival runway.
// Ground speed is integrated into a distance table so the position on the map
// follows the true (non-linear) speed.

export interface Telemetry {
  speedKmh: number
  altitudeM: number
}

export interface FlightProfile {
  distFrac(tSec: number): number
  telemetry(tSec: number): Telemetry
  segments: { roll: number; climb: number; cruise: number; descent: number; landRoll: number }
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
  vr: number // rotation speed km/h
  accel: number // takeoff-roll acceleration m/s²
  initClimb: number // m/s below 10,000 ft (3000+ ft/min for jets)
  highClimb: number // average m/s above 10,000 ft
  lowAltSpeed: number // ~250 kt IAS limit as ground speed, km/h
}

function perf(a: Aircraft): ClassPerf {
  switch (a.body) {
    case 'widebody':
      return { vr: 295, accel: 2.1, initClimb: 16, highClimb: 9.5, lowAltSpeed: 490 }
    case 'narrowbody':
      return { vr: 270, accel: 2.3, initClimb: 15, highClimb: 10, lowAltSpeed: 480 }
    case 'regional':
      return { vr: 250, accel: 2.4, initClimb: 14, highClimb: 10, lowAltSpeed: 470 }
    case 'prop':
    default:
      return { vr: 195, accel: 2.0, initClimb: 9, highClimb: 6, lowAltSpeed: 400 }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const TEN_K = 3048 // 10,000 ft in metres

export function buildProfile(
  durationSec: number,
  aircraft: Aircraft,
  depRunwayM: number,
  arrRunwayM: number,
): FlightProfile {
  const p = perf(aircraft)
  const vrMs = p.vr / 3.6
  const cruise = aircraft.cruiseKmh
  const alt = aircraft.cruiseAltM
  const midAlt = Math.min(TEN_K, alt * 0.45)

  // takeoff roll: full thrust; distance capped by the real runway
  const rollDist = Math.min((vrMs * vrMs) / (2 * p.accel), depRunwayM * 0.85)
  const tRoll = (2 * rollDist) / vrMs

  const tClimbA = midAlt / p.initClimb
  const tClimbB = Math.max(0, alt - midAlt) / p.highClimb
  const tDescA = Math.max(0, alt - midAlt) / 11 // ~2200 ft/min
  const tDescB = midAlt / 6.5 // approach
  const vTd = p.vr * 0.94 // touchdown speed
  const tLand = Math.min(45, (arrRunwayM * 0.55 * 2) / (vTd / 3.6))

  // fit into the session (keep >= 20% cruise for very short flights)
  let k = 1
  const fixed = tRoll + tClimbA + tClimbB + tDescA + tDescB + tLand
  if (fixed > durationSec * 0.8) k = (durationSec * 0.8) / fixed

  const segs: Seg[] = [
    // takeoff roll: 0 -> Vr, altitude 0 (speed grows ~linearly with t at max thrust)
    { dur: tRoll * k, v0: 0, v1: p.vr, vExp: 1, a0: 0, a1: 0, aExp: 1 },
    // initial climb: rotate & climb hard, accelerate quickly to the 250kt regime
    { dur: tClimbA * k, v0: p.vr, v1: p.lowAltSpeed, vExp: 0.4, a0: 0, a1: midAlt, aExp: 0.9 },
    // high climb: accelerate to cruise TAS while the rate tapers
    { dur: tClimbB * k, v0: p.lowAltSpeed, v1: cruise, vExp: 0.55, a0: midAlt, a1: alt, aExp: 0.85 },
    // cruise (duration filled below)
    { dur: 0, v0: cruise, v1: cruise, vExp: 1, a0: alt, a1: alt, aExp: 1 },
    // descent: hold speed long, bleed off late
    { dur: tDescA * k, v0: cruise, v1: p.lowAltSpeed, vExp: 1.7, a0: alt, a1: midAlt, aExp: 1.1 },
    // approach
    { dur: tDescB * k, v0: p.lowAltSpeed, v1: vTd, vExp: 1.2, a0: midAlt, a1: 0, aExp: 1.05 },
    // landing roll
    { dur: tLand * k, v0: vTd, v1: 0, vExp: 1, a0: 0, a1: 0, aExp: 1 },
  ]
  const used = segs.reduce((s, g) => s + g.dur, 0)
  segs[3].dur = Math.max(0, durationSec - used)

  const starts: number[] = []
  let acc = 0
  for (const s of segs) {
    starts.push(acc)
    acc += s.dur
  }

  const evalAt = (tSec: number): { v: number; a: number } => {
    const t = Math.max(0, Math.min(durationSec, tSec))
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
    return { v: 0, a: 0 }
  }

  // integrate speed -> normalized distance table
  const N = 720
  const cum = new Float64Array(N + 1)
  const dt = durationSec / N
  for (let i = 1; i <= N; i++) {
    cum[i] = cum[i - 1] + evalAt((i - 0.5) * dt).v * dt
  }
  const total = cum[N] || 1
  for (let i = 0; i <= N; i++) cum[i] /= total

  return {
    distFrac(tSec: number): number {
      const x = clamp01(tSec / durationSec) * N
      const i = Math.min(N - 1, Math.floor(x))
      return cum[i] + (cum[i + 1] - cum[i]) * (x - i)
    },
    telemetry(tSec: number): Telemetry {
      const { v, a } = evalAt(tSec)
      return { speedKmh: Math.round(v), altitudeM: Math.round(a) }
    },
    segments: {
      roll: segs[0].dur,
      climb: segs[1].dur + segs[2].dur,
      cruise: segs[3].dur,
      descent: segs[4].dur + segs[5].dur,
      landRoll: segs[6].dur,
    },
  }
}
