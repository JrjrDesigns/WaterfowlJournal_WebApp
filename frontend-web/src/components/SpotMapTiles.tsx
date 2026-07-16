import { TileLayer } from 'react-leaflet'
import {
  SATELLITE_TILE_URL, SATELLITE_ATTRIBUTION, SATELLITE_MAX_ZOOM,
  SATELLITE_ROADS_TILE_URL, SATELLITE_LABELS_TILE_URL,
} from '../utils/mapTiles'

export default function SpotMapTiles() {
  return (
    <>
      <TileLayer
        url={SATELLITE_TILE_URL}
        attribution={SATELLITE_ATTRIBUTION}
        maxZoom={SATELLITE_MAX_ZOOM}
      />
      <TileLayer url={SATELLITE_ROADS_TILE_URL} maxZoom={SATELLITE_MAX_ZOOM} />
      <TileLayer url={SATELLITE_LABELS_TILE_URL} maxZoom={SATELLITE_MAX_ZOOM} />
    </>
  )
}
