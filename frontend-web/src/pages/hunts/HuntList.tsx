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
  weather_data: { temp?: number; condition?: string } | null
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

  useEffect(() => {
    loadYears()
  }, [])

  useEffect(() => {
    loadHunts()
  }, [selectedYear])

  const loadYears = async () => {
    try {
      const data = await fetchHuntYears()
      const available = data.years || []
      setYears(available)
      if (available.length > 0 && selectedYear === null) {
        setSelectedYear(available[0])
      }
    } catch {
      // ignore
    }
  }

  const loadHunts = async () => {
    setLoading(true)
    try {
      const data = await fetchHunts(selectedYear || undefined)
      setHunts(data)
    } catch {
      // ignore
    } finally {
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="hunt_limit" />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider">My Hunts</h1>
        <button
          onClick={handleNewHunt}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl transition-colors text-sm uppercase tracking-wider"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New Hunt
        </button>
      </div>

      {/* Year tabs */}
      {years.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
          {years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                selectedYear === year
                  ? 'bg-orange-500 text-white'
                  : 'bg-navy-800 text-gray-400 border border-gray-700 hover:border-gray-500'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Free limit banner */}
      {!isPro && (
        <div className="flex items-center justify-between bg-navy-800 border border-orange-500/30 rounded-xl px-4 py-3 mb-6">
          <span className="text-sm text-gray-400">
            <span className="text-orange-500 font-bold">{Math.min(hunts.length, FREE_HUNT_LIMIT)}/{FREE_HUNT_LIMIT}</span> hunts used on Free plan
          </span>
          <Link to="/profile?upgrade=1" className="text-xs font-bold text-orange-500 hover:text-orange-400 uppercase tracking-wider">
            Upgrade →
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500" />
        </div>
      ) : hunts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-400 font-semibold">No hunts recorded yet</p>
          <p className="text-gray-600 text-sm mt-1">Tap "New Hunt" to log your first hunt</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hunts.map(hunt => (
            <Link
              key={hunt.id}
              to={`/hunts/${hunt.id}`}
              className="flex items-stretch gap-3 bg-navy-800 border border-gray-700 hover:border-orange-500/50 rounded-xl p-3 transition-all group"
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-navy-700 flex items-center justify-center">
                {hunt.photos && hunt.photos[0] ? (
                  <img src={hunt.photos[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-white text-sm leading-tight group-hover:text-orange-400 transition-colors truncate">
                    {hunt.name}
                  </p>
                  <svg className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="text-xs text-gray-500 truncate">{hunt.blind_name}</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">
                  {format(new Date(hunt.date + 'T12:00:00'), 'MM-dd-yyyy')}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {hunt.weather_data?.temp != null && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                      {hunt.weather_data.temp}°F
                    </span>
                  )}
                  <span className="text-xs text-orange-500 font-semibold flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {totalHarvested(hunt.harvests)} birds
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
