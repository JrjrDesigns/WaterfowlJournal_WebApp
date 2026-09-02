import React, { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fetchStatistics, fetchSeasonSummary, fetchHuntSeasons, type Season } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import PaywallModal from '../components/PaywallModal'
import SpeciesIcon from '../components/SpeciesIcon'
import { LogoIcon } from '../components/Logo'

interface Bucket { name: string; hunts: number; harvested: number }
interface TopEntry { name: string; hunts: number; harvested: number }

interface Statistics {
  total_hunts: number
  total_harvested: number
  total_missed: number
  total_shot_not_recovered: number
  total_seen: number
  ducks_total: number
  geese_total: number
  others_total: number
  by_species: Record<string, { harvested: number; missed: number; shot_not_recovered: number; seen: number }>
  success_rate: number
  avg_birds_per_hunt: number
  shot_efficiency: number
  best_blind: TopEntry | null
  most_used_blind: TopEntry | null
  best_location: TopEntry | null
  best_location_type: TopEntry | null
  best_day: { date: string; name: string; harvested: number } | null
  time_split: { morning: { hunts: number; harvested: number }; evening: { hunts: number; harvested: number } }
  by_month: Array<{ month: string; hunts: number; harvested: number }>
  by_day_of_week: Bucket[]
  by_moon_phase: Bucket[]
  by_sky: Bucket[]
  by_temp: Bucket[]
  by_wind: Bucket[]
  group: {
    hunts: number
    total_harvested: number
    avg_party_size: number
    by_species: Record<string, number>
  } | null
}

/** The free tier's Season Card — counting, not analysis. */
interface SeasonSummary {
  total_hunts: number
  total_harvested: number
  species_count: number
  days_afield: number
  first_hunt_date: string | null
  last_hunt_date: string | null
  insight: { text: string; sample: number } | null
  insight_unlocks_at: number
}

const TOOLTIP_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E4E5E3',
  borderRadius: '8px',
  color: '#13141A',
  fontFamily: '"Work Sans", sans-serif',
  fontSize: '12px',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LOCATION_TYPE_LABELS: Record<string, string> = {
  'marsh': 'Marsh', 'cut-corn': 'Cut Corn', 'swamp': 'Swamp', 'flooded-timber': 'Flooded Timber',
  'creek': 'Creek', 'river': 'River', 'lakeshore': 'Lakeshore', 'open-water': 'Open Water',
  'coastal': 'Coastal', 'field': 'Field', 'reservoir': 'Reservoir', 'pothole': 'Pothole',
  'beaver-pond': 'Beaver Pond',
}

function StatCol({ label, value, color = 'text-green' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center px-4">
      <p className={`font-display text-5xl leading-none ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-2">{label}</p>
    </div>
  )
}

/** A Season Card counter. Smaller than StatCol so four fit across a phone. */
function SummaryTile({ label, value, color = 'text-ink' }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center px-2 py-4">
      <p className={`font-display text-4xl leading-none ${color}`}>{value}</p>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mt-2 leading-tight">{label}</p>
    </div>
  )
}

/** What Pro adds, named rather than blurred.
 *
 * A blurred chart reads as a tax on something the hunter already earned; a
 * plain list of what's inside reads as an offer. This is the whole reason the
 * old full-page lock came down, so don't reintroduce a teased-out preview here.
 */
function LockedPro({ onClick }: { onClick: () => void }) {
  const items = [
    'Every species you took, bird by bird',
    'Your best blind, best spot and best day',
    'Morning versus evening performance',
    'How wind, sky, temperature and moon shaped your season',
    'Month-by-month and season-over-season trends',
    'CSV export of everything you have logged',
  ]
  return (
    <button onClick={onClick} className="w-full text-left bg-surface border border-hairline rounded-xl p-5 hover:border-ink transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-xs font-semibold text-muted uppercase tracking-widest">The rest of your season — Pro</p>
      </div>
      <ul className="space-y-2 mb-5">
        {items.map(i => (
          <li key={i} className="flex items-start gap-3 text-sm text-ink leading-snug">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-muted flex-shrink-0" />
            {i}
          </li>
        ))}
      </ul>
      <span className="inline-block px-4 py-2 bg-ink text-white text-xs font-semibold rounded-lg">Go Pro</span>
    </button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">{title}</p>
      {children}
    </div>
  )
}

function HighlightTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="py-3 px-4">
      <p className="text-xs text-muted uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-semibold text-ink leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

/** Horizontal rows: label, birds/hunt bar, values. Bar scaled to max avg in the set. */
function BreakdownRows({ data, icon }: { data: Bucket[]; icon?: (name: string) => React.ReactNode }) {
  const rows = data.map(d => ({ ...d, avg: d.hunts > 0 ? d.harvested / d.hunts : 0 }))
  const maxAvg = Math.max(...rows.map(r => r.avg), 0.001)
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.name} className="flex items-center gap-3">
          {icon && <span className="flex-shrink-0 w-6 flex justify-center">{icon(r.name)}</span>}
          <span className="text-xs font-semibold text-ink w-28 flex-shrink-0 leading-tight">{r.name}</span>
          <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-green rounded-full"
              style={{ width: `${(r.avg / maxAvg) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-ink tabular-nums w-8 text-right flex-shrink-0">{r.avg.toFixed(1)}</span>
          <span className="text-xs text-muted tabular-nums w-14 text-right flex-shrink-0">{r.hunts} hunt{r.hunts === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  )
}

function MoonIcon({ name, size = 16 }: { name: string; size?: number }) {
  const phaseMap: Record<string, number> = {
    'New Moon': 0, 'Waxing Crescent': 0.125, 'First Quarter': 0.25, 'Waxing Gibbous': 0.375,
    'Full Moon': 0.5, 'Waning Gibbous': 0.625, 'Last Quarter': 0.75, 'Waning Crescent': 0.875,
  }
  const phase = phaseMap[name] ?? 0
  const r = (size - 2) / 2
  const cx = size / 2
  const cy = size / 2
  const lit = '#D4A94A'
  const shadow = '#3A3C42'
  if (phase === 0) return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={shadow} /></svg>
  if (phase === 0.5) return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={lit} /></svg>
  const waxing = phase < 0.5
  const termRx = Math.abs(Math.cos(Math.PI * 2 * phase)) * r
  const top = `${cx},${cy - r}`
  const bottom = `${cx},${cy + r}`
  let litPath: string
  if (waxing) {
    const sweep2 = phase > 0.25 ? 0 : 1
    litPath = `M ${top} A ${r},${r} 0 0,1 ${bottom} A ${termRx},${r} 0 0,${sweep2} ${top} Z`
  } else {
    const sweep2 = phase < 0.75 ? 1 : 0
    litPath = `M ${top} A ${r},${r} 0 0,0 ${bottom} A ${termRx},${r} 0 0,${sweep2} ${top} Z`
  }
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill={shadow} />
      <path d={litPath} fill={lit} />
    </svg>
  )
}

export default function Stats() {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [summary, setSummary] = useState<SeasonSummary | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaywall, setShowPaywall] = useState(false)
  const { isPro } = useAuth()
  const latestRequestSeason = useRef<number | null>(null)

  useEffect(() => { loadSeasons() }, [])
  // Two different endpoints, not one endpoint with fields hidden: the full Pro
  // analytics payload is never sent to a free client.
  useEffect(() => {
    if (isPro) loadStats()
    else loadSummary()
  }, [selectedSeason, isPro])

  const loadSeasons = async () => {
    try {
      const data = await fetchHuntSeasons()
      const available = data.seasons || []
      setSeasons(available)
      if (available.length > 0 && selectedSeason === null) setSelectedSeason(available[0].start)
    } catch { /* ignore */ }
  }

  const loadSummary = async () => {
    const requestSeason = selectedSeason
    latestRequestSeason.current = requestSeason
    setLoading(true)
    try {
      const data = await fetchSeasonSummary(requestSeason || undefined)
      if (latestRequestSeason.current !== requestSeason) return
      setSummary(data)
    } catch {
      /* ignore */
    } finally {
      if (latestRequestSeason.current === requestSeason) setLoading(false)
    }
  }

  const loadStats = async () => {
    const requestSeason = selectedSeason
    latestRequestSeason.current = requestSeason
    setLoading(true)
    try {
      const data = await fetchStatistics(requestSeason || undefined)
      // Ignore this response if a newer season has been selected in the meantime —
      // otherwise a slow request for a stale season can overwrite fresher data.
      if (latestRequestSeason.current !== requestSeason) return
      setStats(data)
    } catch {
      /* ignore */
    } finally {
      if (latestRequestSeason.current === requestSeason) setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
      </div>
    )
  }

  // Shared by both tiers' headers. Plain JSX rather than a nested component so
  // it isn't remounted on every render.
  const seasonTabs = seasons.length > 0 ? (
    <div className="flex gap-2 mt-1">
      {seasons.map(season => (
        <button
          key={season.start}
          onClick={() => setSelectedSeason(season.start)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
            selectedSeason === season.start
              ? 'bg-ink text-white border-ink'
              : 'bg-surface text-muted border-hairline hover:border-ink hover:text-ink'
          }`}
        >
          {season.label}
        </button>
      ))}
    </div>
  ) : null

  // The free Season Card. This is a finished screen, not a locked one — free
  // answers "what did I do", Pro answers "what should I do". It renders the
  // hunter's real numbers first and names what Pro adds underneath, because the
  // earlier version showed headline stats with the charts blurred out and that
  // read as being taxed on their own data.
  if (!isPro) {
    const hasHunts = (summary?.total_hunts ?? 0) > 0
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="stats" />}

        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
              <span className="inline-block w-5 h-px bg-muted/50" />
              Season Review
            </p>
            <h1 className="font-display text-4xl text-ink tracking-wider leading-none">STATISTICS</h1>
          </div>
          {seasonTabs}
        </div>

        {!hasHunts ? (
          <div className="text-center py-14 mb-4">
            <p className="text-muted font-semibold">No hunts logged yet.</p>
            <p className="text-muted text-sm mt-1">Your season fills in here as you log them — free, with no limit.</p>
          </div>
        ) : summary && (
          <>
            <div className="bg-surface border border-hairline rounded-xl mb-4">
              <div className="grid grid-cols-4 divide-x divide-hairline">
                <SummaryTile label="Hunts" value={summary.total_hunts} />
                <SummaryTile label="Harvested" value={summary.total_harvested} color="text-green" />
                <SummaryTile label="Species" value={summary.species_count} />
                <SummaryTile label="Days Afield" value={summary.days_afield} />
              </div>
            </div>

            {/* Species stays a bare count on free. The logo sits in the slot the
                species photograph occupies on Pro, so upgrading fills the shape
                in rather than rearranging the screen. */}
            <div className="bg-surface border border-hairline rounded-xl overflow-hidden mb-4 flex items-stretch">
              <div className="w-24 flex-shrink-0 border-r border-hairline flex items-center justify-center bg-bg">
                <LogoIcon className="w-10 h-10" />
              </div>
              <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink leading-tight">Species taken</p>
                  <p className="text-xs text-muted mt-0.5 leading-snug">See every bird by name on Pro</p>
                </div>
                <p className="font-display text-3xl text-green leading-none flex-shrink-0">{summary.species_count}</p>
              </div>
            </div>

            <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">From your season</p>
              {summary.insight ? (
                <>
                  <p className="text-base font-semibold text-ink leading-snug">{summary.insight.text}</p>
                  <p className="text-xs text-muted mt-2 leading-snug">
                    Drawn from {summary.insight.sample} of your hunts. Pro shows every pattern behind your season, not just the strongest one.
                  </p>
                </>
              ) : summary.total_hunts < summary.insight_unlocks_at ? (
                <p className="text-sm text-muted leading-snug">
                  Log {summary.insight_unlocks_at - summary.total_hunts} more hunt
                  {summary.insight_unlocks_at - summary.total_hunts === 1 ? '' : 's'} and Blind Guide
                  will start finding the patterns in your season.
                </p>
              ) : (
                <p className="text-sm text-muted leading-snug">
                  No clear pattern in this season yet — keep logging and one will surface.
                </p>
              )}
            </div>
          </>
        )}

        <LockedPro onClick={() => setShowPaywall(true)} />
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

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const ringOffset = circumference - (stats.success_rate / 100) * circumference

  const categoryData = [
    { name: 'Ducks', harvested: stats.ducks_total },
    { name: 'Geese', harvested: stats.geese_total },
    { name: 'Others', harvested: stats.others_total },
  ]

  const topSpecies = Object.entries(stats.by_species)
    .sort(([, a], [, b]) => b.harvested - a.harvested)
    .slice(0, 6)
    .map(([name, data]) => ({ name, ...data }))

  const speciesSummary = Object.entries(stats.by_species)
    .filter(([, data]) => data.harvested > 0)
    .sort(([, a], [, b]) => b.harvested - a.harvested)
    .map(([name, data]) => ({ name, harvested: data.harvested }))

  const monthData = stats.by_month.map(m => ({
    ...m,
    label: MONTH_NAMES[parseInt(m.month.slice(5, 7)) - 1] ?? m.month,
  }))

  const morningAvg = stats.time_split.morning.hunts > 0
    ? stats.time_split.morning.harvested / stats.time_split.morning.hunts : 0
  const eveningAvg = stats.time_split.evening.hunts > 0
    ? stats.time_split.evening.harvested / stats.time_split.evening.hunts : 0
  const hasTimeSplit = stats.time_split.morning.hunts > 0 || stats.time_split.evening.hunts > 0

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

        {seasonTabs}
      </div>

      {/* Season summary */}
      <div className="bg-surface border border-hairline rounded-xl mb-4 py-6">
        <div className="flex items-stretch justify-center divide-x divide-hairline">
          <StatCol label="Hunts" value={stats.total_hunts} color="text-ink" />
          <StatCol label="Harvested" value={stats.total_harvested} />
          <StatCol label="Missed" value={stats.total_missed} color="text-blue" />
          {stats.total_seen > 0 && <StatCol label="Seen" value={stats.total_seen} color="text-muted" />}
        </div>
      </div>

      {/* Success rate ring + efficiency */}
      <div className="bg-surface border border-hairline rounded-xl mb-4 py-8 flex items-center justify-around">
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32">
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
              <span className="font-display text-3xl text-green leading-none">{stats.success_rate}%</span>
            </div>
          </div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-3">Success Rate</p>
          <p className="text-xs text-muted mt-0.5">hunts with birds</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="text-center">
            <p className="font-display text-4xl text-ink leading-none">{stats.avg_birds_per_hunt}</p>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-1.5">Birds / Hunt</p>
          </div>
          <div className="text-center">
            <p className="font-display text-4xl text-blue leading-none">{stats.shot_efficiency}%</p>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-1.5">Shot Efficiency</p>
          </div>
        </div>
      </div>

      {/* Everything below is Pro; free accounts never reach this render. */}
      {(
        <>
          {/* Species Breakdown */}
          {speciesSummary.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Species Breakdown</p>

              {/* Mobile: full-width list, no room for cards */}
              <div className="sm:hidden bg-surface border border-hairline rounded-xl overflow-hidden divide-y divide-hairline">
                {speciesSummary.map(s => (
                  <div key={s.name} className="flex items-stretch">
                    <SpeciesIcon
                      species={s.name}
                      variant="thumbnail"
                      className="w-24 h-24 flex-shrink-0 border-r border-hairline"
                    />
                    <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink break-words leading-tight">{s.name}</p>
                      <p className="font-display text-2xl text-green leading-none flex-shrink-0 pl-3">{s.harvested}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tablet/Desktop: card grid — always 2 across, text stacks instead of truncating */}
              <div className="hidden sm:grid sm:grid-cols-2 gap-3">
                {speciesSummary.map(s => (
                  <div key={s.name} className="flex items-stretch bg-surface border border-hairline rounded-xl overflow-hidden">
                    <SpeciesIcon
                      species={s.name}
                      variant="thumbnail"
                      className="w-24 h-24 flex-shrink-0 border-r border-hairline"
                    />
                    <div className="flex-1 min-w-0 px-3 py-3.5 flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink break-words leading-tight">{s.name}</p>
                      <p className="font-display text-2xl text-green leading-none flex-shrink-0 pl-2">{s.harvested}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Highlights */}
          <div className="bg-surface border border-hairline rounded-xl mb-4 overflow-hidden">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest px-5 pt-4 pb-1">Highlights</p>
            <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-t border-hairline mt-2">
              {stats.best_blind && (
                <HighlightTile label="Best Blind" value={stats.best_blind.name} sub={`${stats.best_blind.harvested} birds`} />
              )}
              {stats.most_used_blind && (
                <HighlightTile label="Most Hunted Blind" value={stats.most_used_blind.name} sub={`${stats.most_used_blind.hunts} hunts`} />
              )}
              {stats.best_location && (
                <HighlightTile label="Best Location" value={stats.best_location.name} sub={`${stats.best_location.harvested} birds`} />
              )}
              {stats.best_location_type && (
                <HighlightTile
                  label="Best Terrain"
                  value={LOCATION_TYPE_LABELS[stats.best_location_type.name] ?? stats.best_location_type.name}
                  sub={`${stats.best_location_type.harvested} birds`}
                />
              )}
              {stats.best_day && (
                <HighlightTile
                  label="Best Day"
                  value={new Date(stats.best_day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  sub={`${stats.best_day.harvested} birds — ${stats.best_day.name}`}
                />
              )}
            </div>
          </div>

          {/* Group Hunts */}
          {stats.group && stats.group.hunts > 0 && (
            <Card title="Group Hunts">
              <div className="flex items-stretch justify-center divide-x divide-hairline mb-4">
                <StatCol label="Hunts" value={stats.group.hunts} color="text-ink" />
                <StatCol label="Party Birds" value={stats.group.total_harvested} />
                <StatCol label="Avg Party Size" value={stats.group.avg_party_size} color="text-blue" />
              </div>
              {Object.keys(stats.group.by_species).length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max(120, Object.keys(stats.group.by_species).length * 36)}>
                  <BarChart
                    data={Object.entries(stats.group.by_species).sort(([, a], [, b]) => b - a).map(([name, harvested]) => ({ name, harvested }))}
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 10, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="harvested" fill="#1B5E45" radius={[0, 4, 4, 0]} name="Party Total" />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-muted mt-3">Full party bag on hunts logged with others — not just your birds.</p>
            </Card>
          )}

          {/* Morning vs Evening */}
          {hasTimeSplit && (
            <Card title="Morning vs Evening">
              <div className="flex divide-x divide-hairline">
                {(['morning', 'evening'] as const).map(t => {
                  const s = stats.time_split[t]
                  const avg = t === 'morning' ? morningAvg : eveningAvg
                  const best = morningAvg !== eveningAvg && avg === Math.max(morningAvg, eveningAvg)
                  return (
                    <div key={t} className="flex-1 text-center px-4">
                      <p className={`font-display text-4xl leading-none ${best ? 'text-green' : 'text-ink'}`}>
                        {avg.toFixed(1)}
                      </p>
                      <p className="text-xs font-semibold text-muted uppercase tracking-widest mt-1.5 capitalize">{t}</p>
                      <p className="text-xs text-muted mt-0.5">{s.harvested} birds · {s.hunts} hunt{s.hunts === 1 ? '' : 's'}</p>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted text-center mt-3">avg birds per hunt</p>
            </Card>
          )}

          {/* Harvest by month */}
          {monthData.length > 1 && (
            <Card title="Harvest by Month">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(27,94,69,0.06)' }} />
                  <Bar dataKey="harvested" fill="#1B5E45" radius={[4, 4, 0, 0]} name="Harvested" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Day of week */}
          {stats.by_day_of_week.length > 1 && (
            <Card title="Best Day of the Week">
              <BreakdownRows data={stats.by_day_of_week} />
            </Card>
          )}

          {/* Moon phase */}
          {stats.by_moon_phase.length > 1 && (
            <Card title="Moon Phase">
              <BreakdownRows data={stats.by_moon_phase} icon={name => <MoonIcon name={name} />} />
              <p className="text-xs text-muted mt-3">avg birds per hunt by moon phase</p>
            </Card>
          )}

          {/* Conditions */}
          {(stats.by_sky.length > 1 || stats.by_temp.length > 1 || stats.by_wind.length > 1) && (
            <Card title="Best Conditions">
              <div className="space-y-5">
                {stats.by_sky.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-ink mb-2">Sky</p>
                    <BreakdownRows data={stats.by_sky} />
                  </div>
                )}
                {stats.by_temp.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-ink mb-2">Temperature</p>
                    <BreakdownRows data={stats.by_temp} />
                  </div>
                )}
                {stats.by_wind.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-ink mb-2">Wind</p>
                    <BreakdownRows data={stats.by_wind} />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted mt-4">avg birds per hunt in each condition</p>
            </Card>
          )}

          {/* Harvest by category */}
          <Card title="Harvest by Category">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(27,94,69,0.06)' }} />
                <Bar dataKey="harvested" fill="#1B5E45" radius={[4, 4, 0, 0]} name="Harvested" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Top species */}
          <Card title="Top Species">
            <ResponsiveContainer width="100%" height={Math.max(160, topSpecies.length * 40)}>
              <BarChart data={topSpecies} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#797B7E', fontSize: 11, fontFamily: '"Work Sans"' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="harvested" fill="#1B5E45" radius={[0, 4, 4, 0]} name="Harvested" />
                <Bar dataKey="missed" fill="#1B4F6E" radius={[0, 4, 4, 0]} name="Missed" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  )
}
