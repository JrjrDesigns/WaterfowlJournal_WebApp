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
  date: string
  weather_data: { temp?: number; condition?: string; wind_speed?: number } | null
  harvests: Array<{ species_name: string; count: number }>
  photos: string[]
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
                  className="flex items-center gap-4 px-5 py-4 hover:bg-bg transition-colors group"
                >
                  {/* Thumbnail */}
                  {hunt.photos?.[0] ? (
                    <img src={hunt.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-hairline" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-bg flex-shrink-0 border border-hairline flex items-center justify-center">
                      <svg className="w-5 h-5 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                      {format(new Date(hunt.date + 'T12:00:00'), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm font-semibold text-ink truncate mt-0.5">{hunt.blind_name || hunt.name}</p>
                    {summary && (
                      <p className="text-xs text-muted mt-0.5 truncate">{summary}</p>
                    )}
                  </div>

                  {/* Bird count */}
                  <div className="text-right flex-shrink-0">
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
