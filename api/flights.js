// Vercel serverless proxy for the official Schiphol Flight API.
// The browser can't call api.schiphol.nl directly (no CORS + the app_id/
// app_key must stay secret), so this function fetches the upcoming
// departures server-side. Keys live in Vercel env vars:
//   SCHIPHOL_APP_ID, SCHIPHOL_APP_KEY  (free tier: developer.schiphol.nl)

const API = 'https://api.schiphol.nl/public-flights/flights'

// Schiphol expects local (Europe/Amsterdam) wall time: yyyy-MM-ddTHH:mm:ss
function amsTime(d) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(' ', 'T')
}

export default async function handler(req, res) {
  const id = process.env.SCHIPHOL_APP_ID
  const key = process.env.SCHIPHOL_APP_KEY
  if (!id || !key) {
    res.status(503).json({ error: 'not-configured' })
    return
  }
  try {
    const now = Date.now()
    const from = amsTime(new Date(now - 10 * 60 * 1000))
    const to = amsTime(new Date(now + 3 * 60 * 60 * 1000))
    const headers = { app_id: id, app_key: key, ResourceVersion: 'v4', Accept: 'application/json' }

    const flights = []
    for (let page = 0; page < 6; page++) {
      const url = `${API}?flightDirection=D&sort=%2BscheduleTime&fromDateTime=${from}&toDateTime=${to}&page=${page}`
      const r = await fetch(url, { headers })
      if (r.status === 204) break
      if (!r.ok) {
        if (page === 0) {
          res.status(502).json({ error: `schiphol ${r.status}` })
          return
        }
        break
      }
      const data = await r.json()
      const list = Array.isArray(data.flights) ? data.flights : []
      for (const f of list) {
        flights.push({
          name: f.flightName ?? null,
          prefix: f.prefixIATA ?? null,
          schedule: f.scheduleDateTime ?? null,
          dest: (f.route && f.route.destinations && f.route.destinations[0]) || null,
          states: (f.publicFlightState && f.publicFlightState.flightStates) || [],
          gate: f.gate ?? null,
          aircraft:
            (f.aircraftType && (f.aircraftType.iataSub || f.aircraftType.iataMain)) || null,
          serviceType: f.serviceType ?? null,
          mainFlight: f.mainFlight ?? f.flightName ?? null,
        })
      }
      if (list.length < 20) break
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ flights })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
