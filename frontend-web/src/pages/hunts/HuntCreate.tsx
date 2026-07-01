import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { format } from 'date-fns'
import { fetchLocations, fetchBlindsForLocation, fetchSpecies, createHunt } from '../../utils/api'
import { compressImage } from '../../utils/compressImage'

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

interface LocationData {
  id: string
  name: string
  location_type: string
}

interface BlindData {
  id: string
  name: string
  location_id: string
  lat: number
  lng: number
}

interface Harvest {
  species: string
  harvested: number
  missed: number
  shot_not_recovered: number
}

export default function HuntCreate() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<LocationData[]>([])
  const [blinds, setBlinds] = useState<BlindData[]>([])
  const [allSpecies, setAllSpecies] = useState<string[]>([])

  const [huntName, setHuntName] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedBlindId, setSelectedBlindId] = useState('')
  const [date, setDate] = useState<Date>(new Date())
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [locsData, speciesData] = await Promise.all([fetchLocations(), fetchSpecies()])
      setLocations(locsData)
      setAllSpecies([...speciesData.ducks, ...speciesData.geese, ...speciesData.others])
    } catch { /* ignore */ }
  }

  const handleLocationChange = async (locId: string) => {
    setSelectedLocationId(locId)
    setSelectedBlindId('')
    setLocation(null)
    setBlinds([])
    if (!locId) return
    try {
      const data = await fetchBlindsForLocation(locId)
      setBlinds(data)
    } catch { /* ignore */ }
  }

  const handleBlindChange = (blindId: string) => {
    setSelectedBlindId(blindId)
    const blind = blinds.find(b => b.id === blindId)
    if (blind) setLocation({ lat: blind.lat, lng: blind.lng })
    else setLocation(null)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const compressed = await Promise.all(Array.from(files).map(f => compressImage(f)))
    setPhotos(prev => [...prev, ...compressed])
  }

  const addHarvest = () => {
    setHarvests(prev => [...prev, { species: allSpecies[0] || '', harvested: 0, missed: 0, shot_not_recovered: 0 }])
  }

  const updateHarvest = (i: number, field: keyof Harvest, value: string | number) => {
    setHarvests(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!huntName) { setError('Hunt name is required'); return }
    if (!selectedBlindId) { setError('Select a blind'); return }
    if (!location) { setError('Selected blind has no coordinates'); return }

    setLoading(true)
    try {
      const huntData: Record<string, unknown> = {
        name: huntName,
        blind_id: selectedBlindId,
        date: format(date, 'yyyy-MM-dd'),
        location,
        notes,
        photos,
        harvests: harvests.map(h => ({
          species_name: h.species,
          count: h.harvested,
          missed: h.missed,
          shot_not_recovered: h.shot_not_recovered,
        })),
      }
      await createHunt(huntData)
      navigate('/hunts')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create hunt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/hunts')} className="text-muted hover:text-ink transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-3xl text-ink tracking-wider leading-none">LOG HUNT</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Hunt Name */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Hunt Name</label>
          <input type="text" value={huntName} onChange={e => setHuntName(e.target.value)} placeholder="Morning Duck Hunt" />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Date</label>
          <DatePicker
            selected={date}
            onChange={d => d && setDate(d)}
            dateFormat="MM-dd-yyyy"
            className="!bg-white !border !border-hairline !text-ink !rounded-lg !px-3 !py-2 !w-full"
            wrapperClassName="w-full"
          />
        </div>

        {/* Location → Blind */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Location</label>
            <select value={selectedLocationId} onChange={e => handleLocationChange(e.target.value)}>
              <option value="">Select a location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {locations.length === 0 && (
              <p className="text-xs text-muted mt-1.5">No locations yet — add one in the Locations tab first.</p>
            )}
          </div>
          {selectedLocationId && (
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Blind</label>
              <select value={selectedBlindId} onChange={e => handleBlindChange(e.target.value)}>
                <option value="">Select a blind…</option>
                {blinds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {blinds.length === 0 && (
                <p className="text-xs text-muted mt-1.5">No blinds at this location — add one in the Locations tab.</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted mt-2">
            Hunting a new spot?{' '}
            <button type="button" onClick={() => navigate('/locations')}
              className="font-semibold text-ink underline underline-offset-2">
              Add it in Locations first →
            </button>
          </p>
        </div>

        {/* Read-only map — shown once a blind is selected */}
        {location && (
          <div className="h-48 rounded-xl overflow-hidden border border-hairline pointer-events-none">
            <MapContainer
              center={[location.lat, location.lng]}
              zoom={17}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='&copy; Esri'
                maxZoom={19}
              />
              <Marker position={[location.lat, location.lng]} icon={greenIcon} />
            </MapContainer>
          </div>
        )}

        {/* Harvest */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Harvest</label>
            <button
              type="button"
              onClick={addHarvest}
              className="text-xs text-ink hover:text-muted font-semibold flex items-center gap-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Species
            </button>
          </div>

          <div className="space-y-3">
            {harvests.map((harvest, i) => (
              <div key={i} className="bg-surface border border-hairline rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted font-semibold uppercase tracking-wider">Entry {i + 1}</span>
                  <button type="button" onClick={() => setHarvests(prev => prev.filter((_, j) => j !== i))} className="text-muted hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <select value={harvest.species} onChange={e => updateHarvest(i, 'species', e.target.value)} className="mb-3">
                  {allSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  {(['harvested', 'missed', 'shot_not_recovered'] as const).map(field => (
                    <div key={field}>
                      <p className="text-xs text-muted mb-1 font-semibold capitalize">
                        {field === 'shot_not_recovered' ? 'Lost' : field}
                      </p>
                      <input
                        type="number" min="0"
                        value={harvest[field]}
                        onChange={e => updateHarvest(i, field, parseInt(e.target.value) || 0)}
                        className="text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Photos</label>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-hairline hover:border-ink rounded-xl p-4 flex items-center justify-center gap-2 text-muted hover:text-ink transition-colors text-sm font-semibold"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Add Photos
          </button>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={photo} alt="" className="w-full h-full object-cover rounded-lg border border-hairline" />
                  <button
                    type="button"
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-6 h-6 bg-ink rounded-full flex items-center justify-center"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes about this hunt…" rows={3} className="resize-none" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-sm"
        >
          {loading ? 'Saving…' : 'Record Hunt'}
        </button>
      </form>
    </div>
  )
}
