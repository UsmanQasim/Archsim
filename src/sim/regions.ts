export interface Location {
  id: string
  name: string
  short: string
  lat: number
  lon: number
  /** true = a cloud region you can deploy infrastructure to. false = user-only city. */
  cloud: boolean
}

export const LOCATIONS: Location[] = [
  { id: 'us-east-1', name: 'N. Virginia (us-east-1)', short: 'USE', lat: 38.9, lon: -77.4, cloud: true },
  { id: 'us-west-2', name: 'Oregon (us-west-2)', short: 'USW', lat: 45.6, lon: -121.2, cloud: true },
  { id: 'ca-central-1', name: 'Montreal (ca-central-1)', short: 'CAN', lat: 45.5, lon: -73.6, cloud: true },
  { id: 'sa-east-1', name: 'São Paulo (sa-east-1)', short: 'SAO', lat: -23.5, lon: -46.6, cloud: true },
  { id: 'eu-west-1', name: 'Ireland (eu-west-1)', short: 'EUW', lat: 53.3, lon: -6.3, cloud: true },
  { id: 'eu-central-1', name: 'Frankfurt (eu-central-1)', short: 'EUC', lat: 50.1, lon: 8.7, cloud: true },
  { id: 'me-central-1', name: 'UAE (me-central-1)', short: 'UAE', lat: 25.2, lon: 55.3, cloud: true },
  { id: 'ap-south-1', name: 'Mumbai (ap-south-1)', short: 'BOM', lat: 19.1, lon: 72.9, cloud: true },
  { id: 'ap-southeast-1', name: 'Singapore (ap-southeast-1)', short: 'SIN', lat: 1.35, lon: 103.8, cloud: true },
  { id: 'ap-northeast-1', name: 'Tokyo (ap-northeast-1)', short: 'TYO', lat: 35.7, lon: 139.7, cloud: true },
  { id: 'ap-southeast-2', name: 'Sydney (ap-southeast-2)', short: 'SYD', lat: -33.9, lon: 151.2, cloud: true },
  { id: 'af-south-1', name: 'Cape Town (af-south-1)', short: 'CPT', lat: -33.9, lon: 18.4, cloud: true },
  // user-only cities
  { id: 'city-nyc', name: 'New York', short: 'NYC', lat: 40.7, lon: -74.0, cloud: false },
  { id: 'city-sf', name: 'San Francisco', short: 'SFO', lat: 37.8, lon: -122.4, cloud: false },
  { id: 'city-london', name: 'London', short: 'LON', lat: 51.5, lon: -0.1, cloud: false },
  { id: 'city-karachi', name: 'Karachi', short: 'KHI', lat: 24.9, lon: 67.0, cloud: false },
  { id: 'city-lahore', name: 'Lahore', short: 'LHE', lat: 31.5, lon: 74.3, cloud: false },
  { id: 'city-lagos', name: 'Lagos', short: 'LOS', lat: 6.5, lon: 3.4, cloud: false },
  { id: 'city-jakarta', name: 'Jakarta', short: 'JKT', lat: -6.2, lon: 106.8, cloud: false },
  { id: 'city-seoul', name: 'Seoul', short: 'SEL', lat: 37.6, lon: 127.0, cloud: false },
  { id: 'city-mexico', name: 'Mexico City', short: 'MEX', lat: 19.4, lon: -99.1, cloud: false },
]

export const GLOBAL = 'global'

const byId = new Map(LOCATIONS.map((l) => [l.id, l]))
export const getLocation = (id: string): Location | undefined => byId.get(id)
export const cloudRegions = LOCATIONS.filter((l) => l.cloud)

export function distanceKm(a: string, b: string): number {
  const A = byId.get(a)
  const B = byId.get(b)
  if (!A || !B) return 0
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(B.lat - A.lat)
  const dLon = toRad(B.lon - A.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(A.lat)) * Math.cos(toRad(B.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Round-trip network latency in ms. Fibre ≈ 200 km/ms one way, routes are not straight → ~1 ms per 100 km RTT. */
export function rttMs(a: string, b: string): number {
  if (a === b) return 0.5
  return distanceKm(a, b) / 100 + 2
}

export const regionShort = (id: string) => (id === GLOBAL ? 'GLB' : byId.get(id)?.short ?? '?')
