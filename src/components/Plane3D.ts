import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Aircraft, Livery } from '../types'

// Real-time 3D aircraft rendered to an offscreen WebGL canvas, drawn onto the
// 2D map each frame. The model is yawed to the current heading while the light
// stays fixed in the world, so the shading behaves like a real sun.
//
// If /models/klm-747.glb exists (e.g. the CC-BY "Klm 747 200" from Sketchfab,
// downloaded manually), it replaces the built-in procedural 747 for the
// KLM + 747 combination. Drop the file in public/models/ — nothing else needed.

const SIZE = 220 // offscreen render resolution
const GLB_URL = '/models/klm-747.glb'
// extra yaw if the downloaded model's nose doesn't point "forward" (degrees)
const GLB_YAW_DEG = 0

let glbCache: Promise<THREE.Group | null> | null = null

function loadGLB(): Promise<THREE.Group | null> {
  if (!glbCache) {
    glbCache = new Promise((resolve) => {
      new GLTFLoader().load(
        GLB_URL,
        (gltf) => {
          const src = gltf.scene
          // normalize: centre at origin, longest horizontal axis -> Z (fuselage)
          const box = new THREE.Box3().setFromObject(src)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          src.position.sub(center)
          const wrap = new THREE.Group()
          wrap.add(src)
          if (size.x > size.z) wrap.rotation.y = Math.PI / 2
          wrap.rotation.y += (GLB_YAW_DEG * Math.PI) / 180
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const s = 9.8 / maxDim
          wrap.scale.setScalar(s)
          // eslint-disable-next-line no-console
          console.log('[Plane3D] GLB model loaded from', GLB_URL)
          resolve(wrap)
        },
        undefined,
        () => resolve(null), // not present -> procedural fallback
      )
    })
  }
  return glbCache
}

function shape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1])
  s.closePath()
  return s
}

export class Plane3D {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private model: THREE.Group
  readonly canvas: HTMLCanvasElement

  constructor(aircraft: Aircraft, livery: Livery) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = SIZE
    this.canvas.height = SIZE
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    })
    this.renderer.setSize(SIZE, SIZE, false)
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new THREE.Scene()
    const ext = 5.6
    this.camera = new THREE.OrthographicCamera(-ext, ext, ext, -ext, 0.1, 100)
    // almost top-down with a slight tilt for depth; screen-up = -Z (the nose)
    this.camera.position.set(0, 20, 4.2)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(0, 0, 0)

    // fixed "sun" + soft ambient
    const sun = new THREE.DirectionalLight(0xffffff, 2.1)
    sun.position.set(4, 9, 3)
    this.scene.add(sun)
    this.scene.add(new THREE.AmbientLight(0xbfd4e6, 1.15))

    this.model = new THREE.Group()
    this.model.add(buildAirliner(aircraft, livery))
    this.scene.add(this.model)

    // swap in the downloaded KLM 747 GLB when available (KLM + 747 only)
    if (aircraft.silhouette === 'b747' && livery.id === 'klm') {
      void loadGLB().then((glb) => {
        if (!glb || this.disposed) return
        this.model.clear()
        this.model.add(glb.clone(true))
      })
    }
  }

  private disposed = false

  /** render at the given heading (deg, 0 = north/up) and return the canvas */
  render(headingDeg: number): HTMLCanvasElement {
    this.model.rotation.y = (-headingDeg * Math.PI) / 180
    this.renderer.render(this.scene, this.camera)
    return this.canvas
  }

  dispose() {
    this.disposed = true
    this.renderer.dispose()
  }
}

function buildAirliner(aircraft: Aircraft, livery: Livery): THREE.Group {
  const g = new THREE.Group()

  const blue = new THREE.MeshPhongMaterial({ color: livery.fuselage, shininess: 55 })
  const belly = new THREE.MeshPhongMaterial({ color: '#eef2f6', shininess: 45 })
  const wingMat = new THREE.MeshPhongMaterial({ color: '#c6ccd4', shininess: 25 })
  const tailMat = new THREE.MeshPhongMaterial({ color: livery.tail, shininess: 45 })
  const engMat = new THREE.MeshPhongMaterial({ color: '#d9dde2', shininess: 60 })
  const darkMat = new THREE.MeshPhongMaterial({ color: '#141a22', shininess: 10 })

  const L = 8.4 // fuselage length
  const R = 0.62 // fuselage radius
  const four = aircraft.engines >= 4
  const isB747 = aircraft.silhouette === 'b747'

  // --- fuselage: blue upper half + white belly (two half-cylinders) ---
  // after rotation.x = 90° the arc θ∈(π/2..3π/2) faces world-up
  const topHalf = new THREE.CylinderGeometry(R, R, L, 28, 1, true, Math.PI / 2, Math.PI)
  const botHalf = new THREE.CylinderGeometry(R, R, L, 28, 1, true, -Math.PI / 2, Math.PI)
  for (const [geo, mat] of [
    [topHalf, blue],
    [botHalf, belly],
  ] as const) {
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = Math.PI / 2 // axis along Z, nose = -Z
    g.add(m)
  }

  // nose cone (blue over white, slightly squashed sphere)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), blue)
  nose.scale.set(1, 0.96, 1.6)
  nose.position.z = -L / 2
  g.add(nose)
  // cockpit windows
  const win = new THREE.Mesh(new THREE.TorusGeometry(R * 0.82, 0.055, 8, 24, Math.PI * 0.9), darkMat)
  win.rotation.x = Math.PI / 2
  win.rotation.z = Math.PI * 1.05
  win.position.set(0, R * 0.28, -L / 2 - 0.52)
  g.add(win)

  // tail cone
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, 0.1, 2.4, 24), belly)
  tailCone.rotation.x = -Math.PI / 2
  tailCone.position.z = L / 2 + 1.2
  g.add(tailCone)

  // --- 747 upper-deck hump ---
  if (isB747) {
    const hump = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.72, R * 0.72, 2.9, 22, 1, false, Math.PI / 2, Math.PI),
      blue,
    )
    hump.rotation.x = Math.PI / 2
    hump.position.set(0, R * 0.52, -L / 2 + 1.9)
    hump.scale.y = 1.15
    g.add(hump)
  }

  // --- wings (swept planform, one piece) ---
  const span = 4.6
  const wingShape = shape([
    [-0.55, -0.4],
    [-span, 1.9],
    [-span + 0.45, 2.35],
    [-0.35, 1.15],
    [0.35, 1.15],
    [span - 0.45, 2.35],
    [span, 1.9],
    [0.55, -0.4],
  ])
  const wing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(wingShape, { depth: 0.09, bevelEnabled: false }),
    wingMat,
  )
  wing.rotation.x = Math.PI / 2 // lay flat (shape Y -> world Z, aft positive)
  wing.position.set(0, -R * 0.25, -0.5)
  g.add(wing)

  // --- horizontal stabilizers ---
  const stabShape = shape([
    [-0.25, 0],
    [-1.55, 0.75],
    [-1.55, 1.0],
    [-0.2, 0.55],
    [0.2, 0.55],
    [1.55, 1.0],
    [1.55, 0.75],
    [0.25, 0],
  ])
  const stab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(stabShape, { depth: 0.06, bevelEnabled: false }),
    belly,
  )
  stab.rotation.x = Math.PI / 2
  stab.position.set(0, 0.12, L / 2 + 0.9)
  g.add(stab)

  // --- vertical fin (blue): shape-x = aft along fuselage, shape-y = height ---
  const finShape = shape([
    [0, 0],
    [1.15, 2.15],
    [1.95, 2.15],
    [2.45, 0],
  ])
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: false }),
    tailMat,
  )
  fin.rotation.y = -Math.PI / 2 // (sx,sy,0) -> (0, sy, sx): vertical, running aft
  fin.position.set(0.045, R * 0.55, L / 2 - 1.05)
  g.add(fin)

  // --- engines + pylons ---
  const engZ1 = -0.15
  const engZ2 = 0.75
  const engXs = four ? [-2.6, -1.35, 1.35, 2.6] : [-1.5, 1.5]
  engXs.forEach((x, i) => {
    const outer = Math.abs(x) > 2
    const z = four && outer ? engZ2 : engZ1
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 1.05, 18), engMat)
    nac.rotation.x = Math.PI / 2
    nac.position.set(x, -R * 0.55, z)
    g.add(nac)
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18), darkMat)
    intake.position.set(x, -R * 0.55, z - 0.531)
    intake.rotation.y = Math.PI
    g.add(intake)
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.6), wingMat)
    pylon.position.set(x, -R * 0.28, z + 0.12)
    g.add(pylon)
    void i
  })

  // engine accent ring in the livery accent colour
  engXs.forEach((x) => {
    const outer = Math.abs(x) > 2
    const z = four && outer ? engZ2 : engZ1
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.03, 8, 20), blue)
    ring.position.set(x, -R * 0.55, z - 0.5)
    g.add(ring)
  })

  return g
}
