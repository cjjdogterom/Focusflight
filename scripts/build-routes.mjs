// Build a catalogue of REAL flight routes (with waypoints) from the free
// Flight Plan Database API, into src/data/routes.json keyed by "IATA-IATA".
// Run:  node scripts/build-routes.mjs
//
// No API key required for reads. Be gentle: we throttle requests.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'routes.json')

// IATA -> { icao, lat, lon }
const AP = {
  AMS: ['EHAM', 52.3086, 4.7639], LHR: ['EGLL', 51.4706, -0.4619], CDG: ['LFPG', 49.0097, 2.5479],
  FRA: ['EDDF', 50.0333, 8.5706], MAD: ['LEMD', 40.4936, -3.5668], BCN: ['LEBL', 41.2971, 2.0785],
  FCO: ['LIRF', 41.8003, 12.2389], MUC: ['EDDM', 48.3538, 11.7861], ZRH: ['LSZH', 47.4647, 8.5492],
  VIE: ['LOWW', 48.1103, 16.5697], CPH: ['EKCH', 55.618, 12.656], ARN: ['ESSA', 59.6519, 17.9186],
  OSL: ['ENGM', 60.1939, 11.1004], DUB: ['EIDW', 53.4213, -6.2701], LIS: ['LPPT', 38.7813, -9.1359],
  IST: ['LTFM', 41.2753, 28.7519], SVO: ['UUEE', 55.9726, 37.4146], JFK: ['KJFK', 40.6413, -73.7781],
  EWR: ['KEWR', 40.6895, -74.1745], LAX: ['KLAX', 33.9416, -118.4085], SFO: ['KSFO', 37.6213, -122.379],
  ORD: ['KORD', 41.9742, -87.9073], MIA: ['KMIA', 25.7959, -80.287], ATL: ['KATL', 33.6407, -84.4277],
  SEA: ['KSEA', 47.4502, -122.3088], YYZ: ['CYYZ', 43.6777, -79.6248], YVR: ['CYVR', 49.1967, -123.1815],
  MEX: ['MMMX', 19.4363, -99.0721], GRU: ['SBGR', -23.4356, -46.4731], EZE: ['SAEZ', -34.8222, -58.5358],
  BOG: ['SKBO', 4.7016, -74.1469], DXB: ['OMDB', 25.2532, 55.3657], DOH: ['OTHH', 25.2731, 51.6081],
  AUH: ['OMAA', 24.433, 54.6511], CAI: ['HECA', 30.1219, 31.4056], JNB: ['FAOR', -26.1392, 28.246],
  CPT: ['FACT', -33.9715, 18.6021], NBO: ['HKJK', -1.3192, 36.9278], DEL: ['VIDP', 28.5562, 77.1],
  BOM: ['VABB', 19.0887, 72.8679], SIN: ['WSSS', 1.3644, 103.9915], BKK: ['VTBS', 13.69, 100.7501],
  HKG: ['VHHH', 22.308, 113.9185], NRT: ['RJAA', 35.772, 140.3929], HND: ['RJTT', 35.5494, 139.7798],
  ICN: ['RKSI', 37.4602, 126.4407], PEK: ['ZBAA', 40.0799, 116.6031], PVG: ['ZSPD', 31.1443, 121.8083],
  SYD: ['YSSY', -33.9399, 151.1753], MEL: ['YMML', -37.669, 144.841], AKL: ['NZAA', -37.0082, 174.785],
}

const HUBS = ['AMS','LHR','CDG','FRA','MAD','IST','DXB','DOH','JFK','LAX','SFO','ORD','MIA','SIN','HKG','HND','NRT','ICN','SYD','GRU','JNB','DEL','BKK','PEK']
const EURO = ['LHR','CDG','FRA','MAD','BCN','FCO','MUC','ZRH','VIE','CPH','ARN','OSL','DUB','LIS','IST']

// MODE=euro → only AMS↔European routes, force-refetch (adds waypoint idents).
const MODE = process.env.MODE || ''
const FORCE = MODE === 'euro'

const pairSet = new Set()
const addPair = (a, b) => { if (a !== b) pairSet.add([a, b].sort().join('-')) }
if (MODE === 'euro') {
  for (const d of EURO) addPair('AMS', d)
} else {
  for (const d of Object.keys(AP)) addPair('AMS', d)
  for (let i = 0; i < HUBS.length; i++)
    for (let j = i + 1; j < HUBS.length; j++) addPair(HUBS[i], HUBS[j])
}
const pairs = [...pairSet].map((k) => k.split('-'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const R = 6371.0088, rad = (d) => (d * Math.PI) / 180
// note: points are [lat, lon] here
const gc = (a, b) => {
  const [la1, lo1] = [rad(a[0]), rad(a[1])], [la2, lo2] = [rad(b[0]), rad(b[1])]
  const s = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
const bearing = (a, b) => {
  const [la1, la2] = [rad(a[0]), rad(b[0])], dlo = rad(b[1] - a[1])
  return Math.atan2(Math.sin(dlo) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo))
}
// cross-track distance (km) of point p from the great circle A->B
const crossTrack = (A, B, p) => {
  const dAP = gc(A, p) / R
  const t = Math.asin(Math.min(1, Math.max(-1, Math.sin(dAP) * Math.sin(bearing(A, p) - bearing(A, B)))))
  return Math.abs(t * R)
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FocusFlight/0.1' } })
  if (res.status === 429) { await sleep(3000); return getJSON(url) }
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

async function fetchRoute(fromIata, toIata) {
  const [fi] = AP[fromIata], [ti] = AP[toIata]
  const A = [AP[fromIata][1], AP[fromIata][2]] // [lat, lon]
  const B = [AP[toIata][1], AP[toIata][2]]
  const gcDist = gc(A, B)
  const list = await getJSON(`https://api.flightplandatabase.com/search/plans?fromICAO=${fi}&toICAO=${ti}&limit=10&sort=distance`)

  const candidates = []
  for (const cand of list.slice(0, 8)) {
    await sleep(220)
    let plan
    try { plan = await getJSON(`https://api.flightplandatabase.com/plan/${cand.id}?include=route`) } catch { continue }
    const nodes = (plan?.route?.nodes || []).filter((n) => typeof n.lat === 'number' && typeof n.lon === 'number')
    if (nodes.length < 5) continue
    // path length and max cross-track deviation from the great circle
    let pathLen = 0
    let maxDev = 0
    for (let i = 1; i < nodes.length; i++) pathLen += gc([nodes[i - 1].lat, nodes[i - 1].lon], [nodes[i].lat, nodes[i].lon])
    for (const n of nodes) maxDev = Math.max(maxDev, crossTrack(A, B, [n.lat, n.lon]))
    // [lon, lat, ident] — ident '' for unnamed points
    const coords = nodes.map((n) => [
      Math.round(n.lon * 1000) / 1000,
      Math.round(n.lat * 1000) / 1000,
      (n.ident || n.name || '').toString().slice(0, 6),
    ])
    candidates.push({ coords, pathLen, maxDev, count: nodes.length })
  }
  if (!candidates.length) return null

  // realistic + tidy: not much longer than the great circle, no wild detours;
  // among those, prefer the densest (most waypoints), then the most direct.
  const devCap = Math.max(320, gcDist * 0.14)
  const good = candidates.filter((c) => c.pathLen <= gcDist * 1.28 && c.maxDev <= devCap)
  const pool = good.length ? good : candidates.filter((c) => c.pathLen <= gcDist * 1.5)
  if (!pool.length) return null
  pool.sort((a, b) => b.count - a.count || a.pathLen - b.pathLen)
  return pool[0].coords
}

async function main() {
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
  let ok = 0, fail = 0
  for (const [a, b] of pairs) {
    const key = `${a}-${b}`
    if (out[key] && !FORCE) { ok++; continue }
    try {
      const coords = await fetchRoute(a, b)
      if (coords) {
        out[key] = coords
        out[`${b}-${a}`] = [...coords].reverse()
        ok++
        console.log(`ok   ${key}  (${coords.length} nodes)`)
      } else { fail++; console.log(`none ${key}`) }
    } catch (e) {
      fail++; console.log(`err  ${key}: ${e.message}`)
    }
    writeFileSync(OUT, JSON.stringify(out))
    await sleep(350)
  }
  console.log(`\nDone. ${ok} routes, ${fail} misses. Keys: ${Object.keys(out).length}`)
}

main()
