import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import * as THREE from 'three'
import { greatCirclePoints, type LngLat } from '../lib/geo'

// Interactive 3D Earth (three.js) that behaves like the flat map, but on a
// sphere: a base tile texture for the whole planet plus dynamic LOD overlay
// patches (curved tile meshes) that stream in as you zoom — satellite imagery
// gets CARTO label tiles composited on top so place names appear, exactly
// like the 2D map. Supports flown-route arcs, and a live flight with the KLM
// photo sprite (constant screen size) and subtle nav lights.

export interface GlobeRoute {
  from: LngLat
  to: LngLat
}

export interface GlobeHandle {
  focus: (lon: number, lat: number) => void
  /** live flight: move the plane marker + flown arc to this progress (0..1) */
  setProgress: (distFrac: number) => void
}

const D2R = Math.PI / 180
const mercN = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * D2R) / 2))
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}
const lonToTile = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const latToTile = (lat: number, z: number) => {
  const c = Math.max(-85.05, Math.min(85.05, lat))
  return ((1 - Math.log(Math.tan(c * D2R) + 1 / Math.cos(c * D2R)) / Math.PI) / 2) * 2 ** z
}

const SUB = 'abcd'
const esriURL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const cartoURL = (z: number, x: number, y: number) =>
  `https://${SUB[(x + y) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
const labelsURL = (z: number, x: number, y: number) =>
  `https://${SUB[(x + y) % 4]}.basemaps.cartocdn.com/dark_only_labels/${z}/${x}/${y}.png`

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function buildEarthTexture(style: 'dark' | 'sat', onUpdate: () => void): THREE.CanvasTexture {
  const Z = 4
  const n = 2 ** Z
  const canvas = document.createElement('canvas')
  canvas.width = 256 * n
  canvas.height = 256 * n
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = style === 'sat' ? '#0c1526' : '#101418'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        ctx.drawImage(img, x * 256, y * 256, 256, 256)
        tex.needsUpdate = true
        onUpdate()
      }
      img.src = style === 'sat' ? esriURL(Z, x, y) : cartoURL(Z, x, y)
    }
  }
  return tex
}

/** sphere with Web-Mercator V mapping so the tile texture lines up */
function buildEarthGeometry(radius: number): THREE.SphereGeometry {
  const geo = new THREE.SphereGeometry(radius, 96, 72)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const maxN = mercN(85.05)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const lat = Math.asin(Math.max(-1, Math.min(1, y / radius))) / D2R
    const clamped = Math.max(-85.05, Math.min(85.05, lat))
    const v = 0.5 + mercN(clamped) / (2 * maxN)
    uv.setY(i, v)
  }
  uv.needsUpdate = true
  return geo
}

function lonLatToVec3(lon: number, lat: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * D2R
  const theta = lon * D2R
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    -r * Math.sin(phi) * Math.sin(theta),
  )
}

const TILE_R = 1.0012 // overlay patches sit just above the base sphere

/** curved tile patch: grid in equal-Mercator rows so the texture maps exactly */
function buildPatchGeometry(z: number, x: number, y: number): THREE.BufferGeometry {
  const lonW = tile2lon(x, z)
  const lonE = tile2lon(x + 1, z)
  const mTop = mercN(tile2lat(y, z))
  const mBot = mercN(tile2lat(y + 1, z))
  const SEG = 6
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= SEG; r++) {
    const m = mTop + ((mBot - mTop) * r) / SEG
    const lat = Math.atan(Math.sinh(m)) / D2R
    for (let c = 0; c <= SEG; c++) {
      const lon = lonW + ((lonE - lonW) * c) / SEG
      const p = lonLatToVec3(lon, lat, TILE_R)
      positions.push(p.x, p.y, p.z)
      const nrm = p.clone().normalize()
      normals.push(nrm.x, nrm.y, nrm.z)
      uvs.push(c / SEG, 1 - r / SEG)
    }
  }
  for (let r = 0; r < SEG; r++) {
    for (let c = 0; c < SEG; c++) {
      const a = r * (SEG + 1) + c
      const b = a + SEG + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

/** tile image for a patch: satellite + label overlay, or dark CARTO (labels baked in) */
async function makePatchTexture(
  style: 'dark' | 'sat',
  z: number,
  x: number,
  y: number,
): Promise<THREE.Texture | null> {
  try {
    if (style === 'dark') {
      const img = await loadImg(cartoURL(z, x, y))
      const tex = new THREE.Texture(img)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      tex.needsUpdate = true
      return tex
    }
    const base = await loadImg(esriURL(z, x, y))
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(base, 0, 0, 256, 256)
    try {
      const labels = await loadImg(labelsURL(z, x, y))
      ctx.drawImage(labels, 0, 0, 256, 256)
    } catch {
      /* labels are optional */
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  } catch {
    return null
  }
}

interface GlobeProps {
  routes: GlobeRoute[]
  /** active flight path (densified [lon,lat] points) — drawn + followed live */
  flightPoints?: LngLat[]
  /** tile style, mirrors the 2D map setting */
  mapStyle?: 'dark' | 'sat'
}

const GlobeView = forwardRef<GlobeHandle, GlobeProps>(function GlobeView(
  { routes, flightPoints, mapStyle = 'sat' },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const targetRot = useRef({ x: 0.45, y: 0.3 })
  const dist = useRef(2.7)
  const progress = useRef(0)
  const userTouched = useRef(false)

  useImperativeHandle(ref, () => ({
    focus(lon: number, lat: number) {
      targetRot.current = { x: lat * D2R, y: -(lon + 90) * D2R }
    },
    setProgress(distFrac: number) {
      progress.current = distFrac
    },
  }))

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(w, h)
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.02, 20)
    camera.position.set(0, 0, dist.current)

    const group = new THREE.Group()
    scene.add(group)

    let raf = 0
    const tex = buildEarthTexture(mapStyle, () => {})
    const earth = new THREE.Mesh(
      buildEarthGeometry(1),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }),
    )
    group.add(earth)

    // subtle atmosphere rim
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.015, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x6db3ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      }),
    )
    group.add(atmo)

    // ---- dynamic LOD tile overlay: the globe streams tiles like the map ----
    const tileGroup = new THREE.Group()
    group.add(tileGroup)
    const tileCache = new Map<string, { mesh: THREE.Mesh | null }>()
    let lastTileUpdate = 0

    const disposeTile = (entry: { mesh: THREE.Mesh | null }) => {
      if (!entry.mesh) return
      tileGroup.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      const m = entry.mesh.material as THREE.MeshStandardMaterial
      m.map?.dispose()
      m.dispose()
    }

    const updateTiles = () => {
      const d = camera.position.z
      const needed = new Set<string>()
      if (d < 2.05) {
        const latC = Math.max(-85, Math.min(85, group.rotation.x / D2R))
        let lonC = -(group.rotation.y / D2R) - 90
        lonC = ((((lonC + 180) % 360) + 360) % 360) - 180
        const aspect = Math.max(1.2, w / h)
        const latSpan = Math.min(40, Math.max(1.2, 22 * (d - 1)))
        const lonSpan = Math.min(60, (latSpan * aspect * 1.15) / Math.max(0.25, Math.cos(latC * D2R)))
        // retina-equivalent zoom bias like the 2D map; if the viewport needs
        // too many tiles at that level, step down until the budget fits
        let zt = Math.max(5, Math.min(10, Math.round(6 + Math.log2(0.62 / Math.max(0.02, d - 1)))))
        for (; zt >= 5; zt--) {
          const n = 2 ** zt
          const x0 = Math.floor(lonToTile(lonC - lonSpan, zt))
          const x1 = Math.floor(lonToTile(lonC + lonSpan, zt))
          const y0 = Math.max(0, Math.floor(latToTile(latC + latSpan, zt)))
          const y1 = Math.min(n - 1, Math.floor(latToTile(latC - latSpan, zt)))
          if ((x1 - x0 + 1) * (y1 - y0 + 1) > 176) continue
          for (let tx = x0; tx <= x1; tx++) {
            const wx = ((tx % n) + n) % n
            for (let ty = y0; ty <= y1; ty++) needed.add(`${zt}/${wx}/${ty}`)
          }
          break
        }
      }
      for (const [key, entry] of tileCache) {
        if (!needed.has(key)) {
          disposeTile(entry)
          tileCache.delete(key)
        }
      }
      for (const key of needed) {
        if (tileCache.has(key)) continue
        const entry: { mesh: THREE.Mesh | null } = { mesh: null }
        tileCache.set(key, entry)
        const [zs, xs, ys] = key.split('/').map(Number)
        void makePatchTexture(mapStyle, zs, xs, ys).then((ptex) => {
          if (!ptex) {
            tileCache.delete(key)
            return
          }
          if (tileCache.get(key) !== entry) {
            ptex.dispose()
            return
          }
          const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, map: ptex })
          const mesh = new THREE.Mesh(buildPatchGeometry(zs, xs, ys), mat)
          entry.mesh = mesh
          tileGroup.add(mesh)
        })
      }
    }

    // flown routes as raised arcs + endpoint dots
    const arcMat = new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.95 })
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const dotGeo = new THREE.SphereGeometry(0.007, 8, 8)
    for (const r of routes) {
      const pts = greatCirclePoints(r.from, r.to, 72)
      const vecs = pts.map((p, i) => {
        const t = i / (pts.length - 1)
        const lift = 1.004 + Math.sin(t * Math.PI) * 0.03
        return lonLatToVec3(p[0], p[1], lift)
      })
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vecs), arcMat))
      for (const end of [r.from, r.to]) {
        const dot = new THREE.Mesh(dotGeo, dotMat)
        dot.position.copy(lonLatToVec3(end[0], end[1], 1.005))
        group.add(dot)
      }
    }

    // live flight: dim planned arc, bright flown arc (drawRange), photo plane
    let flightVecs: THREE.Vector3[] = []
    let flownLine: THREE.Line | null = null
    let planeDot: THREE.Mesh | null = null
    let planeSprite: THREE.Mesh | null = null
    const navLights: { mesh: THREE.Mesh; kind: 'nav' | 'strobe' | 'beacon' }[] = []
    if (flightPoints && flightPoints.length > 2) {
      // keep the user's zoom across style-switch re-inits; only leave menu default
      if (dist.current > 2.2) dist.current = 1.62
      camera.position.z = dist.current
      // open the globe already centred on the flight (no fly-to animation)
      const dep = flightPoints[Math.floor(progress.current * (flightPoints.length - 1))]
      targetRot.current = { x: dep[1] * D2R, y: -(dep[0] + 90) * D2R }
      group.rotation.set(targetRot.current.x, targetRot.current.y, 0)
      flightVecs = flightPoints.map((p, i) => {
        const t = i / (flightPoints.length - 1)
        const lift = 1.004 + Math.sin(t * Math.PI) * 0.028
        return lonLatToVec3(p[0], p[1], lift)
      })
      const planned = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(flightVecs),
        new THREE.LineBasicMaterial({ color: 0x8fb6e8, transparent: true, opacity: 0.5 }),
      )
      group.add(planned)
      const flownGeo = new THREE.BufferGeometry().setFromPoints(flightVecs)
      flownGeo.setDrawRange(0, 1)
      flownLine = new THREE.Line(
        flownGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }),
      )
      group.add(flownLine)
      planeDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      )
      group.add(planeDot)
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x9fd2ff, transparent: true, opacity: 0.35 }),
      )
      planeDot.add(glow)
      // the real aircraft: photo sprite tangent to the sphere, nose along track
      new THREE.TextureLoader().load('/plane-klm-top.png', (pt) => {
        pt.colorSpace = THREE.SRGBColorSpace
        const pmat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false })
        planeSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.0532), pmat)
        planeSprite.renderOrder = 3
        group.add(planeSprite)
        if (planeDot) planeDot.visible = false
        // subtle nav lights: red L / green R / white tail + strobes + beacon
        const light = (x: number, y: number, r: number, color: number, kind: 'nav' | 'strobe' | 'beacon') => {
          const m = new THREE.Mesh(
            new THREE.CircleGeometry(r, 10),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: 0,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          )
          m.position.set(x, y, 0.0006)
          m.renderOrder = 4
          planeSprite!.add(m)
          navLights.push({ mesh: m, kind })
        }
        light(-0.0238, -0.0027, 0.0011, 0xff4838, 'nav')
        light(0.0238, -0.0027, 0.0011, 0x50ff78, 'nav')
        light(0, -0.025, 0.001, 0xffffff, 'nav')
        light(-0.0238, -0.0027, 0.0016, 0xffffff, 'strobe')
        light(0.0238, -0.0027, 0.0016, 0xffffff, 'strobe')
        light(0, 0.0027, 0.0012, 0xff2828, 'beacon')
      })
    }

    scene.add(new THREE.AmbientLight(0xffffff, 1.55))
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.4)
    sun.position.set(4, 2, 3)
    scene.add(sun)

    // interaction — drag/zoom sensitivity scales with altitude, like a map
    let dragging = false
    let lx = 0
    let ly = 0
    let idle = 0
    const zoomFrac = () => Math.min(1, Math.max(0.04, (dist.current - 1) / 0.62))
    const onDown = (e: PointerEvent) => {
      dragging = true
      userTouched.current = true
      lx = e.clientX
      ly = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      idle = 0
      const sens = 0.005 * zoomFrac()
      targetRot.current.y += (e.clientX - lx) * sens
      targetRot.current.x = Math.max(-1.45, Math.min(1.45, targetRot.current.x + (e.clientY - ly) * sens))
      lx = e.clientX
      ly = e.clientY
    }
    const onUp = () => (dragging = false)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // multiplicative on height above the surface → natural map-like zoom
      const t = (dist.current - 1) * Math.exp(e.deltaY * 0.001)
      dist.current = 1 + Math.max(flightPoints ? 0.045 : 0.14, Math.min(3, t))
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.style.touchAction = 'none'

    const loop = () => {
      idle++
      // live flight: advance flown arc + plane marker, follow unless user took over
      if (flightPoints && flightVecs.length && flownLine && planeDot) {
        const n = flightVecs.length
        const idx = Math.max(1, Math.min(n - 1, Math.floor(progress.current * (n - 1))))
        flownLine.geometry.setDrawRange(0, idx + 1)
        planeDot.position.copy(flightVecs[idx])
        if (planeSprite) {
          const nrm = flightVecs[idx].clone().normalize()
          planeSprite.position.copy(flightVecs[idx].clone().multiplyScalar(1.006))
          const ahead = flightVecs[Math.min(n - 1, idx + 1)].clone().sub(flightVecs[Math.max(0, idx - 1)])
          const tang = ahead.sub(nrm.clone().multiplyScalar(ahead.dot(nrm)))
          if (tang.lengthSq() > 1e-10) {
            tang.normalize()
            const side = new THREE.Vector3().crossVectors(tang, nrm)
            planeSprite.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, tang, nrm))
          }
          // constant SCREEN size: shrink the sprite as the camera comes closer
          planeSprite.scale.setScalar(Math.min(1.4, Math.max(0.05, (camera.position.z - 1) / 0.62)))
          const tm = performance.now()
          const sp = tm % 1400
          const strobeOn = (sp >= 0 && sp < 70) || (sp >= 150 && sp < 220)
          const beacon = Math.max(0, Math.sin(((tm % 1200) / 1200) * Math.PI * 2)) ** 3
          for (const l of navLights) {
            const mat = l.mesh.material as THREE.MeshBasicMaterial
            if (l.kind === 'nav') mat.opacity = 0.55
            else if (l.kind === 'strobe') mat.opacity = strobeOn ? 0.85 : 0
            else mat.opacity = beacon * 0.5
          }
        }
        if (!userTouched.current) {
          const gp = flightPoints[idx]
          targetRot.current = { x: gp[1] * D2R, y: -(gp[0] + 90) * D2R }
        }
      }
      if (!dragging && idle > 180 && !flightPoints) targetRot.current.y += 0.0012 // gentle auto-spin
      group.rotation.y += (targetRot.current.y - group.rotation.y) * 0.08
      group.rotation.x += (targetRot.current.x - group.rotation.x) * 0.08
      camera.position.z += (dist.current - camera.position.z) * 0.1
      const tm2 = performance.now()
      if (tm2 - lastTileUpdate > 400) {
        lastTileUpdate = tm2
        updateTiles()
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      const nw = wrap.clientWidth
      const nh = wrap.clientHeight
      renderer.setSize(nw, nh)
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
    })
    ro.observe(wrap)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      for (const entry of tileCache.values()) disposeTile(entry)
      tileCache.clear()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, mapStyle])

  return <div ref={wrapRef} className="absolute inset-0" />
})

export default GlobeView
