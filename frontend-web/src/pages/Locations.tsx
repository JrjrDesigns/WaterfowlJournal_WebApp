import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { fetchLocations, createLocation, deleteLocation, fetchBlindsForLocation, createBlind, deleteBlind } from '../utils/api'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const LOCATION_TYPES = [
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
]

const BLIND_TYPES = ['ground', 'pit', 'panel', 'a-frame', 'layout', 'boat']

interface LocationData {
  id: string
  name: string
  location_type: string
  center: { lat: number; lng: number }
  photo_base64?: string
}

interface BlindData {
  id: string
  name: string
  lat: number
  lng: number
  blind_type: string
  notes: string
  location_id: string
}

function typeLabel(t: string) {
  return LOCATION_TYPES.find(l => l.value === t)?.label ?? t
}

function LocationTypeStub({ type }: { type: string }) {
  const imgSrc = `/location-types/${type}.jpg`
  return (
    <div className="w-20 flex-shrink-0 bg-green/10 flex items-center justify-center border-r border-hairline overflow-hidden relative">
      <img
        src={imgSrc}
        alt={type}
        className="w-full h-full object-cover"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg className="w-7 h-7 text-green/40" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    </div>
  )
}

function MapPinDropper({ onDrop }: { onDrop: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onDrop(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

function FlyTo({ coords }: { coords: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo(coords, 15, { duration: 1.2 })
  }, [coords])
  return null
}

export default function Locations() {
  const [locations, setLocations] = useState<LocationData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null)
  const [blinds, setBlinds] = useState<BlindData[]>([])
  const [blindsLoading, setBlindsLoading] = useState(false)

  // New location modal
  const [showNewLocation, setShowNewLocation] = useState(false)
  const [locName, setLocName] = useState('')
  const [locType, setLocType] = useState('marsh')
  const [locCenter, setLocCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [creatingLoc, setCreatingLoc] = useState(false)
  const [locError, setLocError] = useState('')

  // Geocode search
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)

  const handleGeocode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data = await res.json()
      if (data.length === 0) { setSearchError('No results found'); return }
      const { lat, lon } = data[0]
      setFlyTarget([parseFloat(lat), parseFloat(lon)])
    } catch {
      setSearchError('Search failed')
    } finally {
      setSearching(false)
    }
  }

  // New blind modal
  const [showNewBlind, setShowNewBlind] = useState(false)
  const [blindName, setBlindName] = useState('')
  const [blindType, setBlindType] = useState('ground')
  const [blindNotes, setBlindNotes] = useState('')
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null)
  const [creatingBlind, setCreatingBlind] = useState(false)
  const [blindError, setBlindError] = useState('')

  const [deleteLocTarget, setDeleteLocTarget] = useState<LocationData | null>(null)
  const [deleteBlindTarget, setDeleteBlindTarget] = useState<BlindData | null>(null)

  useEffect(() => { loadLocations() }, [])

  const loadLocations = async () => {
    setLoading(true)
    try {
      const data = await fetchLocations()
      setLocations(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const openLocation = async (loc: LocationData) => {
    setSelectedLocation(loc)
    setBlindsLoading(true)
    try {
      const data = await fetchBlindsForLocation(loc.id)
      setBlinds(data)
    } catch { /* ignore */ } finally {
      setBlindsLoading(false)
    }
  }

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocError('')
    if (!locName) { setLocError('Name is required'); return }
    if (!locCenter) { setLocError('Click the map to set the center point'); return }
    setCreatingLoc(true)
    try {
      await createLocation({ name: locName, location_type: locType, center: locCenter })
      setShowNewLocation(false)
      setLocName(''); setLocType('marsh'); setLocCenter(null)
      loadLocations()
    } catch (err: unknown) {
      setLocError(err instanceof Error ? err.message : 'Failed to create location')
    } finally {
      setCreatingLoc(false)
    }
  }

  const handleDeleteLocation = async () => {
    if (!deleteLocTarget) return
    try {
      await deleteLocation(deleteLocTarget.id)
      setDeleteLocTarget(null)
      if (selectedLocation?.id === deleteLocTarget.id) setSelectedLocation(null)
      loadLocations()
    } catch { /* ignore */ }
  }

  const handleMapClick = (lat: number, lng: number) => {
    if (!selectedLocation) return
    setPendingPin({ lat, lng })
    setShowNewBlind(true)
  }

  const handleCreateBlind = async (e: React.FormEvent) => {
    e.preventDefault()
    setBlindError('')
    if (!blindName) { setBlindError('Name is required'); return }
    if (!pendingPin) { setBlindError('No pin location'); return }
    if (!selectedLocation) return
    setCreatingBlind(true)
    try {
      await createBlind(selectedLocation.id, {
        name: blindName,
        location_id: selectedLocation.id,
        lat: pendingPin.lat,
        lng: pendingPin.lng,
        blind_type: blindType,
        notes: blindNotes,
      })
      setShowNewBlind(false)
      setBlindName(''); setBlindType('ground'); setBlindNotes(''); setPendingPin(null)
      const data = await fetchBlindsForLocation(selectedLocation.id)
      setBlinds(data)
    } catch (err: unknown) {
      setBlindError(err instanceof Error ? err.message : 'Failed to create blind')
    } finally {
      setCreatingBlind(false)
    }
  }

  const handleDeleteBlind = async () => {
    if (!deleteBlindTarget || !selectedLocation) return
    try {
      await deleteBlind(deleteBlindTarget.id)
      setDeleteBlindTarget(null)
      const data = await fetchBlindsForLocation(selectedLocation.id)
      setBlinds(data)
    } catch { /* ignore */ }
  }

  const mapCenter: [number, number] = selectedLocation
    ? [selectedLocation.center.lat, selectedLocation.center.lng]
    : [44, -93]

  // ---- Detail view ----
  if (selectedLocation) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Delete confirm modals */}
        {deleteBlindTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50">
            <div className="bg-surface border border-hairline rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-ink mb-2">Delete "{deleteBlindTarget.name}"?</h3>
              <p className="text-muted text-sm mb-6">This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteBlindTarget(null)} className="flex-1 py-2.5 rounded-lg border border-hairline text-muted text-sm font-semibold">Cancel</button>
                <button onClick={handleDeleteBlind} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold">Delete</button>
              </div>
            </div>
          </div>
        )}
        {deleteLocTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50">
            <div className="bg-surface border border-hairline rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold text-ink mb-2">Delete "{deleteLocTarget.name}"?</h3>
              <p className="text-muted text-sm mb-6">This will also delete all blinds at this location. Cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteLocTarget(null)} className="flex-1 py-2.5 rounded-lg border border-hairline text-muted text-sm font-semibold">Cancel</button>
                <button onClick={handleDeleteLocation} className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold">Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setSelectedLocation(null)} className="text-muted hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">{typeLabel(selectedLocation.location_type)}</p>
            <h1 className="font-display text-3xl text-ink tracking-wider leading-none truncate">{selectedLocation.name.toUpperCase()}</h1>
          </div>
          <button onClick={() => setDeleteLocTarget(selectedLocation)} className="text-muted hover:text-red-500 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Map — satellite tiles */}
        <div className="rounded-xl overflow-hidden border border-hairline mb-0" style={{ height: 280 }}>
          <MapContainer center={mapCenter} zoom={16} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              maxZoom={19}
            />
            <MapPinDropper onDrop={handleMapClick} />
            <Marker position={mapCenter} icon={new L.Icon({
              iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
              shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
              iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
            })}>
              <Popup>{selectedLocation.name}</Popup>
            </Marker>
            {blinds.map(b => (
              <Marker key={b.id} position={[b.lat, b.lng]} icon={greenIcon}>
                <Popup><strong>{b.name}</strong><br />{b.blind_type}</Popup>
              </Marker>
            ))}
            {pendingPin && <Marker position={[pendingPin.lat, pendingPin.lng]} icon={greenIcon} />}
          </MapContainer>
        </div>

        {/* Inline add-blind form — expands directly below map, map stays visible */}
        {showNewBlind && pendingPin ? (
          <div className="bg-surface border border-t-0 border-hairline rounded-b-xl px-4 pt-4 pb-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-display text-xl text-ink tracking-wider leading-none">ADD BLIND</p>
                <p className="text-xs text-muted font-mono mt-0.5">{pendingPin.lat.toFixed(5)}, {pendingPin.lng.toFixed(5)}</p>
              </div>
              <button onClick={() => { setShowNewBlind(false); setPendingPin(null) }} className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateBlind} className="space-y-3">
              {blindError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{blindError}</div>}
              <input type="text" value={blindName} onChange={e => setBlindName(e.target.value)} placeholder="Blind name" autoFocus />
              <div className="flex flex-wrap gap-2">
                {BLIND_TYPES.map(t => (
                  <button key={t} type="button" onClick={() => setBlindType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${blindType === t ? 'bg-ink border-ink text-white' : 'border-hairline text-muted hover:border-ink hover:text-ink'}`}>
                    {t === 'a-frame' ? 'A-Frame' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <textarea value={blindNotes} onChange={e => setBlindNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="resize-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowNewBlind(false); setPendingPin(null) }}
                  className="flex-1 py-2.5 rounded-xl border border-hairline text-muted font-semibold text-sm">Cancel</button>
                <button type="submit" disabled={creatingBlind}
                  className="flex-1 py-2.5 rounded-xl bg-ink text-white font-semibold text-sm disabled:opacity-50">
                  {creatingBlind ? 'Saving…' : 'Save Blind'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="text-xs text-muted text-center py-2 mb-3">Tap the map to drop a blind pin</p>
        )}

        {/* Blinds list */}
        {!showNewBlind && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Blinds at this location</p>
            {blindsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-ink" />
              </div>
            ) : blinds.length === 0 ? (
              <div className="text-center py-8 bg-surface border border-hairline rounded-xl">
                <p className="text-muted text-sm">No blinds yet.</p>
                <p className="text-muted text-xs mt-1">Tap the map to drop your first blind pin.</p>
              </div>
            ) : (
              <div className="bg-surface border border-hairline rounded-xl overflow-hidden divide-y divide-hairline">
                {blinds.map(b => (
                  <div key={b.id} className="flex items-center px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm">{b.name}</p>
                      <p className="text-xs text-muted uppercase tracking-wider mt-0.5">
                        {b.blind_type === 'a-frame' ? 'A-Frame' : b.blind_type.charAt(0).toUpperCase() + b.blind_type.slice(1)}
                        {b.notes ? ` · ${b.notes}` : ''}
                      </p>
                      <p className="text-xs text-muted/60 font-mono mt-0.5">{b.lat.toFixed(5)}, {b.lng.toFixed(5)}</p>
                    </div>
                    <button onClick={() => setDeleteBlindTarget(b)} className="text-muted hover:text-red-500 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---- List view ----
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* New Location Modal */}
      {showNewLocation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-surface border border-hairline rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <h2 className="font-display text-2xl text-ink tracking-wider">NEW LOCATION</h2>
              <button onClick={() => { setShowNewLocation(false); setLocName(''); setLocCenter(null); setLocError(''); setSearchQuery(''); setSearchError(''); setFlyTarget(null) }}
                className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateLocation} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {locError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{locError}</div>}

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Location Name</label>
                <input type="text" value={locName} onChange={e => setLocName(e.target.value)} placeholder="Johnson's Marsh" autoFocus />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Location Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {LOCATION_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setLocType(t.value)}
                      className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-colors text-left ${locType === t.value ? 'bg-ink border-ink text-white' : 'border-hairline text-muted hover:border-ink hover:text-ink'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Center Point — search or tap map to set
                </label>

                {/* Address search */}
                <form onSubmit={handleGeocode} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search address or place…"
                    className="flex-1"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="flex-shrink-0 px-3 py-2 bg-ink text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {searching ? '…' : 'Go'}
                  </button>
                </form>
                {searchError && <p className="text-xs text-red-500 mb-2">{searchError}</p>}

                <div className="h-48 rounded-xl overflow-hidden border border-hairline mb-2">
                  <MapContainer center={[44, -93]} zoom={5} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution='&copy; Esri'
                      maxZoom={19}
                    />
                    <FlyTo coords={flyTarget} />
                    <MapPinDropper onDrop={(lat, lng) => setLocCenter({ lat, lng })} />
                    {locCenter && <Marker position={[locCenter.lat, locCenter.lng]} icon={greenIcon} />}
                  </MapContainer>
                </div>
                {locCenter ? (
                  <p className="text-xs text-muted font-mono">{locCenter.lat.toFixed(5)}, {locCenter.lng.toFixed(5)}</p>
                ) : (
                  <p className="text-xs text-muted">Search to navigate, then tap to drop your center pin</p>
                )}
              </div>

              <button type="submit" disabled={creatingLoc}
                className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                {creatingLoc ? 'Creating…' : 'Save Location'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Hunting Areas
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">LOCATIONS</h1>
        </div>
        <button onClick={() => setShowNewLocation(true)}
          className="flex items-center gap-2 bg-ink hover:bg-black text-white font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New Location
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted font-semibold">No locations yet.</p>
          <p className="text-muted text-sm mt-1">Add your first hunting area to get started.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-hairline overflow-hidden">
          <div className="divide-y divide-hairline">
            {locations.map(loc => (
              <button key={loc.id} onClick={() => openLocation(loc)}
                className="w-full flex items-stretch gap-0 overflow-hidden hover:bg-bg transition-colors text-left">
                <LocationTypeStub type={loc.location_type} />
                <div className="flex-1 px-4 py-3">
                  <p className="font-semibold text-ink text-sm">{loc.name}</p>
                  <p className="text-xs text-muted uppercase tracking-wider mt-0.5 font-semibold">
                    {typeLabel(loc.location_type)}
                  </p>
                  <p className="text-xs text-muted/60 font-mono mt-1">
                    {loc.center.lat.toFixed(4)}, {loc.center.lng.toFixed(4)}
                  </p>
                </div>
                <div className="flex items-center pr-4">
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
