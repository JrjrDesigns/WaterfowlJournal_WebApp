/* Domain vocabulary, kept in step with frontend-web/src/pages/Locations.tsx.
 * These `value` strings are what the backend stores — only the labels are
 * presentation. Changing a value here silently orphans existing records. */

export const LOCATION_TYPES = [
  { value: 'marsh', label: 'Marsh' },
  { value: 'cut-corn', label: 'Cut Corn' },
  { value: 'swamp', label: 'Swamp' },
  { value: 'flooded-timber', label: 'Flooded Timber' },
  { value: 'creek', label: 'Creek' },
  { value: 'river', label: 'River' },
  { value: 'lakeshore', label: 'Lakeshore' },
  { value: 'open-water', label: 'Open Water' },
  { value: 'coastal', label: 'Coastal' },
  { value: 'field', label: 'Field' },
  { value: 'reservoir', label: 'Reservoir' },
  { value: 'pothole', label: 'Pothole' },
  { value: 'beaver-pond', label: 'Beaver Pond' },
] as const;

export const BLIND_TYPES = ['ground', 'pit', 'panel', 'a-frame', 'layout', 'boat'] as const;

export const locationTypeLabel = (value: string): string =>
  LOCATION_TYPES.find(t => t.value === value)?.label ?? value;

export const blindTypeLabel = (value: string): string =>
  value === 'a-frame' ? 'A-Frame' : value.charAt(0).toUpperCase() + value.slice(1);

/* Static requires, because Metro resolves bundled assets at build time — a
 * template string path would leave every one of these out of the bundle. */
const LOCATION_TYPE_IMAGES: Record<string, number> = {
  'marsh': require('@/assets/location-types/marsh.jpg'),
  'cut-corn': require('@/assets/location-types/cut-corn.jpg'),
  'swamp': require('@/assets/location-types/swamp.jpg'),
  'flooded-timber': require('@/assets/location-types/flooded-timber.jpg'),
  'creek': require('@/assets/location-types/creek.jpg'),
  'river': require('@/assets/location-types/river.jpg'),
  'lakeshore': require('@/assets/location-types/lakeshore.jpg'),
  'open-water': require('@/assets/location-types/open-water.jpg'),
  'coastal': require('@/assets/location-types/coastal.jpg'),
  'field': require('@/assets/location-types/field.jpg'),
  'reservoir': require('@/assets/location-types/reservoir.jpg'),
  'pothole': require('@/assets/location-types/pothole.jpg'),
  'beaver-pond': require('@/assets/location-types/beaver-pond.jpg'),
};

export const locationTypeImage = (value: string): number | undefined =>
  LOCATION_TYPE_IMAGES[value];

export interface LocationData {
  id: string;
  name: string;
  location_type: string;
  center: { lat: number; lng: number };
}

export interface BlindData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  blind_type: string;
  notes: string;
  location_id: string;
  ideal_wind_directions: string[];
  ideal_wind_center: string | null;
}
