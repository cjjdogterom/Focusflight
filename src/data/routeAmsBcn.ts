// Real dispatched IFR route EHAM (Amsterdam Schiphol) → LEBL (Barcelona El Prat),
// taken from an actual OFP (N714SB, 03JUL2026, B737-700):
//   EHAM/18L KUDAD3E WOODY N872 MEDIL DCT KOVIN DCT DUCRA UM728 RESMI
//   UN857 DISAK DCT DIRMO DCT VALKU DCT ATSUP DCT MINSO DCT DEGOL DCT
//   PPG DCT ALBER ALBER2W LEBL/24R
// Waypoint coordinates transcribed from the OFP flight log (ddmm.m format).

export type WaypointType = 'AIRPORT' | 'VOR' | 'NDB' | 'FIX'
export type RouteSegment = 'SID' | 'ENROUTE' | 'STAR'

export interface CuratedWaypoint {
  ident: string
  type: WaypointType
  lat: number
  lon: number
  segment: RouteSegment
  /** airway/procedure used to reach this point */
  airway: string
}

export const AMS_BCN_ROUTE: CuratedWaypoint[] = [
  { ident: 'EHAM', type: 'AIRPORT', lat: 52.3083, lon: 4.765, segment: 'SID', airway: '' },
  // SID KUDAD 3E (RWY 18L)
  { ident: 'OKUDO', type: 'FIX', lat: 52.215, lon: 4.8083, segment: 'SID', airway: 'KUDAD3E' },
  { ident: 'LEKKO', type: 'FIX', lat: 51.925, lon: 4.7667, segment: 'SID', airway: 'KUDAD3E' },
  { ident: 'KUDAD', type: 'FIX', lat: 51.6667, lon: 4.5683, segment: 'SID', airway: 'KUDAD3E' },
  { ident: 'WOODY', type: 'FIX', lat: 51.405, lon: 4.3667, segment: 'SID', airway: 'KUDAD3E' },
  // airway N872 to MEDIL
  { ident: 'AMMOF', type: 'FIX', lat: 51.315, lon: 4.2983, segment: 'ENROUTE', airway: 'N872' },
  { ident: 'NIK', type: 'VOR', lat: 51.165, lon: 4.1833, segment: 'ENROUTE', airway: 'N872' },
  { ident: 'DENOX', type: 'FIX', lat: 50.88, lon: 4.0283, segment: 'ENROUTE', airway: 'N872' },
  { ident: 'CIV', type: 'VOR', lat: 50.5733, lon: 3.8333, segment: 'ENROUTE', airway: 'N872' },
  { ident: 'MEDIL', type: 'FIX', lat: 50.3417, lon: 3.675, segment: 'ENROUTE', airway: 'N872' },
  // direct legs across France, UM728/UN857 around Paris
  { ident: 'KOVIN', type: 'FIX', lat: 49.485, lon: 3.1067, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'DUCRA', type: 'FIX', lat: 48.965, lon: 2.5817, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'RESMI', type: 'FIX', lat: 48.5683, lon: 2.1917, segment: 'ENROUTE', airway: 'UM728' },
  { ident: 'DEKOD', type: 'FIX', lat: 48.2833, lon: 2.1, segment: 'ENROUTE', airway: 'UN857' },
  { ident: 'DISAK', type: 'FIX', lat: 48.1333, lon: 2.1317, segment: 'ENROUTE', airway: 'UN857' },
  { ident: 'DIRMO', type: 'FIX', lat: 47.09, lon: 2.1917, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'VALKU', type: 'FIX', lat: 45.9983, lon: 2.8183, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'ATSUP', type: 'FIX', lat: 45.7433, lon: 2.9533, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'MINSO', type: 'FIX', lat: 44.8483, lon: 2.93, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'DEGOL', type: 'FIX', lat: 43.78, lon: 2.8517, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'PPG', type: 'VOR', lat: 42.75, lon: 2.8667, segment: 'ENROUTE', airway: 'DCT' },
  { ident: 'ALBER', type: 'FIX', lat: 42.4517, lon: 2.8317, segment: 'ENROUTE', airway: 'DCT' },
  // STAR ALBER 2W (RWY 24R)
  { ident: 'CUTXE', type: 'FIX', lat: 42.1317, lon: 2.7533, segment: 'STAR', airway: 'ALBER2W' },
  { ident: 'BL469', type: 'FIX', lat: 41.8033, lon: 2.6733, segment: 'STAR', airway: 'ALBER2W' },
  { ident: 'CLE', type: 'VOR', lat: 41.64, lon: 2.635, segment: 'STAR', airway: 'ALBER2W' },
  { ident: 'LEBL', type: 'AIRPORT', lat: 41.2967, lon: 2.0783, segment: 'STAR', airway: '' },
]
