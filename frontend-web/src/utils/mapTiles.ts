const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

// MapTiler's "hybrid" style: satellite imagery with roads/water/place labels baked in.
// Falls back to plain Esri satellite (no labels) if no key is configured.
export const SATELLITE_TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const SATELLITE_ATTRIBUTION = MAPTILER_KEY
  ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  : '&copy; <a href="https://www.esri.com/">Esri</a>'

export const SATELLITE_MAX_ZOOM = 19

export type MapMode = 'street' | 'satellite'

export const STREET_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const STREET_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const STREET_MAX_ZOOM = 19
