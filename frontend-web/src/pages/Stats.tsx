import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
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
  backgroundColor: '#FFFFFF',
  border: '1px solid #E4E5E3',
  borderRadius: '8px',
  color: '#13141A',
  fontFamily: '"Work Sans", sans-serif',
  fontSize: '12px',
}

function StatCol({ label, value, color = 'text-green' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center px-4">
      <p className={`font-display text-5xl leading-none ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-2">{label}</p>
    </div>
  )
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
      if (available.length > 0 && selectedYear === null) setSelectedYear(available[0])
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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
      </div>
    )
  }

  if (!stats || stats.total_hunts === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Season Review
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">STATISTICS</h1>
        </div>
        <div className="text-center py-20">
          <p className="text-muted font-semibold">No data yet.</p>
          <p className="text-muted text-sm mt-1">Log some hunts to see your season stats.</p>
        </div>
      </div>
    )
  }

  const successRate =
    stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered > 0
      ? (
          (stats.total_harvested /
            (stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered)) *
          100
        ).toFixed(1)
      : '0'

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const ringOffset = circumference - (parseFloat(successRate) / 100) * circumference

  const categoryData = [
    { name: 'Ducks', harvested: stats.ducks_total },
    { name: 'Geese', harvested: stats.geese_total },
    { name: 'Others', harvested: stats.others_total },
  ]

  const topSpecies = Object.entries(stats.by_species)
    .sort(([, a], [, b]) => b.harvested - a.harvested)
    .slice(0, 5)
    .map(([name, data]) => ({ name, ...data }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="stats" />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Season Review
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">STATISTICS</h1>
        </div>

        {/* Year tabs */}
        {years.length > 0 && (
          <div className="flex gap-2 mt-1">
            {years.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
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
      </div>

      {/* Season summary — hairline-separated columns */}
      <div className="bg-surface border border-hairline rounded-xl mb-4 py-6">
        <div className="flex items-stretch divide-x divide-hairline">
          <StatCol label="Hunts" value={stats.total_hunts} />
          <StatCol label="Harvested" value={stats.total_harvested} />
          <StatCol label="Missed" value={stats.total_missed} color="text-blue" />
        </div>
      </div>

      {/* Harvest rate ring */}
      <div className="bg-surface border border-hairline rounded-xl mb-4 flex flex-col items-center py-8">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-5">Harvest Rate</p>
        <div className="relative w-36 h-36">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#E4E5E3" strokeWidth="8" />
            <circle
              cx="60" cy="60" r={radius}
              fill="none" stroke="#1B5E45" strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl text-green leading-none">{successRate}%</span>
          </div>
        </div>
        <p className="text-xs text-muted mt-4">
          {stats.total_harvested} harvested · {stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered} total shots
        </p>
      </div>

      {/* Charts — Pro only */}
      {!isPro ? (
        <button
          onClick={() => setShowPaywall(true)}
          className="w-full mb-4 relative rounded-xl overflow-hidden border border-hairline group"
        >
          {/* Blurred preview */}
          <div className="h-48 bg-surface flex items-end justify-around px-6 pb-4 blur-sm opacity-30 pointer-events-none">
            {[60, 30, 10].map((h, i) => (
              <div key={i} className="w-10 bg-green rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
          {/* Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface/80">
            <svg className="w-5 h-5 text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-ink font-semibold text-sm">Advanced charts — Pro</p>
            <p className="text-muted text-xs mt-1 mb-3">Unlock full analytics</p>
            <span className="px-4 py-1.5 bg-ink text-white text-xs font-semibold rounded-lg">Go Pro</span>
          </div>
        </button>
      ) : (
        <>
          {/* Harvest by category */}
          <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">Harvest by Category</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(27,94,69,0.06)' }} />
                <Bar dataKey="harvested" fill="#1B5E45" radius={[4, 4, 0, 0]} name="Harvested" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top species */}
          <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">Top Species</p>
            <ResponsiveContainer width="100%" height={Math.max(160, topSpecies.length * 40)}>
              <BarChart data={topSpecies} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="harvested" fill="#1B5E45" radius={[0, 4, 4, 0]} name="Harvested" />
                <Bar dataKey="missed" fill="#1B4F6E" radius={[0, 4, 4, 0]} name="Missed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
