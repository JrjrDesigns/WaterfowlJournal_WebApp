import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { fetchStatistics, fetchHuntYears } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import PaywallModal from '../components/PaywallModal'

interface Statistics {
  total_hunts: number
  total_harvested: number
  total_missed: number
  total_shot_not_recovered: number
  ducks_total: number
  geese_total: number
  others_total: number
  by_species: Record<string, { harvested: number; missed: number; shot_not_recovered: number }>
}

const TOOLTIP_STYLE = {
  backgroundColor: '#111c2e',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#fff',
}

export default function Stats() {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [years, setYears] = useState<number[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaywall, setShowPaywall] = useState(false)
  const { isPro } = useAuth()

  useEffect(() => { loadYears() }, [])
  useEffect(() => { loadStats() }, [selectedYear])

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

  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await fetchStatistics(selectedYear || undefined)
      setStats(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500" />
      </div>
    )
  }

  if (!stats || stats.total_hunts === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-6">Statistics</h1>
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-400 font-semibold">No data yet</p>
          <p className="text-gray-600 text-sm mt-1">Record some hunts to see your statistics</p>
        </div>
      </div>
    )
  }

  const categoryData = [
    { name: 'Ducks', harvested: stats.ducks_total },
    { name: 'Geese', harvested: stats.geese_total },
    { name: 'Others', harvested: stats.others_total },
  ]

  const topSpecies = Object.entries(stats.by_species)
    .sort(([, a], [, b]) => b.harvested - a.harvested)
    .slice(0, 5)
    .map(([name, data]) => ({ name, ...data }))

  const successRate =
    stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered > 0
      ? (
          (stats.total_harvested /
            (stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered)) *
          100
        ).toFixed(1)
      : '0'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="stats" />}

      <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-6">Statistics</h1>

      {/* Year tabs */}
      {years.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Hunts', value: stats.total_hunts, icon: '🗓' },
          { label: 'Harvested', value: stats.total_harvested, icon: '✓' },
          { label: 'Missed', value: stats.total_missed, icon: '✗' },
          { label: 'Lost', value: stats.total_shot_not_recovered, icon: '−' },
        ].map(s => (
          <div key={s.label} className="bg-navy-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{s.value}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts — paywalled for free users */}
      {!isPro ? (
        <button
          onClick={() => setShowPaywall(true)}
          className="w-full mb-6 relative rounded-xl overflow-hidden border border-gray-700 group"
        >
          {/* Blurred chart preview */}
          <div className="h-52 bg-navy-800 flex items-end justify-around px-6 pb-4 blur-sm opacity-40 pointer-events-none">
            {[60, 30, 10].map((h, i) => (
              <div key={i} className="w-12 bg-orange-500 rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
          {/* Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-950/70">
            <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-white font-bold text-sm">Advanced Charts — Pro Feature</p>
            <p className="text-gray-400 text-xs mt-1">Upgrade to unlock full analytics</p>
            <span className="mt-3 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-colors">
              Upgrade to Pro
            </span>
          </div>
        </button>
      ) : (
        <>
          {/* Bar chart — harvest by category */}
          <div className="bg-navy-800 border border-gray-700 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Harvest by Category</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(249,115,22,0.1)' }} />
                <Bar dataKey="harvested" fill="#f97316" radius={[4, 4, 0, 0]} name="Harvested" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top species bar */}
          <div className="bg-navy-800 border border-gray-700 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Top Species</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSpecies} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="harvested" fill="#f97316" radius={[0, 4, 4, 0]} name="Harvested" />
                <Bar dataKey="missed" fill="#eab308" radius={[0, 4, 4, 0]} name="Missed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Success rate — always visible */}
      <div className="bg-navy-800 border border-gray-700 rounded-xl p-6 text-center">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Harvest Success Rate</p>
        <p className="text-6xl font-extrabold text-orange-500">{successRate}%</p>
        <p className="text-xs text-gray-600 mt-2">
          {stats.total_harvested} harvested / {stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered} total shots
        </p>
      </div>
    </div>
  )
}
