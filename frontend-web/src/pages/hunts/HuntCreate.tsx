import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { format } from 'date-fns'
import { fetchBlinds, fetchSpecies, createHunt } from '../../utils/api'
import { compressImage } from '../../utils/compressImage'

// Fix leaflet default icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface Blind {
  id: string
  name: string
  location: { lat: number; lng: number }
}

interface Harvest {
  species: string
  harvested: number
  missed: number
  shot_not_recovered: number
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function HuntCreate() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [blinds, setBlinds] = useState<Blind[]>([])
  const [allSpecies, setAllSpecies] = useState<string[]>([])

  const [huntName, setHuntName] = useState('')
  const [selectedBlindId, setSelectedBlindId] = useState('')
  const [showNewBlind, setShowNewBlind] = useState(false)
  const [newBlindName, setNewBlindName] = useState('')
  const [newBlindDescription, setNewBlindDescription] = useState('')
  const [newBlindType, setNewBlindType] = useState('ground')
  const [date, setDate] = useState<Date>(new Date())
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
    getCurrentLocation()
  }, [])

  const loadData = async () => {
    try {
      const [blindsData, speciesData] = await Promise.all([fetchBlinds(), fetchSpecies()])
      setBlinds(blindsData)
      setAllSpecies([...speciesData.ducks, ...speciesData.geese, ...speciesData.others])
    } catch { /* ignore */ }
  }

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { /* user declined */ }
      )
    }
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
    if (!location) { setError('Location is required — use GPS or click the map'); return }
    if (!showNewBlind && !selectedBlindId) { setError('Select a blind or create a new one'); return }
    if (showNewBlind && (!newBlindName || !newBlindDescription)) { setError('Blind name and description are required'); return }

    setLoading(true)
    try {
      const huntData: Record<string, unknown> = {
        name: huntName,
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

      if (showNewBlind) {
        huntData.blind_name = newBlindName
        huntData.blind_description = newBlindDescription
        huntData.blind_type = newBlindType
      } else {
        huntData.blind_id = selectedBlindId
      }

      await createHunt(huntData)
      navigate('/hunts')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create hunt')
    } finally {
      setLoading(false)
    }
  }

  const BLIND_TYPES = ['ground', 'pit', 'panel', 'a-frame', 'layout', 'boat']
  const mapCenter: [number, number] = location ? [location.lat, location.lng] : [44, -93]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/hunts')} className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider">New Hunt</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/15 border border-red-500/40 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Hunt Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hunt Name</label>
          <input
            type="text"
            value={huntName}
            onChange={e => setHuntName(e.target.value)}
            placeholder="e.g., Morning Duck Hunt"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Date</label>
          <DatePicker
            selected={date}
            onChange={d => d && setDate(d)}
            dateFormat="MM-dd-yyyy"
            className="!bg-navy-800 !border !border-gray-700 !text-white !rounded-lg !px-3 !py-2 !w-full"
            wrapperClassName="w-full"
          />
        </div>

        {/* Blind */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Blind</label>
          <div className="flex gap-2 mb-3 bg-navy-800 border border-gray-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setShowNewBlind(false)}
              className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${!showNewBlind ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setShowNewBlind(true)}
              className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${showNewBlind ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              New Blind
            </button>
          </div>

          {!showNewBlind ? (
            <select value={selectedBlindId} onChange={e => setSelectedBlindId(e.target.value)}>
              <option value="">Select a blind...</option>
              {blinds.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          ) : (
            <div className="space-y-3">
              <input type="text" value={newBlindName} onChange={e => setNewBlindName(e.target.value)} placeholder="Blind name" />
              <textarea value={newBlindDescription} onChange={e => setNewBlindDescription(e.target.value)} placeholder="Blind description" rows={2} className="resize-none" />
              <div>
                <p className="text-xs text-gray-500 mb-2">Blind Type</p>
                <div className="flex flex-wrap gap-2">
                  {BLIND_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewBlindType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        newBlindType === type
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-navy-800 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {type === 'a-frame' ? 'A-Frame' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Location / Map */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Location — Click map to set pin
          </label>
          <div className="h-56 rounded-xl overflow-hidden border border-gray-700 mb-3">
            <MapContainer center={mapCenter} zoom={location ? 13 : 5} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              <MapClickHandler onMapClick={(lat, lng) => setLocation({ lat, lng })} />
              {location && <Marker position={[location.lat, location.lng]} icon={orangeIcon} />}
            </MapContainer>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={location?.lat ?? ''}
                onChange={e => setLocation(prev => ({ lat: parseFloat(e.target.value) || 0, lng: prev?.lng ?? 0 }))}
                placeholder="Latitude"
              />
              <input
                type="number"
                step="any"
                value={location?.lng ?? ''}
                onChange={e => setLocation(prev => ({ lat: prev?.lat ?? 0, lng: parseFloat(e.target.value) || 0 }))}
                placeholder="Longitude"
              />
            </div>
            <button
              type="button"
              onClick={getCurrentLocation}
              className="flex-shrink-0 flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              GPS
            </button>
          </div>
        </div>

        {/* Harvest */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Harvest Data</label>
            <button
              type="button"
              onClick={addHarvest}
              className="text-xs text-orange-500 hover:text-orange-400 font-semibold flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Species
            </button>
          </div>

          <div className="space-y-3">
            {harvests.map((harvest, i) => (
              <div key={i} className="bg-navy-800 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-500 font-semibold">Entry {i + 1}</span>
                  <button type="button" onClick={() => setHarvests(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <select
                  value={harvest.species}
                  onChange={e => updateHarvest(i, 'species', e.target.value)}
                  className="mb-3"
                >
                  {allSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  {(['harvested', 'missed', 'shot_not_recovered'] as const).map(field => (
                    <div key={field}>
                      <p className="text-xs text-gray-500 mb-1 capitalize">{field === 'shot_not_recovered' ? 'Lost' : field}</p>
                      <input
                        type="number"
                        min="0"
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
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Photos</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-700 hover:border-orange-500/50 rounded-xl p-4 flex items-center justify-center gap-2 text-gray-500 hover:text-orange-500 transition-colors text-sm font-semibold"
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
                  <img src={photo} alt="" className="w-full h-full object-cover rounded-lg border border-gray-700" />
                  <button
                    type="button"
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
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
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes about this hunt..."
            rows={3}
            className="resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-lg uppercase tracking-wider"
        >
          {loading ? 'Saving...' : 'Record Hunt'}
        </button>
      </form>
    </div>
  )
}
