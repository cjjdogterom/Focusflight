// Membership cards earned at flown-kilometre milestones (1 mile = 1 km flown).
// Styled as engraved metal cards, matching the reference app. Milestones follow
// real aviation history and real distances (KLM's first route, Lindbergh, the
// Uiver, the equator, a light-second, the Moon). Keep the array sorted by kmMin.

export type CardFinish =
  | 'plastic'
  | 'ceramic'
  | 'brushed'
  | 'patina'
  | 'polished'
  | 'frosted'
  | 'satin'
  | 'carbon'
  | 'iridescent'
  | 'meteorite'

export interface MembershipCard {
  id: string
  name: string
  kmMin: number
  /** material finish — the ladder runs from cheap plastic to exotic metals */
  finish: CardFinish
  /** metal gradient */
  from: string
  to: string
  /** engraved text colour */
  text: string
  /** serif tagline engraved on the card */
  tagline: string
  perk: string
  /** what this milestone means — shown when you tap the card */
  story: string
}

export const MEMBERSHIP_CARDS: MembershipCard[] = [
  {
    id: 'crew',
    story: 'Iedereen begint als crew. Je eerste kaart, vanaf je allereerste focusvlucht.',
    finish: 'plastic',
    name: 'Crew',
    kmMin: 0,
    from: '#a9bccf',
    to: '#5f7288',
    text: '#182230',
    tagline: 'Every journey starts here.',
    perk: 'Welkom aan boord',
  },
  {
    // KLM's very first route (Amsterdam–Croydon, 17 mei 1920), ±350 km —
    // the oldest still-operating air route in the world
    id: 'delft',
    story: "350 km — de afstand van KLM's allereerste lijndienst: Amsterdam–Londen, sinds 17 mei 1920 de oudste nog vliegende route ter wereld.",
    finish: 'ceramic',
    name: 'Delft Blue',
    kmMin: 350,
    from: '#9db8dd',
    to: '#46699f',
    text: '#0d1b33',
    tagline: 'The oldest route still flies.',
    perk: '350 km — de oudste luchtlijn ter wereld',
  },
  {
    id: 'bronze',
    story: '1.000 km gevlogen — ongeveer Amsterdam–Wenen. Brons hoort vóór zilver: het metaal van de leerling.',
    finish: 'patina',
    name: 'Patina Bronze',
    kmMin: 1000,
    from: '#cdb888',
    to: '#647a55',
    text: '#332d1c',
    tagline: 'Every storm leaves lustre.',
    perk: '1.000 km gevlogen',
  },
  {
    id: 'silver',
    story: '2.500 km — verder dan Amsterdam–Istanboel. Je hebt heel Europa in focus doorkruist.',
    finish: 'brushed',
    name: 'Silver Wing',
    kmMin: 2500,
    from: '#e9ebef',
    to: '#8f96a1',
    text: '#23282f',
    tagline: 'Lift is earned.',
    perk: '2.500 km gevlogen',
  },
  {
    // Lindbergh's 1927 New York–Paris solo was 5.808 km; duralumin is the
    // aircraft alloy of that era
    id: 'duralumin',
    story: '5.800 km — de afstand van Lindberghs solovlucht New York–Parijs in 1927. Duralumin is het vliegtuigaluminium van die pioniersjaren.',
    finish: 'brushed',
    name: 'Duralumin',
    kmMin: 5800,
    from: '#ddd3c2',
    to: '#96876f',
    text: '#2b2415',
    tagline: 'Alone above the Atlantic.',
    perk: '5.800 km — solo de oceaan over',
  },
  {
    id: 'gold',
    story: '10.000 km — ongeveer Amsterdam–Tokio, dwars over twee continenten.',
    finish: 'polished',
    name: 'Gold Crown',
    kmMin: 10000,
    from: '#eed58a',
    to: '#a1772a',
    text: '#3a2a08',
    tagline: 'Altitude becomes attitude.',
    perk: '10.000 km gevlogen',
  },
  {
    // KLM pioneered the polar route to Tokyo via Anchorage in 1958
    id: 'polar',
    story: '15.000 km. KLM pioniersde in 1958 de poolroute naar Tokio via Anchorage — over de top van de wereld.',
    finish: 'frosted',
    name: 'Polar Route',
    kmMin: 15000,
    from: '#dae7ec',
    to: '#85a9b7',
    text: '#132832',
    tagline: 'North is the shortcut.',
    perk: '15.000 km gevlogen',
  },
  {
    // the Uiver ("stork") flew ±18.200 km in the 1934 London–Melbourne race
    // and won on handicap after surviving the Albury thunderstorm
    id: 'uiver',
    story: '18.200 km — de route van de legendarische Uiver in de Londen–Melbourne-race van 1934, dwars door de storm van Albury.',
    finish: 'satin',
    name: 'Iron Stork',
    kmMin: 18200,
    from: '#a8b2ab',
    to: '#5c6961',
    text: '#131b16',
    tagline: 'Through the storm, home.',
    perk: '18.200 km — Londen–Melbourne',
  },
  {
    id: 'platinum',
    story: '25.000 km stil, ver en hoog. Meer dan een half rondje aarde.',
    finish: 'satin',
    name: 'Platinum',
    kmMin: 25000,
    from: '#f0f3f7',
    to: '#9fadbb',
    text: '#1f2831',
    tagline: 'Quiet power, long range.',
    perk: '25.000 km gevlogen',
  },
  {
    // Earth's equatorial circumference — one full lap of the planet
    id: 'greatcircle',
    story: '40.075 km — precies één keer rond de aarde langs de evenaar. Een volledig rondje om de wereld.',
    finish: 'brushed',
    name: 'Great Circle',
    kmMin: 40075,
    from: '#a9cbb4',
    to: '#4d7f61',
    text: '#0d2418',
    tagline: 'Once around everything.',
    perk: '40.075 km — de evenaar rond',
  },
  {
    id: 'diamond',
    story: '60.000 km — anderhalf keer de wereld rond, altijd boven het weer.',
    finish: 'frosted',
    name: 'Diamond Sky',
    kmMin: 60000,
    from: '#d5dbff',
    to: '#7d86c8',
    text: '#1d2350',
    tagline: 'Above the weather, always.',
    perk: '60.000 km gevlogen',
  },
  {
    // fly west and the golden hour stretches with you
    id: 'goldenhour',
    story: '90.000 km. Vlieg je westwaarts, dan rekt de zonsondergang met je mee — het gouden uur duurt langer daarboven.',
    finish: 'polished',
    name: 'Golden Hour',
    kmMin: 90000,
    from: '#edccbc',
    to: '#b3735f',
    text: '#3a1a10',
    tagline: 'Sunset lasts longer westbound.',
    perk: '90.000 km gevlogen',
  },
  {
    id: 'royal',
    story: '125.000 km — ruim drie keer rond de aarde. De koninklijke klasse.',
    finish: 'polished',
    name: 'Royal Dutch',
    kmMin: 125000,
    from: '#f3b47c',
    to: '#a85a1e',
    text: '#3d1e05',
    tagline: 'Break the limits.',
    perk: '125.000 km gevlogen',
  },
  {
    id: 'mach',
    story: '200.000 km — voorbij de helft van de afstand naar de maan. Sneller dan je eigen donder.',
    finish: 'carbon',
    name: 'Mach One',
    kmMin: 200000,
    from: '#d5a8a6',
    to: '#8e5053',
    text: '#2b0d0f',
    tagline: 'Ahead of your own thunder.',
    perk: '200.000 km gevlogen',
  },
  {
    // the distance light travels in one second
    id: 'lightsecond',
    story: '299.792 km — exact de afstand die licht aflegt in één seconde. Jij deed er iets langer over.',
    finish: 'iridescent',
    name: 'Light Second',
    kmMin: 299792,
    from: '#c7b2c9',
    to: '#7b5c80',
    text: '#251329',
    tagline: 'A light-second, earned slowly.',
    perk: '299.792 km — één lichtseconde',
  },
  {
    // average Earth–Moon distance; meteorite iron is the only metal that
    // actually made the trip
    id: 'lunar',
    story: '384.400 km — de gemiddelde afstand van de aarde naar de maan. Meteorietijzer is het enige metaal dat die reis ooit echt maakte.',
    finish: 'meteorite',
    name: 'Lunar Distance',
    kmMin: 384400,
    from: '#bcae9d',
    to: '#6f6150',
    text: '#1e1710',
    tagline: 'The far shore of night.',
    perk: '384.400 km — de maan bereikt',
  },
]

export function cardsUnlocked(totalKm: number): MembershipCard[] {
  return MEMBERSHIP_CARDS.filter((c) => totalKm >= c.kmMin)
}

export function currentCard(totalKm: number): MembershipCard {
  const u = cardsUnlocked(totalKm)
  return u[u.length - 1] ?? MEMBERSHIP_CARDS[0]
}

export function nextCard(totalKm: number): MembershipCard | null {
  return MEMBERSHIP_CARDS.find((c) => totalKm < c.kmMin) ?? null
}

export function newlyUnlocked(before: number, after: number): MembershipCard[] {
  return MEMBERSHIP_CARDS.filter((c) => before < c.kmMin && after >= c.kmMin)
}

/** editorial distance fact for the card-unlock celebration (reference style) */
export function distanceFact(totalKm: number): string {
  if (totalKm >= 384400)
    return '384.400 km — de gemiddelde afstand van de aarde naar de maan. Gezagvoerder, u bent er.'
  if (totalKm >= 299792)
    return 'Licht doet over deze afstand precies één seconde. Jij deed er iets langer over — maar je bent er.'
  if (totalKm >= 192200)
    return 'Je bent halverwege de maan — vanaf hier is het net zo ver terug als vooruit.'
  if (totalKm >= 40075) {
    const laps = (totalKm / 40075).toFixed(1).replace('.', ',')
    return `Dat is ${laps}× rond de aarde langs de evenaar.`
  }
  if (totalKm >= 18200)
    return 'Verder dan Londen–Melbourne — de route van de legendarische Uiver in 1934, dwars door de storm van Albury.'
  if (totalKm >= 15350)
    return 'Verder dan de langste non-stop lijnvlucht ter wereld (Singapore–New York, ±15.350 km).'
  if (totalKm >= 9000)
    return 'Dat is ongeveer de afstand van Amsterdam naar Tokio, dwars over twee continenten.'
  if (totalKm >= 5500)
    return 'Dat is ongeveer de afstand van Amsterdam naar New York, dwars over de Atlantische Oceaan.'
  if (totalKm >= 2500)
    return 'Dat is verder dan van Amsterdam naar Istanboel — heel Europa in focus doorkruist.'
  if (totalKm >= 1000)
    return 'Dat is ongeveer Amsterdam–Wenen, non-stop. Europa wordt klein.'
  if (totalKm >= 350)
    return 'Zo ver als de allereerste KLM-route: Amsterdam–Londen, sinds 17 mei 1920.'
  return 'Elke kilometer hierboven is verdiende focus.'
}
