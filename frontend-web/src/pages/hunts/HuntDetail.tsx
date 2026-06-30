import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { fetchHunt, deleteHunt } from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import PaywallModal from '../../components/PaywallModal'

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
  shadowSize: [41, 41],
})

interface Hunt {
  id: string
  name: string
  date: string
  location: { lat: number; lng: number }
  blind_name: string
  notes: string
  photos: string[]
  weather_data: {
    temp?: number
    temp_max?: number
    temp_min?: number
    condition?: string
    wind_speed?: number
    precipitation?: number
    description?: string
  } | null
  harvests: Array<{
    species_name: string
    count: number
    missed: number
    shot_not_recovered: number
  }>
}

export default function HuntDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isPro } = useAuth()
  const [hunt, setHunt] = useState<Hunt | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWeatherPaywall, setShowWeatherPaywall] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)

  useEffect(() => {
    if (id) loadHunt()
  }, [id])

  const loadHunt = async () => {
    try {
      const data = await fetchHunt(id!)
      setHunt(data)
    } catch {
      navigate('/hunts')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteHunt(id!)
      navigate('/hunts')
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500" />
      </div>
    )
  }

  if (!hunt) return null

  const totalHarvested = hunt.harvests.reduce((sum, h) => sum + h.count, 0)
  const totalMissed = hunt.harvests.reduce((sum, h) => sum + h.missed, 0)
  const totalLost = hunt.harvests.reduce((sum, h) => sum + h.shot_not_recovered, 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showWeatherPaywall && <PaywallModal onClose={() => setShowWeatherPaywall(false)} reason="weather" />}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <img src={lightboxPhoto} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/hunts')} className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-extrabold text-white flex-1 truncate">{hunt.name}</h1>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-500 hover:text-red-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-navy-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Delete Hunt?</h3>
            <p className="text-gray-400 text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="bg-navy-800 border border-gray-700 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-gray-300 text-sm">{format(new Date(hunt.date + 'T12:00:00'), 'MMMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <span className="text-gray-300 text-sm">{hunt.blind_name}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Harvested', value: totalHarvested, color: 'text-orange-500' },
          { label: 'Missed', value: totalMissed, color: 'text-yellow-500' },
          { label: 'Lost', value: totalLost, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-navy-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weather */}
      <div className="mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weather</h2>
        {!isPro ? (
          <button
            onClick={() => setShowWeatherPaywall(true)}
            className="w-full bg-navy-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between hover:border-orange-500/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="text-gray-400 text-sm">Weather data — Pro feature</span>
            </div>
            <span className="text-xs text-orange-500 font-bold uppercase tracking-wider">Unlock</span>
          </button>
        ) : hunt.weather_data ? (
          <div className="bg-navy-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-extrabold text-white">{hunt.weather_data.temp}°F</span>
              <span className="text-sm text-gray-400">{hunt.weather_data.condition}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">High</p>
                <p className="text-sm font-bold text-white">{hunt.weather_data.temp_max}°</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Wind</p>
                <p className="text-sm font-bold text-white">{hunt.weather_data.wind_speed} mph</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Precip</p>
                <p className="text-sm font-bold text-white">{hunt.weather_data.precipitation}"</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-navy-800 border border-gray-700 rounded-xl p-4 text-gray-500 text-sm">
            No weather data available
          </div>
        )}
      </div>

      {/* Harvest Details */}
      {hunt.harvests.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Harvest Details</h2>
          <div className="space-y-2">
            {hunt.harvests.map((h, i) => (
              <div key={i} className="bg-navy-800 border border-gray-700 rounded-xl p-4">
                <p className="font-bold text-white text-sm mb-3">{h.species_name}</p>
                <div className="flex justify-around">
                  {[
                    { label: 'Harvested', value: h.count, color: 'text-orange-500' },
                    { label: 'Missed', value: h.missed, color: 'text-yellow-500' },
                    { label: 'Lost', value: h.shot_not_recovered, color: 'text-red-400' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      {hunt.photos.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Photos</h2>
          <div className="grid grid-cols-2 gap-2">
            {hunt.photos.map((photo, i) => (
              <button key={i} onClick={() => setLightboxPhoto(photo)} className="aspect-video rounded-lg overflow-hidden border border-gray-700 hover:border-orange-500/40 transition-colors">
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {hunt.notes && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notes</h2>
          <div className="bg-navy-800 border border-gray-700 rounded-xl p-4">
            <p className="text-gray-300 text-sm leading-relaxed">{hunt.notes}</p>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Location</h2>
        <div className="h-48 rounded-xl overflow-hidden border border-gray-700">
          <MapContainer center={[hunt.location.lat, hunt.location.lng]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <Marker position={[hunt.location.lat, hunt.location.lng]} icon={orangeIcon} />
          </MapContainer>
        </div>
        <p className="text-xs text-gray-600 mt-1 text-center font-mono">
          {hunt.location.lat.toFixed(6)}, {hunt.location.lng.toFixed(6)}
        </p>
      </div>
    </div>
  )
}
