import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { fetchForecast } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import PaywallModal from '../components/PaywallModal'

interface ForecastDay {
  date: string
  temp_max: number | null
  temp_min: number | null
  weather_code: number
  condition: string
  precipitation: number
  precip_prob: number
  wind_speed: number
  wind_direction: number
  wind_cardinal: string
  pressure_trend: 'falling' | 'steady' | 'rising'
  sunrise: string
  sunset: string
  moon_phase: number
  moon_phase_name: string
  moon_illumination: number
  migration: { score: number; level: 'low' | 'med' | 'high'; factors: string[] }
  timing: TimingInfo
  events: WeatherEvent[]
  hunt_score: number
  factors: string[]
  blind_wind: Array<{ blind_id: string; blind_name: string; level: 'perfect' | 'good'; blind_score: number }>
}

interface TimingInfo {
  score: number
  label: 'Peak' | 'Building' | 'Tapering' | 'Active' | 'Slow'
  source: 'personal' | 'mixed' | 'typical'
  flyway: string
}

interface WeatherEvent {
  type: 'strong_front' | 'cold_front' | 'snow' | 'rain' | 'freeze' | 'storm' | 'open_water' | 'iced'
  label: string
}

interface ForecastLocation {
  location_id: string
  location_name: string
  location_type: string | null
  timing: TimingInfo | null
  days: ForecastDay[]
}

interface BestBet {
  location_id: string
  location_name: string
  location_type: string | null
  date: string
  hunt_score: number
  wind_cardinal: string
  wind_speed: number
  temp_max: number | null
  weather_code: number
  events: WeatherEvent[]
  factors: string[]
}

interface ForecastResponse {
  locations: ForecastLocation[]
  best_bets: BestBet[]
  uses_history: boolean
  history_sample: number
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  'marsh': 'Marsh', 'cut-corn': 'Cut Corn', 'swamp': 'Swamp', 'flooded-timber': 'Flooded Timber',
  'creek': 'Creek', 'river': 'River', 'lakeshore': 'Lakeshore', 'open-water': 'Open Water',
  'coastal': 'Coastal', 'field': 'Field', 'reservoir': 'Reservoir', 'pothole': 'Pothole',
  'beaver-pond': 'Beaver Pond',
}

function wmoCategory(code: number): string {
  if (code <= 1) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'clear'
}

function ConditionIcon({ code, size = 20, className = 'text-ink' }: { code: number; size?: number; className?: string }) {
  const cat = wmoCategory(code)
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className }
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
    <svg {...props}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" fillOpacity={0.12} /></svg>
  )
  if (cat === 'fog') return (
    <svg {...props}><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="5" y1="18" x2="19" y2="18" /></svg>
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
  if (speed <= 5) return '#797B7E'
  if (speed <= 12) return '#1B5E45'
  if (speed <= 20) return '#1B4F6E'
  if (speed <= 30) return '#D97706'
  return '#DC2626'
}

function WindArrow({ direction, speed, size = 18 }: { direction: number; speed: number; size?: number }) {
  const color = windColor(speed)
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ transform: `rotate(${direction}deg)` }}>
      <path d="M11 2 L15 16 L11 13 L7 16 Z" fill={color} />
    </svg>
  )
}

function MoonIcon({ phase, size = 16 }: { phase: number; size?: number }) {
  const r = (size - 2) / 2
  const cx = size / 2
  const cy = size / 2
  const lit = '#D4A94A'
  const shadow = '#3A3C42'
  if (phase < 0.02 || phase > 0.98) return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={shadow} /></svg>
  if (phase > 0.48 && phase < 0.52) return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={lit} /></svg>
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
  return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={shadow} /><path d={litPath} fill={lit} /></svg>
}

const EVENT_STYLE: Record<WeatherEvent['type'], { color: string; bg: string }> = {
  strong_front: { color: '#1B4F6E', bg: '#1B4F6E14' },
  cold_front: { color: '#1B4F6E', bg: '#1B4F6E14' },
  snow: { color: '#3B6E9E', bg: '#3B6E9E14' },
  rain: { color: '#1B5E45', bg: '#1B5E4514' },
  freeze: { color: '#6B7280', bg: '#6B728014' },
  storm: { color: '#B45309', bg: '#B4530914' },
  open_water: { color: '#1B5E45', bg: '#1B5E4514' },
  iced: { color: '#9CA3AF', bg: '#9CA3AF1F' },
}

function EventIcon({ type }: { type: WeatherEvent['type'] }) {
  const p = { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'snow') return (
    <svg {...p}><line x1="12" y1="3" x2="12" y2="21" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /><line x1="18.4" y1="5.6" x2="5.6" y2="18.4" /></svg>
  )
  if (type === 'rain') return (
    <svg {...p}><line x1="8" y1="13" x2="7" y2="20" /><line x1="12" y1="13" x2="11" y2="21" /><line x1="16" y1="13" x2="15" y2="20" /><path d="M19 15a4 4 0 00-1-7.87A6 6 0 006 8.5" /></svg>
  )
  if (type === 'freeze') return (
    <svg {...p}><line x1="12" y1="2" x2="12" y2="22" /><line x1="3" y1="7" x2="21" y2="17" /><line x1="3" y1="17" x2="21" y2="7" /></svg>
  )
  if (type === 'storm') return (
    <svg {...p}><path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor" stroke="none" /></svg>
  )
  if (type === 'open_water') return (
    <svg {...p}><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" fill="currentColor" fillOpacity={0.18} /></svg>
  )
  if (type === 'iced') return (
    <svg {...p}><line x1="12" y1="3" x2="12" y2="21" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /><line x1="18.4" y1="5.6" x2="5.6" y2="18.4" /></svg>
  )
  // cold_front / strong_front — down arrow (falling temps)
  return (
    <svg {...p}><line x1="12" y1="4" x2="12" y2="20" /><polyline points="6 14 12 20 18 14" /></svg>
  )
}

function EventPill({ event }: { event: WeatherEvent }) {
  const s = EVENT_STYLE[event.type]
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <EventIcon type={event.type} />
      {event.label}
    </span>
  )
}

function scoreColor(score: number): string {
  if (score >= 70) return '#1B5E45'
  if (score >= 45) return '#D97706'
  return '#797B7E'
}

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = scoreColor(score)
  const dims = size === 'lg' ? 'w-14 h-14 text-xl' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'
  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-display flex-shrink-0`}
      style={{ color, backgroundColor: `${color}18`, border: `1.5px solid ${color}` }}
    >
      {score}
    </div>
  )
}

function PressureTrend({ trend }: { trend: 'falling' | 'steady' | 'rising' }) {
  if (trend === 'steady') return null
  const falling = trend === 'falling'
  const color = falling ? '#1B5E45' : '#797B7E'
  return (
    <span className="inline-flex items-center gap-0.5" style={{ color }} title={`Barometer ${trend}`}>
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        style={{ transform: falling ? 'none' : 'rotate(180deg)' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </span>
  )
}

const MIG_LABEL = { high: 'High', med: 'Med', low: 'Low' }
const MIG_COLOR = { high: '#1B5E45', med: '#D97706', low: '#797B7E' }

const TIMING_COLOR: Record<TimingInfo['label'], string> = {
  Peak: '#1B5E45', Building: '#1B5E45', Active: '#1B4F6E', Tapering: '#D97706', Slow: '#797B7E',
}
const SOURCE_NOTE: Record<TimingInfo['source'], string> = {
  personal: 'from your logs', mixed: 'your logs + typical', typical: 'typical timing',
}

function TimingChip({ timing }: { timing: TimingInfo }) {
  const color = TIMING_COLOR[timing.label]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ color, backgroundColor: `${color}14` }}
      title={`Migration timing: ${timing.label} — ${SOURCE_NOTE[timing.source]} (${timing.flyway} flyway)`}
    >
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3 8 4-16 3 8h4" />
      </svg>
      {timing.label} migration
    </span>
  )
}

export default function Forecast() {
  const [data, setData] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaywall, setShowPaywall] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { isPro } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isPro) loadForecast()
    else setLoading(false)
  }, [isPro])

  const loadForecast = async () => {
    setLoading(true)
    try {
      const res = await fetchForecast()
      setData(res)
      if (res.locations?.length) setExpanded(res.locations[0].location_id)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const Header = () => (
    <div className="mb-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
        <span className="inline-block w-5 h-px bg-muted/50" />
        7-Day Outlook
      </p>
      <h1 className="font-display text-4xl text-ink tracking-wider leading-none">FORECAST</h1>
    </div>
  )

  if (!isPro) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="forecast" />}
        <Header />
        <button
          onClick={() => setShowPaywall(true)}
          className="w-full relative rounded-xl overflow-hidden border border-hairline"
        >
          <div className="h-56 bg-surface flex flex-col items-center justify-center px-6">
            <svg className="w-6 h-6 text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-ink font-semibold text-sm">Hunt Forecast — Pro</p>
            <p className="text-muted text-xs mt-1 mb-4 text-center max-w-xs">
              7-day scored outlook for every location, migration pressure, moon phase, and best-day picks tuned to your history.
            </p>
            <span className="px-4 py-1.5 bg-ink text-white text-xs font-semibold rounded-lg">Go Pro</span>
          </div>
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
      </div>
    )
  }

  if (!data || data.locations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Header />
        <div className="text-center py-20">
          <p className="text-muted font-semibold">No locations yet.</p>
          <p className="text-muted text-sm mt-1">Add a hunting location to see its forecast.</p>
          <button onClick={() => navigate('/locations')} className="mt-4 px-4 py-2 bg-ink text-white text-xs font-semibold rounded-lg">
            Add Location
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Header />

      {/* Best bets */}
      {data.best_bets.length > 0 && (
        <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Best Bets This Week</p>
            {!data.uses_history && (
              <span className="text-xs text-muted">generic model · {data.history_sample} hunts logged</span>
            )}
          </div>
          <div className="space-y-2.5">
            {data.best_bets.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <ScoreBadge score={b.hunt_score} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {b.location_name}
                    <span className="text-muted font-normal"> · {format(new Date(b.date + 'T12:00:00'), 'EEE, MMM d')}</span>
                  </p>
                  {b.events.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {b.events.map((e, j) => <EventPill key={j} event={e} />)}
                    </div>
                  ) : (
                    <p className="text-xs text-muted truncate">
                      {b.factors.length > 0 ? b.factors.join(' · ') : `${b.wind_cardinal} ${b.wind_speed}mph`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <ConditionIcon code={b.weather_code} size={18} className="text-muted" />
                  <span className="text-xs font-semibold tabular-nums" style={{ color: windColor(b.wind_speed) }}>
                    {b.wind_cardinal} {b.wind_speed}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-location forecast */}
      {data.locations.map(loc => {
        const isOpen = expanded === loc.location_id
        const bestDay = loc.days.reduce<ForecastDay | null>((best, d) => (!best || d.hunt_score > best.hunt_score ? d : best), null)
        return (
          <div key={loc.location_id} className="bg-surface border border-hairline rounded-xl mb-4 overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : loc.location_id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left"
            >
              {loc.location_type && (
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-bg flex-shrink-0">
                  <img
                    src={`/location-types/${loc.location_type}.jpg`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{loc.location_name}</p>
                <p className="text-xs text-muted truncate">
                  {loc.location_type ? LOCATION_TYPE_LABELS[loc.location_type] ?? loc.location_type : 'Location'}
                  {bestDay && bestDay.hunt_score >= 45 && (
                    <> · best {format(new Date(bestDay.date + 'T12:00:00'), 'EEE')}</>
                  )}
                </p>
                {loc.timing && (
                  <div className="mt-1.5">
                    <TimingChip timing={loc.timing} />
                  </div>
                )}
              </div>
              {bestDay && <ScoreBadge score={bestDay.hunt_score} size="sm" />}
              <svg className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="border-t border-hairline divide-y divide-hairline">
                {loc.days.map(day => {
                  const isBest = bestDay?.date === day.date && day.hunt_score >= 45
                  return (
                    <div key={day.date} className={`px-5 py-3 ${isBest ? 'bg-green/[0.04]' : ''}`}>
                      <div className="flex items-center gap-3">
                        {/* Day */}
                        <div className="w-10 flex-shrink-0">
                          <p className="text-xs font-semibold text-ink leading-none">{format(new Date(day.date + 'T12:00:00'), 'EEE')}</p>
                          <p className="text-xs text-muted mt-0.5">{format(new Date(day.date + 'T12:00:00'), 'M/d')}</p>
                        </div>
                        {/* Sky + temp */}
                        <div className="flex items-center gap-2 w-24 flex-shrink-0">
                          <ConditionIcon code={day.weather_code} size={20} className="text-ink" />
                          <div>
                            <p className="text-xs font-semibold text-ink tabular-nums leading-none">
                              {day.temp_max}°<span className="text-muted font-normal">/{day.temp_min}°</span>
                            </p>
                            {day.precip_prob > 20 && (
                              <p className="text-xs text-blue mt-0.5">{day.precip_prob}%</p>
                            )}
                          </div>
                        </div>
                        {/* Wind */}
                        <div className="flex items-center gap-1 w-16 flex-shrink-0">
                          <WindArrow direction={day.wind_direction} speed={day.wind_speed} size={16} />
                          <span className="text-xs font-semibold tabular-nums" style={{ color: windColor(day.wind_speed) }}>
                            {day.wind_cardinal} {day.wind_speed}
                          </span>
                        </div>
                        {/* Moon + pressure */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <MoonIcon phase={day.moon_phase} size={15} />
                          <PressureTrend trend={day.pressure_trend} />
                        </div>
                        {/* Migration */}
                        <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                          <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: MIG_COLOR[day.migration.level] }}
                            title={`Migration: ${day.migration.factors.join(', ') || 'no front'}`}
                          >
                            {MIG_LABEL[day.migration.level]}
                          </span>
                        </div>
                        {/* Score */}
                        <ScoreBadge score={day.hunt_score} size="sm" />
                      </div>

                      {/* Event pills */}
                      {day.events.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-[52px]">
                          {day.events.map((e, i) => <EventPill key={i} event={e} />)}
                        </div>
                      )}

                      {/* Ideal-wind blind badges */}
                      {(day.blind_wind ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-[52px]">
                          {(day.blind_wind ?? []).map((bw, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
                              style={{
                                color: bw.level === 'perfect' ? '#1B5E45' : '#1B4F6E',
                                backgroundColor: bw.level === 'perfect' ? '#1B5E4518' : '#1B4F6E18',
                              }}
                            >
                              {bw.level === 'perfect' ? '★ Perfect wind' : 'Good wind'} — {bw.blind_name} ({bw.blind_score})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="px-5 py-2.5 flex items-center justify-between text-xs text-muted">
                  <span className="uppercase tracking-widest">Migration</span>
                  <span className="uppercase tracking-widest">Hunt Score</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <p className="text-xs text-muted text-center px-6 mt-2">
        Hunt Score blends {data.uses_history ? 'your hunt history, ' : ''}seasonal migration timing,
        cold-front pressure, and conditions. Forecasts beyond ~5 days are less reliable.
      </p>
    </div>
  )
}
