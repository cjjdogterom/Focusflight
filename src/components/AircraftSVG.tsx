import type { Aircraft, Livery } from '../types'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function cheatlineMarkup(cx: number, fw: number, y0: number, y1: number, livery: Livery): string {
  if (livery.cheatlineStyle === 'none') return ''
  // window line along both sides of the fuselage
  const w = 1.1
  const lx = cx - fw + 1.1
  const rx = cx + fw - 1.1 - w
  return `<rect x="${lx}" y="${y0}" width="${w}" height="${y1 - y0}" fill="${livery.cheatline}" opacity="0.9"/>
          <rect x="${rx}" y="${y0}" width="${w}" height="${y1 - y0}" fill="${livery.cheatline}" opacity="0.9"/>`
}

/** small KLM-style crown emblem centred at (cx, cy) */
function crownMarkup(cx: number, cy: number, color: string): string {
  const s = 3.4
  return `<g fill="${color}">
    <rect x="${cx - s}" y="${cy + s * 0.5}" width="${s * 2}" height="${s * 0.7}" rx="0.3"/>
    <path d="M${cx - s},${cy + s * 0.6} L${cx - s},${cy - s * 0.2} L${cx - s * 0.45},${cy + s * 0.3} L${cx},${cy - s * 0.7} L${cx + s * 0.45},${cy + s * 0.3} L${cx + s},${cy - s * 0.2} L${cx + s},${cy + s * 0.6} Z"/>
    <circle cx="${cx}" cy="${cy - s * 1.05}" r="${s * 0.34}"/>
    <circle cx="${cx - s}" cy="${cy - s * 0.5}" r="${s * 0.24}"/>
    <circle cx="${cx + s}" cy="${cy - s * 0.5}" r="${s * 0.24}"/>
  </g>`
}

function engineMarkup(cx: number, cy: number, rx: number, ry: number, accent: string): string {
  return `<g>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#cfd5dd" stroke="rgba(10,18,34,0.3)" stroke-width="0.5"/>
    <ellipse cx="${cx}" cy="${cy - ry * 0.55}" rx="${rx * 0.72}" ry="${ry * 0.32}" fill="#20304a"/>
    <ellipse cx="${cx}" cy="${cy + ry * 0.5}" rx="${rx * 0.8}" ry="${ry * 0.28}" fill="${accent}" opacity="0.85"/>
  </g>`
}

// ---------------------------------------------------------------------------
// Detailed Boeing 747
// ---------------------------------------------------------------------------

function buildB747SVG(livery: Livery, size: number): string {
  const cx = 50
  const fw = 6.3 // fuselage half-width
  const L = cx - fw
  const Rr = cx + fw
  const dark = 'rgba(10,18,34,0.35)'
  const wingFill = livery.fuselage

  // fuselage (long, slender widebody)
  const fuselage = `M50,3
    C54,3 ${Rr},9 ${Rr},19
    L${Rr},63 C${Rr},73 54.4,83 52.3,91 L52,95 L48,95
    C45.6,83 ${L},73 ${L},63
    L${L},19 C${L},9 46,3 50,3 Z`

  // upper-deck hump (forward)
  const hump = `M50,10 C46,10 45.2,14 45.2,20 L45.2,40 C45.2,44 47.3,46 50,46
    C52.7,46 54.8,44 54.8,40 L54.8,20 C54.8,14 54,10 50,10 Z`

  // wings (swept back)
  const rWing = `M${Rr - 0.5},44 L94,68 L94,72 L${Rr - 0.5},58 Z`
  const lWing = `M${L + 0.5},44 L6,68 L6,72 L${L + 0.5},58 Z`
  // 747-400 canted winglets (accent) at the tips
  const winglets = `<path d="M94,68 L97.5,63.5 L95.5,67 Z" fill="${livery.accent}"/>
                    <path d="M6,68 L2.5,63.5 L4.5,67 Z" fill="${livery.accent}"/>`

  // horizontal stabilizers
  const rStab = `M53,81 L70,88 L70,90.5 L53,84.5 Z`
  const lStab = `M47,81 L30,88 L30,90.5 L47,84.5 Z`

  // vertical tail fin (top-down) in tail colour
  const fin = `M50,74 L47,96 L53,96 Z`

  // engine pylons (thin connectors) + 4 engines
  const pylon = (x: number, y: number) =>
    `<rect x="${x - 0.8}" y="${y - 6.5}" width="1.6" height="5" fill="#b7bdc6"/>`
  const engines =
    pylon(63, 55) + pylon(75, 62) + pylon(37, 55) + pylon(25, 62) +
    engineMarkup(63, 55, 2.7, 6, livery.accent) +
    engineMarkup(75, 62, 2.7, 6, livery.accent) +
    engineMarkup(37, 55, 2.7, 6, livery.accent) +
    engineMarkup(25, 62, 2.7, 6, livery.accent)

  const cheat = cheatlineMarkup(cx, fw, 19, 80, livery)
  const cockpit = `<path d="M47,12 L50,10 L53,12 L52,15.5 L48,15.5 Z" fill="#0d1626" opacity="0.85"/>`

  // "KLM"-style titles along the forward fuselage
  const titles = livery.titles
    ? `<text x="${cx}" y="31.5" fill="${livery.cheatline}" font-family="Arial, sans-serif" font-weight="800" font-size="5.2" text-anchor="middle" transform="rotate(90 ${cx} 30)" letter-spacing="0.6">${livery.titles.slice(0, 8)}</text>`
    : ''

  const emblem = livery.emblemKind === 'crown' ? crownMarkup(cx, 86, livery.emblem) : ''

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g stroke="${dark}" stroke-width="0.7" stroke-linejoin="round">
      <path d="${lWing}" fill="${wingFill}"/>
      <path d="${rWing}" fill="${wingFill}"/>
      ${winglets}
      <path d="${lStab}" fill="${wingFill}"/>
      <path d="${rStab}" fill="${wingFill}"/>
      ${engines}
      <path d="${fuselage}" fill="${livery.fuselage}"/>
      <path d="${hump}" fill="${livery.fuselage}" stroke="rgba(10,18,34,0.22)" stroke-width="0.5"/>
      ${cheat}
      ${titles}
      ${cockpit}
      <path d="${fin}" fill="${livery.tail}" stroke="${dark}" stroke-width="0.5"/>
      ${emblem}
    </g>
  </svg>`
}

// ---------------------------------------------------------------------------
// Generic silhouettes (737/A320/777/787/A380/regional/prop)
// ---------------------------------------------------------------------------

interface Geom {
  fw: number
  wingRootY: number
  wingTipX: number
  wingTipY: number
  noseY: number
  tailY: number
  prop: boolean
  fourEngine: boolean
  sharklet: boolean
}

function geomFor(a: Aircraft): Geom {
  switch (a.silhouette) {
    case 'prop':
      return { fw: 5, wingRootY: 34, wingTipX: 10, wingTipY: 40, noseY: 8, tailY: 90, prop: true, fourEngine: false, sharklet: false }
    case 'regional':
      return { fw: 5.4, wingRootY: 46, wingTipX: 12, wingTipY: 62, noseY: 8, tailY: 90, prop: false, fourEngine: false, sharklet: false }
    case 'b737':
      return { fw: 6, wingRootY: 44, wingTipX: 9, wingTipY: 62, noseY: 6, tailY: 92, prop: false, fourEngine: false, sharklet: false }
    case 'a320':
      return { fw: 6, wingRootY: 44, wingTipX: 8, wingTipY: 62, noseY: 6, tailY: 92, prop: false, fourEngine: false, sharklet: true }
    case 'b777':
      return { fw: 7.6, wingRootY: 44, wingTipX: 5, wingTipY: 64, noseY: 5, tailY: 94, prop: false, fourEngine: false, sharklet: false }
    case 'a380':
      return { fw: 9, wingRootY: 42, wingTipX: 4, wingTipY: 63, noseY: 5, tailY: 94, prop: false, fourEngine: true, sharklet: false }
    case 'b787':
    default:
      return { fw: 7.2, wingRootY: 44, wingTipX: 5, wingTipY: 64, noseY: 5, tailY: 94, prop: false, fourEngine: false, sharklet: true }
  }
}

function buildGenericSVG(a: Aircraft, livery: Livery, size: number): string {
  const g = geomFor(a)
  const cx = 50
  const L = cx - g.fw
  const Rr = cx + g.fw
  const dark = 'rgba(10,18,34,0.35)'

  const fuselage = `M50,${g.noseY}
    C${L + 1},${g.noseY} ${L},${g.noseY + 8} ${L},${g.noseY + 16}
    L${L},${g.tailY - 20} C${L},${g.tailY - 10} ${L + 1.5},${g.tailY - 3} 50,${g.tailY}
    C${Rr - 1.5},${g.tailY - 3} ${Rr},${g.tailY - 10} ${Rr},${g.tailY - 20}
    L${Rr},${g.noseY + 16} C${Rr},${g.noseY + 8} ${Rr - 1},${g.noseY} 50,${g.noseY} Z`

  const wingTipYEnd = g.wingTipY + 5
  const leftWing = `M${cx - 1},${g.wingRootY} L${g.wingTipX},${g.wingTipY} L${g.wingTipX + 4},${wingTipYEnd} L${cx - 1},${g.wingRootY + 13} Z`
  const rightWing = `M${cx + 1},${g.wingRootY} L${100 - g.wingTipX},${g.wingTipY} L${100 - g.wingTipX - 4},${wingTipYEnd} L${cx + 1},${g.wingRootY + 13} Z`

  const sharklets = g.sharklet
    ? `<path d="M${g.wingTipX},${g.wingTipY} L${g.wingTipX - 2},${g.wingTipY - 4} L${g.wingTipX + 1},${g.wingTipY - 1} Z" fill="${livery.accent}"/>
       <path d="M${100 - g.wingTipX},${g.wingTipY} L${100 - g.wingTipX + 2},${g.wingTipY - 4} L${100 - g.wingTipX - 1},${g.wingTipY - 1} Z" fill="${livery.accent}"/>`
    : ''

  const stabY = g.tailY - 12
  const leftStab = `M${cx - 1},${stabY} L${cx - 16},${stabY + 8} L${cx - 14},${stabY + 10.5} L${cx - 1},${stabY + 5} Z`
  const rightStab = `M${cx + 1},${stabY} L${cx + 16},${stabY + 8} L${cx + 14},${stabY + 10.5} L${cx + 1},${stabY + 5} Z`
  const fin = `M50,${g.tailY - 18} L${cx - 4},${g.tailY} L${cx + 4},${g.tailY} Z`

  // engines / props
  let engines = ''
  const engY = g.wingTipY - 3
  if (g.prop) {
    for (const x of [cx - 15, cx + 15]) {
      engines += `<circle cx="${x}" cy="${g.wingRootY + 2}" r="6" fill="rgba(0,0,0,0.16)"/>
        <line x1="${x - 7}" y1="${g.wingRootY + 2}" x2="${x + 7}" y2="${g.wingRootY + 2}" stroke="#20304a" stroke-width="1.4"/>
        <line x1="${x}" y1="${g.wingRootY - 5}" x2="${x}" y2="${g.wingRootY + 9}" stroke="#20304a" stroke-width="1.4"/>
        <circle cx="${x}" cy="${g.wingRootY + 2}" r="1.4" fill="#20304a"/>`
    }
  } else if (g.fourEngine) {
    engines =
      engineMarkup(cx - 24, engY + 4, 2.6, 5, livery.accent) +
      engineMarkup(cx - 13, engY, 2.6, 5, livery.accent) +
      engineMarkup(cx + 13, engY, 2.6, 5, livery.accent) +
      engineMarkup(cx + 24, engY + 4, 2.6, 5, livery.accent)
  } else {
    engines =
      engineMarkup(cx - 16, engY, 2.7, 5.5, livery.accent) +
      engineMarkup(cx + 16, engY, 2.7, 5.5, livery.accent)
  }

  const cheat = cheatlineMarkup(cx, g.fw, g.noseY + 10, g.tailY - 14, livery)
  const canopy = `<ellipse cx="50" cy="${g.noseY + 6}" rx="${g.fw - 1.6}" ry="3.4" fill="#0d1626" opacity="0.8"/>`
  const emblem = livery.emblemKind === 'crown' ? crownMarkup(cx, g.tailY - 7, livery.emblem) : ''

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g stroke="${dark}" stroke-width="0.7" stroke-linejoin="round">
      <path d="${leftWing}" fill="${livery.fuselage}"/>
      <path d="${rightWing}" fill="${livery.fuselage}"/>
      ${sharklets}
      <path d="${leftStab}" fill="${livery.fuselage}"/>
      <path d="${rightStab}" fill="${livery.fuselage}"/>
      ${engines}
      <path d="${fuselage}" fill="${livery.fuselage}"/>
      ${cheat}
      <path d="${fin}" fill="${livery.tail}"/>
      ${canopy}
      ${emblem}
    </g>
  </svg>`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildPlaneSVG(aircraft: Aircraft, livery: Livery, size = 96): string {
  if (aircraft.silhouette === 'b747') return buildB747SVG(livery, size)
  return buildGenericSVG(aircraft, livery, size)
}

export function AircraftSVG({
  aircraft,
  livery,
  size = 96,
  className,
}: {
  aircraft: Aircraft
  livery: Livery
  size?: number
  className?: string
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: buildPlaneSVG(aircraft, livery, size) }}
    />
  )
}
