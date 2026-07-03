import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { format, parse } from 'date-fns'
import { fetchHunt, fetchLocations, fetchBlindsForLocation, fetchSpecies, updateHunt } from '../../utils/api'
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

interface LocationData { id: string; name: string; location_type: string }
interface BlindData { id: string; name: string; location_id: string; lat: number; lng: number }
interface Harvest { species: string; harvested: number; missed: number; shot_not_recovered: number; seen: number }

export default function HuntEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [locations, setLocations] = useState<LocationData[]>([])
  const [blinds, setBlinds] = useState<BlindData[]>([])
  const [allSpecies, setAllSpecies] = useState<string[]>([])

  const [huntName, setHuntName] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedBlindId, setSelectedBlindId] = useState('')
  const [date, setDate] = useState<Date>(new Date())
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isMorning, setIsMorning] = useState(false)
  const [isEvening, setIsEvening] = useState(false)
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadInitialData() }, [])

  const loadInitialData = async () => {
    try {
      const [hunt, locsData, speciesData] = await Promise.all([
        fetchHunt(id!),
        fetchLocations(),
        fetchSpecies(),
      ])

      setLocations(locsData)
      setAllSpecies([...speciesData.ducks, ...speciesData.geese, ...speciesData.others])

      // Pre-populate fields
      setHuntName(hunt.name)
      setDate(parse(hunt.date, 'yyyy-MM-dd', new Date()))
      setLocation(hunt.location)
      setIsMorning(hunt.is_morning ?? false)
      setIsEvening(hunt.is_evening ?? false)
      setNotes(hunt.notes ?? '')
      setPhotos(hunt.photos ?? [])
      setHarvests((hunt.harvests ?? []).map((h: { species_name: string; count: number; missed: number; shot_not_recovered: number; seen?: number }) => ({
        species: h.species_name,
        harvested: h.count,
        missed: h.missed,
        shot_not_recovered: h.shot_not_recovered,
        seen: h.seen ?? 0,
      })))

      // Restore location + blind selection
      if (hunt.blind_id) {
        setSelectedBlindId(hunt.blind_id)
        // find the location_id for this blind
        const allBlinds = await Promise.all(locsData.map((l: LocationData) => fetchBlindsForLocation(l.id)))
        for (let i = 0; i < locsData.length; i++) {
          const match = allBlinds[i].find((b: BlindData) => b.id === hunt.blind_id)
          if (match) {
            setSelectedLocationId(locsData[i].id)
            setBlinds(allBlinds[i])
            break
          }
        }
      }
    } catch {
      navigate(`/hunts/${id}`)
    } finally {
      setInitialLoading(false)
    }
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
    setHarvests(prev => [...prev, { species: allSpecies[0] || '', harvested: 0, missed: 0, shot_not_recovered: 0, seen: 0 }])
  }

  const updateHarvestEntry = (i: number, field: keyof Harvest, value: string | number) => {
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
      await updateHunt(id!, {
        name: huntName,
        blind_id: selectedBlindId,
        date: format(date, 'yyyy-MM-dd'),
        location,
        notes,
        photos,
        is_morning: isMorning,
        is_evening: isEvening,
        harvests: harvests.map(h => ({
          species_name: h.species,
          count: h.harvested,
          missed: h.missed,
          shot_not_recovered: h.shot_not_recovered,
          seen: h.seen,
        })),
      })
      navigate(`/hunts/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/hunts/${id}`)} className="text-muted hover:text-ink transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-3xl text-ink tracking-wider leading-none">EDIT HUNT</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
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

        {/* Hunt Time */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Hunt Time</label>
          <div className="flex gap-3">
            {([
              { key: 'morning', label: 'Morning', checked: isMorning, set: setIsMorning },
              { key: 'evening', label: 'Evening', checked: isEvening, set: setIsEvening },
            ] as const).map(({ key, label, checked, set }) => (
              <button
                key={key}
                type="button"
                onClick={() => set(!checked)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                  checked ? 'bg-ink text-white border-ink' : 'bg-surface text-muted border-hairline hover:border-ink hover:text-ink'
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-white border-white' : 'border-current'}`}>
                  {checked && (
                    <svg className="w-3 h-3 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Location → Blind */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Location</label>
            <select value={selectedLocationId} onChange={e => handleLocationChange(e.target.value)}>
              <option value="">Select a location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {selectedLocationId && (
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Blind</label>
              <select value={selectedBlindId} onChange={e => handleBlindChange(e.target.value)}>
                <option value="">Select a blind…</option>
                {blinds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {location && (
          <div className="h-48 rounded-xl overflow-hidden border border-hairline pointer-events-none">
            <MapContainer center={[location.lat, location.lng]} zoom={17} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false}>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' maxZoom={19} />
              <Marker position={[location.lat, location.lng]} icon={greenIcon} />
            </MapContainer>
          </div>
        )}

        {/* Harvest */}
        <div className="bg-green/5 border border-green/20 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-green/15">
            <div>
              <p className="text-xs font-semibold text-green uppercase tracking-widest">Harvest</p>
              <p className="text-xs text-muted mt-0.5">What did you bring home?</p>
            </div>
            <button
              type="button"
              onClick={addHarvest}
              className="flex items-center gap-1.5 bg-green text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-green/90 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Species
            </button>
          </div>

          {harvests.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted">No harvest entries yet.</p>
              <p className="text-xs text-muted mt-0.5">Tap "Add Species" to log your bag.</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
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
                  <select value={harvest.species} onChange={e => updateHarvestEntry(i, 'species', e.target.value)} className="mb-3">
                    {allSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="grid grid-cols-4 gap-2">
                    {(['seen', 'harvested', 'missed', 'shot_not_recovered'] as const).map(field => (
                      <div key={field}>
                        <p className="text-xs text-muted mb-1 font-semibold capitalize">
                          {field === 'shot_not_recovered' ? 'Lost' : field}
                        </p>
                        <input
                          type="number" min="0"
                          value={harvest[field]}
                          onChange={e => updateHarvestEntry(i, field, parseInt(e.target.value) || 0)}
                          className="text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
