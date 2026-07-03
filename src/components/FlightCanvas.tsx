import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Route } from '../lib/routeEngine'
import type { Aircraft, Livery } from '../types'
import { positionAt, bearing, type LngLat } from '../lib/geo'
import { buildPlaneSVG } from './AircraftSVG'
import { Plane3D } from './Plane3D'
import { WORLD_LAND } from '../data/worldLand'

export type FollowMode = 'off' | 'north' | 'track'

export interface FlightCanvasHandle {
  update: (distFrac: number, altitudeM: number) => void
  zoom: (factor: number) => void
  recenter: () => void
}

export type MapStyle = 'dark' | 'sat'

interface Props {
  route: Route
  aircraft: Aircraft
  livery: Livery
  followMode: FollowMode
  mapStyle: MapStyle
  onUserInteract: () => void
}

const wrapDl = (lon: number, center: number) => ((lon - center + 540) % 360) - 180
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const D2R = Math.PI / 180
const mercN = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * D2R) / 2))
const MIN_PPD = 0.5
const MAX_PPD = 9000
const CINE_PPD = 4200 // runway-level zoom for the takeoff sequence
const CINE_EXIT_ALT = 1200 // metres: end of the cinematic climb-out

const SEG_COLOR: Record<string, string> = { SID: '#8db4e8', ENROUTE: '#8db4e8', STAR: '#8db4e8' }

const TILE_URL = (style: MapStyle, z: number, x: number, y: number) =>
  style === 'sat'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    : `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`

const FlightCanvas = forwardRef<FlightCanvasHandle, Props>(function FlightCanvas(
  { route, aircraft, livery, followMode, mapStyle, onUserInteract },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ ppd: 4, cLon: 0, cLat: 0 })
  const size = useRef({ w: 0, h: 0 })
  const distRef = useRef(0)
  const altRef = useRef(0)
  const followRef = useRef<FollowMode>(followMode)
  const camMode = useRef<'cine' | 'transition' | 'free'>('free')
  const rotCur = useRef(0) // map rotation (rad), 0 = north up
  const anchorYF = useRef(0.5) // plane anchor as fraction of height
  const planeImg = useRef<HTMLImageElement | null>(null)
  const planeReady = useRef(false)
  const plane3d = useRef<Plane3D | null>(null)
  const photoImg = useRef<HTMLImageElement | null>(null)
  const photoReady = useRef(false)
  const rafRef = useRef(0)
  const fitted = useRef(false)
  const tiles = useRef<Map<string, HTMLImageElement | 'loading' | 'error'>>(new Map())

  followRef.current = followMode
  const styleRef = useRef<MapStyle>(mapStyle)
  styleRef.current = mapStyle
  const chart = route.chart

  useEffect(() => {
    const img = new Image()
    img.onload = () => (planeReady.current = true)
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(buildPlaneSVG(aircraft, livery, 72))
    planeImg.current = img
    planeReady.current = false

    // the app's standard aircraft: the photorealistic top-view render
    photoReady.current = false
    const ph = new Image()
    ph.onload = () => (photoReady.current = true)
    ph.src = '/plane-klm-top.png'
    photoImg.current = ph

    try {
      plane3d.current?.dispose()
      plane3d.current = aircraft.silhouette === 'prop' ? null : new Plane3D(aircraft, livery)
    } catch {
      plane3d.current = null
    }
    return () => {
      plane3d.current?.dispose()
      plane3d.current = null
    }
  }, [aircraft, livery])

  // drop cached tiles when the map style changes
  useEffect(() => {
    tiles.current.clear()
  }, [mapStyle])

  // activating follow via the crosshair zooms fully in on the aircraft
  useEffect(() => {
    if (followMode !== 'off' && camMode.current === 'free' && view.current.ppd < 2800) {
      view.current.ppd = 3400
    }
  }, [followMode])

  // ---- projection (Web Mercator on chart) with map rotation ----
  const anchorY = () => size.current.h * anchorYF.current
  const kx = () => (chart ? view.current.ppd : view.current.ppd * Math.cos(view.current.cLat * D2R))
  const projectBase = (lon: number, lat: number): [number, number] => {
    const { w } = size.current
    const x = w / 2 + wrapDl(lon, view.current.cLon) * kx()
    const y = chart
      ? anchorY() - (mercN(lat) - mercN(view.current.cLat)) * view.current.ppd * (180 / Math.PI)
      : anchorY() - (lat - view.current.cLat) * view.current.ppd
    return [x, y]
  }
  const applyRot = (x: number, y: number): [number, number] => {
    const r = rotCur.current
    if (Math.abs(r) < 1e-4) return [x, y]
    const ax = size.current.w / 2
    const ay = anchorY()
    const dx = x - ax
    const dy = y - ay
    const c = Math.cos(r)
    const s = Math.sin(r)
    return [ax + dx * c - dy * s, ay + dx * s + dy * c]
  }
  const invRot = (x: number, y: number): [number, number] => {
    const r = rotCur.current
    if (Math.abs(r) < 1e-4) return [x, y]
    const ax = size.current.w / 2
    const ay = anchorY()
    const dx = x - ax
    const dy = y - ay
    const c = Math.cos(-r)
    const s = Math.sin(-r)
    return [ax + dx * c - dy * s, ay + dx * s + dy * c]
  }
  const project = (lon: number, lat: number): [number, number] => {
    const [x, y] = projectBase(lon, lat)
    return applyRot(x, y)
  }
  const unprojectBase = (px: number, py: number) => {
    const { w } = size.current
    const lon = view.current.cLon + (px - w / 2) / kx()
    let lat: number
    if (chart) {
      const n = mercN(view.current.cLat) + (anchorY() - py) / (view.current.ppd * (180 / Math.PI))
      lat = (2 * Math.atan(Math.exp(n)) - Math.PI / 2) / D2R
    } else {
      lat = view.current.cLat - (py - anchorY()) / view.current.ppd
    }
    return { lon, lat }
  }
  const unproject = (px: number, py: number) => {
    const [bx, by] = invRot(px, py)
    return unprojectBase(bx, by)
  }

  const computeFit = () => {
    const { w, h } = size.current
    const mid = route.points[Math.floor(route.points.length / 2)]
    const cLon = mid[0]
    const cLatRoute = mid[1]
    let maxDl = 0.5
    let maxDlat = 0.5
    for (const [lon, lat] of route.points) {
      maxDl = Math.max(maxDl, Math.abs(wrapDl(lon, cLon)))
      maxDlat = Math.max(maxDlat, Math.abs(lat - cLatRoute))
    }
    const topInset = 120
    const bottomInset = Math.min(250, h * 0.32)
    const usableH = Math.max(200, h - bottomInset - topInset)
    const cosc = Math.cos(cLatRoute * D2R)
    const ppdLon = (w * (chart ? 0.78 : 0.82)) / (2 * maxDl * (chart ? 1 : cosc))
    const ppdLat = (usableH * 0.92) / (2 * maxDlat * (chart ? 1 / cosc : 1))
    const ppd = clamp(Math.min(ppdLon, ppdLat), MIN_PPD, MAX_PPD)
    const cLat = cLatRoute - (bottomInset - topInset) / 2 / ppd
    return { cLon, cLat, ppd }
  }
  const fitView = () => {
    view.current = computeFit()
  }

  // cinematic takeoff: start zoomed in on the departure runway (chart flights)
  useEffect(() => {
    rotCur.current = 0
    if (chart) {
      camMode.current = 'cine'
      anchorYF.current = 0.58
      view.current = { cLon: route.from.lon, cLat: route.from.lat, ppd: CINE_PPD }
      fitted.current = true
    } else {
      camMode.current = 'free'
      anchorYF.current = 0.5
      fitted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  // ---- satellite tiles ----
  const drawTiles = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const worldPx = view.current.ppd * 360
    const zRaw = Math.log2(worldPx / 256)
    const dprBoost = (window.devicePixelRatio || 1) >= 2 ? 0.85 : 0.25
    const z = clamp(Math.round(zRaw + dprBoost), 2, 19)
    const n = 2 ** z
    const sf = worldPx / (256 * n)

    // rotated viewport coverage: unproject all four corners
    const corners = [
      unproject(0, 0),
      unproject(w, 0),
      unproject(0, h),
      unproject(w, h),
    ]
    const lonMin = Math.min(...corners.map((c) => c.lon))
    const lonMax = Math.max(...corners.map((c) => c.lon))
    const latMin = Math.max(-85, Math.min(...corners.map((c) => c.lat)))
    const latMax = Math.min(85, Math.max(...corners.map((c) => c.lat)))
    const tx0 = Math.floor(((lonMin + 180) / 360) * n)
    const tx1 = Math.floor(((lonMax + 180) / 360) * n)
    const ty0 = Math.max(0, Math.floor(((1 - mercN(latMax) / Math.PI) / 2) * n))
    const ty1 = Math.min(n - 1, Math.floor(((1 - mercN(latMin) / Math.PI) / 2) * n))

    ctx.save()
    const r = rotCur.current
    if (Math.abs(r) > 1e-4) {
      const ax = w / 2
      const ay = anchorY()
      ctx.translate(ax, ay)
      ctx.rotate(r)
      ctx.translate(-ax, -ay)
    }
    ctx.imageSmoothingEnabled = true
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let txr = tx0; txr <= tx1; txr++) {
        const tx = ((txr % n) + n) % n
        const key = `${styleRef.current}/${z}/${ty}/${tx}`
        let img = tiles.current.get(key)
        if (img === undefined) {
          if (tiles.current.size > 400) tiles.current.clear()
          const el = new Image()
          el.crossOrigin = 'anonymous'
          el.onload = () => tiles.current.set(key, el)
          el.onerror = () => tiles.current.set(key, 'error')
          el.src = TILE_URL(styleRef.current, z, tx, ty)
          tiles.current.set(key, 'loading')
          img = 'loading'
        }
        const lon = (txr / n) * 360 - 180
        const latN = (2 * Math.atan(Math.exp(Math.PI * (1 - (2 * ty) / n))) - Math.PI / 2) / D2R
        const [x, y] = projectBase(lon, latN)
        const tsz = 256 * sf
        if (img instanceof HTMLImageElement) {
          ctx.drawImage(img, x, y, tsz + 0.6, tsz + 0.6)
        } else {
          // fall back to a cached ancestor tile, scaled up (avoids black gaps
          // while zooming); otherwise a flat placeholder
          let drawn = false
          for (let up = 1; up <= 4 && !drawn; up++) {
            const pz = z - up
            if (pz < 2) break
            const f = 2 ** up
            const ptx = Math.floor(tx / f)
            const pty = Math.floor(ty / f)
            const pimg = tiles.current.get(`${styleRef.current}/${pz}/${pty}/${ptx}`)
            if (pimg instanceof HTMLImageElement) {
              const cs = 256 / f
              const cx0 = (tx % f) * cs
              const cy0 = (ty % f) * cs
              ctx.drawImage(pimg, cx0, cy0, cs, cs, x, y, tsz + 0.6, tsz + 0.6)
              drawn = true
            }
          }
          if (!drawn) {
            ctx.fillStyle = '#151a21'
            ctx.fillRect(x, y, tsz + 0.6, tsz + 0.6)
          }
        }
      }
    }
    ctx.restore()
  }

  // ---- symbols / labels ----
  const drawFix = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(10,14,20,0.8)'
    ctx.stroke()
  }
  const drawVOR = drawFix
  const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, sz = 11) => {
    ctx.font = `600 ${sz}px -apple-system, system-ui, sans-serif`
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.lineWidth = 3
    ctx.strokeText(text, x, y)
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillText(text, x, y)
  }

  const shortestAngle = (from: number, to: number) => {
    let d = (to - from) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return d
  }

  const drawScene = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { w, h } = size.current
    if (w === 0 || h === 0) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const t = distRef.current
    const cur = positionAt(route.points, t)
    const headingRad = cur.heading * D2R

    // ---- camera logic ----
    const mode = camMode.current
    if (mode === 'cine' && altRef.current >= CINE_EXIT_ALT) camMode.current = 'transition'
    const trackActive = mode === 'cine' || followRef.current === 'track'
    const centerOnPlane = mode === 'cine' || followRef.current !== 'off'

    if (centerOnPlane) {
      view.current.cLon = cur.pos[0]
      view.current.cLat = cur.pos[1]
    }
    if (mode === 'transition') {
      const v = view.current
      if (followRef.current !== 'off') {
        // keep following the aircraft, just ease out to a comfortable distance
        const target = 1050
        v.ppd += (target - v.ppd) * 0.04
        if (Math.abs(v.ppd / target - 1) < 0.04) camMode.current = 'free'
      } else {
        const target = computeFit()
        v.ppd += (target.ppd - v.ppd) * 0.035
        v.cLon += wrapDl(target.cLon, v.cLon) * 0.035
        v.cLat += (target.cLat - v.cLat) * 0.035
        if (Math.abs(v.ppd / target.ppd - 1) < 0.03) {
          camMode.current = 'free'
          fitView()
        }
      }
    }
    // smooth rotation + anchor
    const rotTarget = trackActive ? -headingRad : 0
    rotCur.current += shortestAngle(rotCur.current, rotTarget) * 0.09
    const anchorTarget = trackActive ? 0.58 : 0.5
    anchorYF.current += (anchorTarget - anchorYF.current) * 0.08

    // ---- base map ----
    if (chart) {
      ctx.fillStyle = '#151a21'
      ctx.fillRect(0, 0, w, h)
      drawTiles(ctx, w, h)
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0b1730')
      grad.addColorStop(1, '#070f1f')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(120,150,190,0.07)'
      ctx.lineWidth = 1
      for (let lat = -80; lat <= 80; lat += 10) {
        ctx.beginPath()
        let s = false
        for (let lon = -180; lon <= 180; lon += 4) {
          const [x, y] = project(lon, lat)
          if (!s) { ctx.moveTo(x, y); s = true } else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      for (let lon = -180; lon <= 180; lon += 10) {
        ctx.beginPath()
        let s = false
        for (let lat = -80; lat <= 80; lat += 4) {
          const [x, y] = project(lon, lat)
          if (!s) { ctx.moveTo(x, y); s = true } else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.fillStyle = '#16233c'
      ctx.strokeStyle = 'rgba(120,160,210,0.35)'
      for (const ring of WORLD_LAND) {
        ctx.beginPath()
        let prevX: number | null = null
        let broke = false
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = project(ring[i][0], ring[i][1])
          if (prevX !== null && Math.abs(x - prevX) > w * 1.5) { broke = true; ctx.moveTo(x, y) }
          else if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          prevX = x
        }
        if (!broke) ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }

    // ---- planned route ----
    if (chart) {
      const vtx: { lon: number; lat: number; seg: string }[] = [
        { lon: route.from.lon, lat: route.from.lat, seg: 'SID' },
        ...route.waypoints.map((wp) => ({ lon: wp.lon, lat: wp.lat, seg: wp.segment })),
        { lon: route.to.lon, lat: route.to.lat, seg: 'STAR' },
      ]
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 5
      ctx.beginPath()
      vtx.forEach((v, i) => {
        const [x, y] = project(v.lon, v.lat)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.lineWidth = 2.2
      for (let i = 0; i < vtx.length - 1; i++) {
        const [x0, y0] = project(vtx[i].lon, vtx[i].lat)
        const [x1, y1] = project(vtx[i + 1].lon, vtx[i + 1].lat)
        ctx.strokeStyle = SEG_COLOR[vtx[i + 1].seg] || SEG_COLOR.ENROUTE
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
    } else {
      ctx.strokeStyle = 'rgba(150,185,225,0.55)'
      ctx.lineWidth = 1.6
      ctx.setLineDash([5, 6])
      ctx.beginPath()
      route.points.forEach((pt, i) => {
        const [x, y] = project(pt[0], pt[1])
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // flown portion — ends exactly at the aircraft for a smooth tip
    const last = Math.max(1, Math.floor(t * (route.points.length - 1)))
    const planeScr = project(cur.pos[0], cur.pos[1])
    ctx.strokeStyle = chart ? 'rgba(125,170,250,0.9)' : '#4fc3f7'
    ctx.lineWidth = chart ? 2.6 : 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= last; i++) {
      const [x, y] = project(route.points[i][0], route.points[i][1])
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.lineTo(planeScr[0], planeScr[1])
    ctx.stroke()

    // airway labels + waypoints (labels stay horizontal in rotated view)
    if (chart) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '600 10px -apple-system, system-ui, sans-serif'
      let lastAw = ''
      for (let i = 0; i < route.waypoints.length; i++) {
        const wp = route.waypoints[i]
        if (wp.airway && wp.airway !== lastAw) {
          lastAw = wp.airway
          const prev = i === 0 ? { lon: route.from.lon, lat: route.from.lat } : route.waypoints[i - 1]
          const [x0, y0] = project(prev.lon, prev.lat)
          const [x1, y1] = project(wp.lon, wp.lat)
          const mx = (x0 + x1) / 2
          const my = (y0 + y1) / 2
          if (mx < -40 || mx > w + 40 || my < -40 || my > h + 40) continue
          const tw = ctx.measureText(wp.airway).width + 8
          ctx.fillStyle = 'rgba(7,14,24,0.82)'
          ctx.fillRect(mx - tw / 2, my - 7, tw, 14)
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 1
          ctx.strokeRect(mx - tw / 2, my - 7, tw, 14)
          ctx.fillStyle = '#cfe4f7'
          ctx.fillText(wp.airway, mx, my + 0.5)
        }
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const drawn: [number, number][] = []
      for (const wp of route.waypoints) {
        const [x, y] = project(wp.lon, wp.lat)
        if (x < -30 || x > w + 30 || y < -30 || y > h + 30) continue
        if (wp.type === 'VOR') drawVOR(ctx, x, y)
        else drawFix(ctx, x, y)
        const clash = drawn.some(([lx, ly]) => Math.abs(x - lx) < 48 && Math.abs(y - ly) < 15)
        if (!clash) {
          drawn.push([x, y])
          label(ctx, wp.id, x + 8, y - 6)
        }
      }
    } else {
      const showLabels = kx() > 34
      for (const wp of route.waypoints) {
        const [x, y] = project(wp.lon, wp.lat)
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue
        ctx.beginPath()
        ctx.arc(x, y, 2.6, 0, Math.PI * 2)
        ctx.fillStyle = '#9fb8d6'
        ctx.fill()
        if (showLabels && wp.id) {
          ctx.fillStyle = 'rgba(210,224,240,0.85)'
          ctx.font = '600 10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(wp.id, x + 5, y - 4)
        }
      }
    }

    // endpoints: yellow airport badges (reference style)
    for (const a of [route.from, route.to]) {
      const [x, y] = project(a.lon, a.lat)
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue
      ctx.font = '700 11px -apple-system, system-ui, sans-serif'
      const txt = `\u2708 ${a.iata}`
      const tw = ctx.measureText(txt).width
      const bw = tw + 16
      const bh = 22
      const bx = x - bw / 2
      const by2 = y - bh / 2
      ctx.beginPath()
      ctx.moveTo(bx + 7, by2)
      ctx.arcTo(bx + bw, by2, bx + bw, by2 + bh, 7)
      ctx.arcTo(bx + bw, by2 + bh, bx, by2 + bh, 7)
      ctx.arcTo(bx, by2 + bh, bx, by2, 7)
      ctx.arcTo(bx, by2, bx + bw, by2, 7)
      ctx.closePath()
      ctx.fillStyle = '#ffc800'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(10,12,16,0.9)'
      ctx.stroke()
      ctx.fillStyle = '#0b0d10'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(txt, x, y + 0.5)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }


    // subtle aircraft lighting: steady nav (red L / green R / white tail),
    // double wingtip strobes and a pulsing red beacon — aviation timing
    const drawNavLights = (ctx2: CanvasRenderingContext2D, pw: number, ph: number) => {
      const tm = performance.now()
      const dot = (x: number, y: number, r: number, rgb: string, a: number) => {
        if (a <= 0.02) return
        const g = ctx2.createRadialGradient(x, y, 0, x, y, r * 3)
        g.addColorStop(0, `rgba(${rgb},${a})`)
        g.addColorStop(0.45, `rgba(${rgb},${a * 0.35})`)
        g.addColorStop(1, `rgba(${rgb},0)`)
        ctx2.fillStyle = g
        ctx2.beginPath()
        ctx2.arc(x, y, r * 3, 0, Math.PI * 2)
        ctx2.fill()
      }
      const wingY = ph * 0.1
      const wingX = pw * 0.475
      // steady position lights
      dot(-wingX, wingY, pw * 0.02, '255,70,60', 0.5)
      dot(wingX, wingY, pw * 0.02, '80,255,120', 0.5)
      dot(0, ph * 0.47, pw * 0.018, '255,255,255', 0.38)
      // white double strobe every ~1.4s
      const sp = tm % 1400
      if ((sp >= 0 && sp < 70) || (sp >= 150 && sp < 220)) {
        dot(-wingX, wingY, pw * 0.028, '255,255,255', 0.8)
        dot(wingX, wingY, pw * 0.028, '255,255,255', 0.8)
      }
      // red beacon, soft ~1.2s pulse on the fuselage
      const bp = Math.sin((tm % 1200) / 1200 * Math.PI * 2)
      dot(0, -ph * 0.05, pw * 0.018, '255,40,40', Math.max(0, bp) ** 3 * 0.45)
    }

    const planePx = 60 * (aircraft.scale || 1)

    // aircraft (3D; heading relative to the rotated map)
    const [px, py] = planeScr
    const screenHeading = cur.heading + rotCur.current / D2R
    if (photoReady.current && photoImg.current) {
      const im = photoImg.current
      const ph = planePx * 1.15
      const pw = ph * (im.naturalWidth / im.naturalHeight)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(screenHeading * D2R)
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 3
      ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      drawNavLights(ctx, pw, ph)
      ctx.restore()
    } else if (plane3d.current) {
      const sprite = plane3d.current.render(screenHeading)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 7
      ctx.shadowOffsetY = 2
      ctx.drawImage(sprite, px - planePx / 2, py - planePx / 2, planePx, planePx)
      ctx.restore()
    } else if (planeReady.current && planeImg.current) {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(screenHeading * D2R)
      const s = planePx * 0.8
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 6
      ctx.drawImage(planeImg.current, -s / 2, -s / 2, s, s)
      ctx.restore()
    }

    if (chart) drawFurniture(ctx, w, h)
  }

  const drawFurniture = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const hudTop = h - 196 // just above the big-type HUD
    ctx.font = '9px -apple-system, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const att = styleRef.current === 'sat' ? '\u00a9 ESRI \u00b7 NIET VOOR NAVIGATIE' : '\u00a9 CARTO \u00b7 NIET VOOR NAVIGATIE'
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 2.5
    ctx.strokeText(att, 14, hudTop - 8)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(att, 14, hudTop - 8)
  }

  useImperativeHandle(ref, () => ({
    update(distFrac: number, altitudeM: number) {
      distRef.current = distFrac
      altRef.current = altitudeM
    },
    zoom(factor: number) {
      view.current.ppd = clamp(view.current.ppd * factor, MIN_PPD, MAX_PPD)
      drawScene()
    },
    recenter() {
      camMode.current = 'free'
      fitView()
      drawScene()
    },
  }))

  useEffect(() => {
    const loop = () => {
      drawScene()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, aircraft, livery])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      size.current = { w, h }
      if (!fitted.current) { fitView(); fitted.current = true }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const rel = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const interact = () => {
      camMode.current = 'free'
      onUserInteract()
    }
    const zoomAt = (x: number, y: number, factor: number) => {
      const before = unproject(x, y)
      view.current.ppd = clamp(view.current.ppd * factor, MIN_PPD, MAX_PPD)
      const after = unproject(x, y)
      view.current.cLon += before.lon - after.lon
      view.current.cLat = clamp(view.current.cLat + before.lat - after.lat, -84, 84)
      drawScene()
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      interact()
      const { x, y } = rel(e)
      zoomAt(x, y, Math.exp(-e.deltaY * 0.0015))
    }
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault()
      interact()
      const { x, y } = rel(e)
      zoomAt(x, y, 1.9)
    }

    let dragging = false
    let lx = 0
    let ly = 0
    const onDown = (e: MouseEvent) => { dragging = true; const p = rel(e); lx = p.x; ly = p.y }
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      interact()
      const p = rel(e)
      const a = unproject(lx, ly)
      const b = unproject(p.x, p.y)
      view.current.cLon -= b.lon - a.lon
      view.current.cLat = clamp(view.current.cLat - (b.lat - a.lat), -84, 84)
      lx = p.x
      ly = p.y
      drawScene()
    }
    const onUp = () => { dragging = false }

    let touchDist = 0
    let tx = 0
    let ty = 0
    const onTouchStart = (e: TouchEvent) => {
      interact()
      if (e.touches.length === 1) { const p = rel(e.touches[0]); tx = p.x; ty = p.y }
      else if (e.touches.length === 2) {
        touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      interact()
      if (e.touches.length === 1) {
        const p = rel(e.touches[0])
        const a = unproject(tx, ty)
        const b = unproject(p.x, p.y)
        view.current.cLon -= b.lon - a.lon
        view.current.cLat = clamp(view.current.cLat - (b.lat - a.lat), -84, 84)
        tx = p.x
        ty = p.y
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        const mid = rel({ clientX: (e.touches[0].clientX + e.touches[1].clientX) / 2, clientY: (e.touches[0].clientY + e.touches[1].clientY) / 2 })
        if (touchDist > 0) zoomAt(mid.x, mid.y, d / touchDist)
        touchDist = d
      }
      drawScene()
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('dblclick', onDblClick)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  return (
    <div ref={wrapRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab' }} />
    </div>
  )
})

export default FlightCanvas
export type { LngLat }
