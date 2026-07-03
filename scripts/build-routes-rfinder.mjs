#!/usr/bin/env node
// Fetch real IFR routes from RouteFinder (rfinder.asalink.net/free) and store
// them locally in src/data/routes.json (catalog format: "AMS-BCN" ->
// [[lon, lat, ident], ...] intermediate waypoints, airports excluded).
//
// Default plan: home base (AMS) to/from every "big" airport that is not in
// the catalog yet. Polite to the free service: ~1.8 s between requests,
// incremental saves, resumable — rerun to continue where it stopped.
//
//   node scripts/build-routes-rfinder.mjs            # AMS <-> all big
//   node scripts/build-routes-rfinder.mjs BCN 100    # other base / limit

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROUTES_PATH = join(ROOT, 'src/data/routes.json')
const BASE = 'https://rfinder.asalink.net/free/'

const homeIata = process.argv[2] || 'AMS'
const limit = Number(process.argv[3] || Infinity)
const DELAY_MS = 1800

const airports = JSON.parse(readFileSync(join(ROOT, 'src/data/airports.json'), 'utf8'))
const byIata = new Map(airports.map((r) => [r[0], r]))
const byIcao = new Map(airports.map((r) => [r[1], r]))
const home = byIata.get(homeIata)
if (!home || !home[1]) throw new Error(`no ICAO for ${homeIata}`)

const routes = JSON.parse(readFileSync(ROUTES_PATH, 'utf8'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let cookie = ''
let formKey = ''
let dbid = ''

async function refreshSession() {
  const res = await fetch(BASE, { headers: { 'User-Agent': 'FocusFlight private flight-sim (personal use)' } })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const html = await res.text()
  formKey = (html.match(/name=k value=(\d+)/) || [])[1] || ''
  dbid = (html.match(/<option value='(\d+)'/) || [])[1] || '2606'
  if (!formKey) throw new Error('no form key — page layout changed?')
}

function parseDMS(str) {
  const m = str.match(/([NS])(\d+)[^\d](\d+)'([\d.]+)"\s+([EW])(\d+)[^\d](\d+)'([\d.]+)"/)
  if (!m) return null
  const lat = (Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600) * (m[1] === 'S' ? -1 : 1)
  const lon = (Number(m[6]) + Number(m[7]) / 60 + Number(m[8]) / 3600) * (m[5] === 'W' ? -1 : 1)
  return [Number(lon.toFixed(5)), Number(lat.toFixed(5))]
}

async function fetchRoute(depIcao, arrIcao) {
  const body = new URLSearchParams({
    id1: depIcao, ic1: '', id2: arrIcao, ic2: '',
    minalt: 'FL330', maxalt: 'FL330', lvl: 'B', dbid,
    usesid: 'Y', usestar: 'Y', easet: 'Y', rnav: 'Y', nats: 'R', k: formKey,
  })
  const res = await fetch(BASE + 'autoroute_rtx.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
      'User-Agent': 'FocusFlight private flight-sim (personal use)',
    },
    body: body.toString(),
  })
  const html = await res.text()
  const pre = html.match(/<pre>([\s\S]*?)<\/pre>/)
  if (!pre) return null
  const lines = pre[1].replace(/&deg;/g, '°').split('\n').map((l) => l.trim()).filter(Boolean)
  const wps = []
  for (const line of lines) {
    if (line.startsWith('ID ') || line.startsWith('ID\t')) continue
    const coords = parseDMS(line)
    if (!coords) continue
    const ident = line.split(/\s+/)[0]
    wps.push([coords[0], coords[1], ident])
  }
  if (wps.length < 5) return null
  // the service sometimes returns a STALE result for a different pair when
  // it cannot route the request — verify the endpoints really are our
  // airports before trusting anything
  const depRow = wps[0]
  const arrRow = wps[wps.length - 1]
  const dep = byIcao.get(depIcao)
  const arr = byIcao.get(arrIcao)
  if (!dep || !arr) return null
  if (distKm(depRow[1], depRow[0], dep[5], dep[6]) > 60) return null
  if (distKm(arrRow[1], arrRow[0], arr[5], arr[6]) > 60) return null
  // strip the airports themselves; the app adds real runway geometry
  wps.shift()
  wps.pop()
  return wps.length >= 3 ? wps : null
}

function distKm(lat1, lon1, lat2, lon2) {
  const toR = (d) => (d * Math.PI) / 180
  const s =
    Math.sin(toR(lat2 - lat1) / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(toR(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(s))
}

const big = airports.filter((r) => r[7] === 1 && r[1] && r[0] !== homeIata)
const pairs = []
for (const b of big) {
  if (!routes[`${homeIata}-${b[0]}`]) pairs.push([home, b])
  if (!routes[`${b[0]}-${homeIata}`]) pairs.push([b, home])
}
console.log(`${pairs.length} routes to fetch (${big.length} big airports, base ${homeIata})`)

await refreshSession()
let ok = 0
let fail = 0
let done = 0
for (const [dep, arr] of pairs) {
  if (done >= limit) break
  done++
  const key = `${dep[0]}-${arr[0]}`
  try {
    if (done % 100 === 0) await refreshSession()
    const wps = await fetchRoute(dep[1], arr[1])
    if (wps) {
      routes[key] = wps
      ok++
      if (ok % 20 === 0) {
        writeFileSync(ROUTES_PATH, JSON.stringify(routes))
        console.log(`[${done}/${pairs.length}] saved — ${ok} ok, ${fail} failed (last: ${key}, ${wps.length} wps)`)
      }
    } else {
      fail++
    }
  } catch (e) {
    fail++
    console.log(`[${done}] ${key} error: ${e.message} — 10 s pause`)
    await sleep(10000)
    await refreshSession().catch(() => {})
  }
  await sleep(DELAY_MS)
}
writeFileSync(ROUTES_PATH, JSON.stringify(routes))
console.log(`DONE: ${ok} routes added, ${fail} failed/empty. Catalog now ${Object.keys(routes).length} routes.`)
