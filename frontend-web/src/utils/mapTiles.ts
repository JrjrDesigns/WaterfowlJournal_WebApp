// Esri World Imagery — free, no API key required.
export const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_ATTRIBUTION = '&copy; <a href="https://www.esri.com/">Esri</a>'
export const SATELLITE_MAX_ZOOM = 19

// Transparent Esri reference overlays (roads + place labels), stacked on top of the base
// imagery to replicate Esri's "Imagery Hybrid" look. Same free arcgisonline.com service
// as the base layer above — no API key required.
export const SATELLITE_ROADS_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_LABELS_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

export type MapMode = 'street' | 'satellite'

export const STREET_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const STREET_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const STREET_MAX_ZOOM = 19
