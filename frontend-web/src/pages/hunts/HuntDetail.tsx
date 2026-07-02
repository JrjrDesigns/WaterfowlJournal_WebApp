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

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
})

interface WindEntry {
  time: string
  speed: number
  direction: number
  cardinal: string
}

interface Hunt {
  id: string
  name: string
  date: string
  location: { lat: number; lng: number }
  blind_name: string
  notes: string
  photos: string[]
  is_morning: boolean
  is_evening: boolean
  weather_data: {
    temp?: number
    temp_max?: number
    temp_min?: number
    condition?: string
    weather_code?: number
    wind_speed?: number
    precipitation?: number
    description?: string
    sunrise?: string
    sunset?: string
    wind_morning?: WindEntry[]
    wind_evening?: WindEntry[]
  } | null
  harvests: Array<{
    species_name: string
    count: number
    missed: number
    shot_not_recovered: number
  }>
}

function wmoCategory(code: number | undefined): string {
  if (code == null) return 'clear'
  if (code <= 1) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'clear'
}

function ConditionIcon({ code, size = 20, className = 'text-ink' }: { code: number | undefined; size?: number; className?: string }) {
  const cat = wmoCategory(code)
  const s = size
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className }
  if (cat === 'clear') return (
    <svg {...props}>
      <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity={0.15} />
      <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
  if (cat === 'cloudy') return (
    <svg {...props}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" fillOpacity={0.12} />
    </svg>
  )
  if (cat === 'fog') return (
    <svg {...props}>
      <line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="5" y1="18" x2="19" y2="18" />
    </svg>
  )
  if (cat === 'rain') return (
    <svg {...props}>
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" fill="currentColor" fillOpacity={0.1} />
      <line x1="8" y1="19" x2="8" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="16" y1="19" x2="16" y2="21" />
    </svg>
  )
  if (cat === 'snow') return (
    <svg {...props}>
      <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
      <polyline points="17 7 12 12 7 7" /><polyline points="7 17 12 12 17 17" />
    </svg>
  )
  return (
    <svg {...props}>
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 3 15.9" fill="currentColor" fillOpacity={0.1} />
      <polyline points="13 11 9 17 15 17 11 23" fill="currentColor" fillOpacity={0.15} />
    </svg>
  )
}

function windColor(speed: number): string {
  if (speed <= 5)  return '#797B7E'   // muted — calm
  if (speed <= 12) return '#1B5E45'   // green — light
  if (speed <= 20) return '#1B4F6E'   // blue — moderate
  if (speed <= 30) return '#D97706'   // amber — strong
  return '#DC2626'                    // red — very strong
}

function WindStrip({ entries, label }: { entries: WindEntry[]; label: string }) {
  if (!entries.length) return null
  return (
    <div className="pt-3 pb-2">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2 px-5">{label} Wind</p>
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-max px-5">
          {entries.map((e, i) => {
            const color = windColor(e.speed)
            return (
              <div key={i} className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
                <span className="text-xs font-mono text-muted">{e.time}</span>
                <svg
                  width={22} height={22} viewBox="0 0 22 22"
                  style={{ transform: `rotate(${e.direction}deg)` }}
                >
                  <path d="M11 2 L15 16 L11 13 L7 16 Z" fill={color} />
                </svg>
                <span className="text-xs font-bold" style={{ color }}>{e.cardinal}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color }}>{e.speed}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 px-5 mt-2.5">
        {([
          { label: 'Calm', maxMph: 5,  color: '#797B7E' },
          { label: 'Light', maxMph: 12, color: '#1B5E45' },
          { label: 'Mod',   maxMph: 20, color: '#1B4F6E' },
          { label: 'Strong',maxMph: 30, color: '#D97706' },
          { label: 'Gale',  maxMph: 99, color: '#DC2626' },
        ] as const).map(tier => (
          <div key={tier.label} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tier.color }} />
            <span className="text-xs text-muted">{tier.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  )
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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
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
          className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <img src={lightboxPhoto} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50">
          <div className="bg-surface border border-hairline rounded-2xl p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-ink mb-2">Delete this hunt?</h3>
            <p className="text-muted text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-hairline text-muted hover:text-ink text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back + delete */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/hunts')} className="text-muted hover:text-ink transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-muted/50" />
            Field Log
          </p>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-muted hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Log entry card */}
      <div className="bg-surface border border-hairline rounded-xl overflow-hidden mb-4">

        {/* Header */}
        <div className="px-5 py-4 border-b border-hairline">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl text-ink tracking-wider leading-none">{hunt.name}</h1>
              <p className="text-sm text-muted mt-1">{hunt.blind_name}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                {format(new Date(hunt.date + 'T12:00:00'), 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-muted font-mono mt-0.5">
                {hunt.location.lat.toFixed(4)}°, {hunt.location.lng.toFixed(4)}°
              </p>
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className={`px-5 ${(isPro && hunt.weather_data && (hunt.is_morning || hunt.is_evening)) ? '' : 'border-b border-hairline'}`}>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest pt-3 pb-1">Conditions</p>
          {!isPro ? (
            <button
              onClick={() => setShowWeatherPaywall(true)}
              className="w-full flex items-center justify-between py-3 hover:opacity-70 transition-opacity"
            >
              <span className="text-sm text-muted">Weather data — Pro feature</span>
              <span className="text-xs font-semibold text-ink underline underline-offset-2">Unlock</span>
            </button>
          ) : hunt.weather_data ? (
            <div className="divide-y divide-hairline pb-1">
              {hunt.weather_data.condition && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">Sky</span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <ConditionIcon code={hunt.weather_data.weather_code} size={18} />
                    {hunt.weather_data.condition}
                  </span>
                </div>
              )}
              {hunt.weather_data.temp != null && <Row label="Temp" value={`${hunt.weather_data.temp}°F`} />}
              {hunt.weather_data.temp_max != null && <Row label="High / Low" value={`${hunt.weather_data.temp_max}° / ${hunt.weather_data.temp_min}°`} />}
              {hunt.weather_data.wind_speed != null && <Row label="Max Wind" value={`${hunt.weather_data.wind_speed} mph`} />}
              {hunt.weather_data.precipitation != null && <Row label="Precip" value={`${hunt.weather_data.precipitation}"`} />}
              {hunt.weather_data.sunrise && <Row label="Sunrise" value={hunt.weather_data.sunrise} />}
              {hunt.weather_data.sunset && <Row label="Sunset" value={hunt.weather_data.sunset} />}
            </div>
          ) : (
            <p className="text-sm text-muted py-3">No weather data available.</p>
          )}
        </div>

        {/* Wind strips — full-bleed horizontal scroll */}
        {isPro && hunt.weather_data && (hunt.is_morning || hunt.is_evening) && (
          <div className="border-b border-hairline">
            {hunt.is_morning && hunt.weather_data.wind_morning && (
              <WindStrip entries={hunt.weather_data.wind_morning} label="Morning" />
            )}
            {hunt.is_morning && hunt.is_evening && hunt.weather_data.wind_morning?.length && hunt.weather_data.wind_evening?.length ? (
              <div className="mx-5 border-t border-hairline" />
            ) : null}
            {hunt.is_evening && hunt.weather_data.wind_evening && (
              <WindStrip entries={hunt.weather_data.wind_evening} label="Evening" />
            )}
          </div>
        )}

        {/* Harvest */}
        {hunt.harvests.length > 0 && (
          <div className="px-5 border-b border-hairline">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest pt-3 pb-1">Harvest</p>
            <div className="divide-y divide-hairline">
              {hunt.harvests.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-semibold text-ink">{h.species_name}</span>
                  <div className="flex items-center gap-5">
                    {h.missed > 0 && (
                      <div className="text-right">
                        <p className="font-display text-xl text-muted leading-none">{h.missed}</p>
                        <p className="text-xs text-muted/70 uppercase tracking-wider">missed</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="font-display text-2xl text-green leading-none">{h.count}</p>
                      <p className="text-xs text-muted uppercase tracking-wider">harvested</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals footer */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex gap-5">
            {totalMissed > 0 && (
              <div>
                <p className="font-display text-2xl text-muted leading-none">{totalMissed}</p>
                <p className="text-xs text-muted uppercase tracking-wider">missed</p>
              </div>
            )}
            {totalLost > 0 && (
              <div>
                <p className="font-display text-2xl text-red-500 leading-none">{totalLost}</p>
                <p className="text-xs text-muted uppercase tracking-wider">lost</p>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="font-display text-5xl text-green leading-none">{totalHarvested}</p>
            <p className="text-xs text-muted uppercase tracking-widest">birds harvested</p>
          </div>
        </div>
      </div>

      {/* Photos */}
      {hunt.photos.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Photos</p>
          <div className="grid grid-cols-2 gap-2">
            {hunt.photos.map((photo, i) => (
              <button
                key={i}
                onClick={() => setLightboxPhoto(photo)}
                className="aspect-video rounded-xl overflow-hidden border border-hairline hover:border-ink/30 transition-colors"
              >
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {hunt.notes && (
        <div className="mb-4 bg-surface border border-hairline rounded-xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Notes</p>
          <p className="text-sm text-ink leading-relaxed">{hunt.notes}</p>
        </div>
      )}

      {/* Map */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Location</p>
        <div className="h-48 rounded-xl overflow-hidden border border-hairline">
          <MapContainer center={[hunt.location.lat, hunt.location.lng]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <Marker position={[hunt.location.lat, hunt.location.lng]} icon={greenIcon} />
          </MapContainer>
        </div>
        <p className="text-xs text-muted mt-1.5 text-center font-mono">
          {hunt.location.lat.toFixed(6)}, {hunt.location.lng.toFixed(6)}
        </p>
      </div>
    </div>
  )
}
