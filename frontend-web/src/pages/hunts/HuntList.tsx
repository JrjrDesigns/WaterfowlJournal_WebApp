import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { fetchHunts, fetchHuntYears } from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import PaywallModal from '../../components/PaywallModal'

interface Hunt {
  id: string
  name: string
  blind_name: string
  location_type: string | null
  date: string
  weather_data: { temp?: number; condition?: string; weather_code?: number; wind_speed?: number } | null
  harvests: Array<{ species_name: string; count: number }>
  photos: string[]
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

function ConditionIcon({ code }: { code: number | undefined }) {
  const cat = wmoCategory(code)
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'text-muted flex-shrink-0' }
  if (cat === 'clear') return (
    <svg {...props}><circle cx="12" cy="12" r="5" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /></svg>
  )
  if (cat === 'cloudy') return (
    <svg {...props}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
  )
  if (cat === 'fog') return (
    <svg {...props}><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="5" y1="18" x2="19" y2="18" /></svg>
  )
  if (cat === 'rain') return (
    <svg {...props}><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" /><line x1="8" y1="19" x2="8" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="16" y1="19" x2="16" y2="21" /></svg>
  )
  if (cat === 'snow') return (
    <svg {...props}><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><polyline points="17 7 12 12 7 7" /><polyline points="7 17 12 12 17 17" /></svg>
  )
  return (
    <svg {...props}><path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 3 15.9" /><polyline points="13 11 9 17 15 17 11 23" /></svg>
  )
}

const FREE_HUNT_LIMIT = 10

export default function HuntList() {
  const [hunts, setHunts] = useState<Hunt[]>([])
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaywall, setShowPaywall] = useState(false)
  const { isPro } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { loadYears() }, [])
  useEffect(() => { loadHunts() }, [selectedYear])

  const loadYears = async () => {
    try {
      const data = await fetchHuntYears()
      const available = data.years || []
      setYears(available)
      if (available.length > 0 && selectedYear === null) {
        setSelectedYear(available[0])
      }
    } catch { /* ignore */ }
  }

  const loadHunts = async () => {
    setLoading(true)
    try {
      const data = await fetchHunts(selectedYear || undefined)
      setHunts(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const totalHarvested = (harvests: Hunt['harvests']) =>
    harvests.reduce((sum, h) => sum + h.count, 0)

  const handleNewHunt = () => {
    if (!isPro && hunts.length >= FREE_HUNT_LIMIT) {
      setShowPaywall(true)
      return
    }
    navigate('/hunts/create')
  }

  const conditionSummary = (hunt: Hunt) => {
    const parts: string[] = []
    if (hunt.weather_data?.temp != null) parts.push(`${hunt.weather_data.temp}°F`)
    if (hunt.weather_data?.wind_speed != null) parts.push(`${hunt.weather_data.wind_speed} mph`)
    if (hunt.weather_data?.condition) parts.push(hunt.weather_data.condition)
    return parts.join(' · ') || null
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="hunt_limit" />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Field Journal
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">MY HUNTS</h1>
        </div>
        <button
          onClick={handleNewHunt}
          className="flex items-center gap-2 bg-ink hover:bg-black text-white font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Log Hunt
        </button>
      </div>

      {/* Year tabs */}
      {years.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                selectedYear === year
                  ? 'bg-ink text-white border-ink'
                  : 'bg-surface text-muted border-hairline hover:border-ink hover:text-ink'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Free limit indicator */}
      {!isPro && hunts.length > 0 && (
        <div className="flex items-center justify-between py-2 mb-4">
          <span className="text-xs text-muted">
            <span className="font-semibold text-ink">{Math.min(hunts.length, FREE_HUNT_LIMIT)}</span>
            <span> / {FREE_HUNT_LIMIT} hunts on Free</span>
          </span>
          <Link to="/profile?upgrade=1" className="text-xs font-semibold text-ink underline underline-offset-2">
            Upgrade
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
        </div>
      ) : hunts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted font-semibold">No hunts logged yet.</p>
          <p className="text-muted text-sm mt-1">Tap "Log Hunt" to record your first sit.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-hairline overflow-hidden">
          <div className="divide-y divide-hairline">
            {hunts.map((hunt, idx) => {
              const total = totalHarvested(hunt.harvests)
              const summary = conditionSummary(hunt)
              return (
                <Link
                  key={hunt.id}
                  to={`/hunts/${hunt.id}`}
                  className="flex items-stretch hover:bg-bg transition-colors group"
                >
                  {/* Location type stub */}
                  <div className="w-16 flex-shrink-0 relative bg-green/10 border-r border-hairline overflow-hidden flex items-center justify-center">
                    {hunt.location_type && (
                      <img
                        src={`/location-types/${hunt.location_type}.jpg`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <svg className="w-6 h-6 text-green/40 relative z-10" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 px-4 py-3.5">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                      {format(new Date(hunt.date + 'T12:00:00'), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm font-semibold text-ink truncate mt-0.5">{hunt.name}</p>
                    {hunt.blind_name && <p className="text-xs text-muted truncate">{hunt.blind_name}</p>}
                    {summary && (
                      <p className="text-xs text-muted mt-0.5 truncate flex items-center gap-1">
                        <ConditionIcon code={hunt.weather_data?.weather_code} />
                        {summary}
                      </p>
                    )}
                  </div>

                  {/* Bird count */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end justify-center pr-4">
                    <p className="font-display text-3xl text-green leading-none">{total}</p>
                    <p className="text-xs text-muted uppercase tracking-wider">birds</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
