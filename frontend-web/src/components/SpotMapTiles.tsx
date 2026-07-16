import { TileLayer } from 'react-leaflet'
import {
  STREET_TILE_URL, STREET_ATTRIBUTION, STREET_MAX_ZOOM,
  SATELLITE_TILE_URL, SATELLITE_ATTRIBUTION, SATELLITE_MAX_ZOOM,
} from '../utils/mapTiles'
import type { MapMode } from '../utils/mapTiles'

interface Props {
  mode: MapMode
}

export default function SpotMapTiles({ mode }: Props) {
  if (mode === 'satellite') {
    return (
      <TileLayer
        key="satellite"
        url={SATELLITE_TILE_URL}
        attribution={SATELLITE_ATTRIBUTION}
        maxZoom={SATELLITE_MAX_ZOOM}
      />
    )
  }
  return (
    <TileLayer
      key="street"
      url={STREET_TILE_URL}
      attribution={STREET_ATTRIBUTION}
      maxZoom={STREET_MAX_ZOOM}
    />
  )
}
