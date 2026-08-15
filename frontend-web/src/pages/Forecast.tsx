import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isToday, isTomorrow } from 'date-fns'
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
  blind_wind: Array<{ blind_id: string; blind_name: string; level: 'perfect' | 'good' }>
}

interface BlindWindMatch {
  blind_id: string
  blind_name: string
  location_name: string
  level: 'perfect' | 'good'
}

interface BlindWindDay {
  date: string
  morning: BlindWindMatch[]
  evening: BlindWindMatch[]
}

interface TimingInfo {
  score: number
  label: 'Peak' | 'Building' | 'Tapering' | 'Active' | 'Slow'
  source: 'personal' | 'mixed' | 'typical'
  flyway: string
  /** What the generic flyway curve alone would have said, so the tooltip can
      show how far this spot's own history moved it rather than just asserting. */
  generic_score: number
  confidence: number
  basis: 'location' | 'overall' | 'generic'
  hunts_here: number
  seasons_here: number
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

interface HistoryStatus {
  hunts_logged: number
  seasons_logged: number
  /** Locations whose own timing curve has taken shape (2+ populated half-months). */
  timing_locations: number
  trim_confidence: number
  trim_sample: number
  trim_max_points: number
  trim_full_hunts: number
}

interface ForecastResponse {
  locations: ForecastLocation[]
  best_bets: BestBet[]
  uses_history: boolean
  history_sample: number
  history: HistoryStatus
  blind_wind_by_day: BlindWindDay[]
  // Free accounts only. The server has already trimmed the payload to one
  // location and two days by the time these arrive — they describe what was
  // withheld so the screen can name it.
  tier?: 'free' | 'pro'
  free_days?: number
  locked_days?: number
  locked_locations?: number
  location_choices?: Array<{ id: string; name: string }>
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
  // `direction` is the meteorological "from" bearing (e.g. 45° = a NE wind,
  // meaning wind blowing FROM the NE). Rotate 180° past that so the tip points
  // toward where the wind is actually flowing TO, matching the ideal-wind
  // compass picker's convention instead of pointing back at the source.
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ transform: `rotate(${direction + 180}deg)` }}>
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
  let shadowPath: string
  if (waxing) {
    const sweep2 = phase > 0.25 ? 0 : 1
    shadowPath = `M ${top} A ${r},${r} 0 0,1 ${bottom} A ${termRx},${r} 0 0,${sweep2} ${top} Z`
  } else {
    const sweep2 = phase < 0.75 ? 1 : 0
    shadowPath = `M ${top} A ${r},${r} 0 0,0 ${bottom} A ${termRx},${r} 0 0,${sweep2} ${top} Z`
  }
  return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill={lit} /><path d={shadowPath} fill={shadow} /></svg>
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

function BlindWindPill({ match }: { match: BlindWindMatch }) {
  const perfect = match.level === 'perfect'
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
      style={{ color: perfect ? '#1B5E45' : '#1B4F6E', backgroundColor: perfect ? '#1B5E4518' : '#1B4F6E18' }}
    >
      {perfect && '★ '}{match.blind_name} <span className="font-normal opacity-70">· {match.location_name}</span>
    </span>
  )
}

// Score bands, one base colour each. Measured over 2,604 real in-season days,
// 90+ lands on ~1.6% of them (about once a season per spot) and 70+ on ~11%
// (roughly weekly), so the two solid treatments are genuinely scarce.
//
// The top two bands render solid — colour fill, white numeral, near-white rim.
// The lower two invert to a tint of the same colour with a matching rim and
// numeral, reading as present but clearly a step down from "go". `${colour}18`
// over white lands almost exactly on #FAF3EB for the orange, which is where the
// intended cream comes from.
const BADGE_RIM = '#EFF2F1'   // near-white rim on the solid bands

const SCORE_BANDS = [
  { min: 90, color: '#305D47', solid: true  },   // green  — the once-a-season day
  { min: 70, color: '#406984', solid: true  },   // blue   — worth going
  { min: 50, color: '#CC7C2E', solid: false },   // orange — inverted, a step down
  { min: 0,  color: '#797B7E', solid: false },   // muted  — stay home
] as const

function scoreBand(score: number) {
  return SCORE_BANDS.find(b => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]
}

// Reads straight off SCORE_BANDS so the key can never drift from the badges.
const BAND_LABELS = ['drop everything', 'head for the blind', 'could go either way', 'stay home'] as const

function ScoreKey() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
      {SCORE_BANDS.map((band, i) => (
        <div key={band.min} className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={band.solid
              ? { backgroundColor: band.color }
              : { backgroundColor: `${band.color}30`, border: `1.5px solid ${band.color}` }}
          />
          <span className="text-xs text-muted leading-tight">
            <span className="font-semibold text-ink">
              {band.min === 0 ? 'Under 50' : `${band.min}+`}
            </span>{' '}
            {BAND_LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** How far the hunter's own logs have got, in their words rather than ours.
 *
 * Every label here was internal model vocabulary first — "migration timing",
 * "weather trim" — and none of it survived contact with a reader. A hunter does
 * not need the names of the two channels; they need to know what the app has
 * worked out about them, and what would teach it more. So each row says the
 * thing it knows, and the caption says what unlocks the rest.
 */
function HistoryPanel({ h, spots }: { h: HistoryStatus; spots: number }) {
  const seasons = h.seasons_logged
  const trimPts = (h.trim_max_points * h.trim_confidence) / 100
  const rows = [
    {
      label: 'When your spots turn on',
      value: spots > 0 ? `${h.timing_locations} of ${spots}` : '—',
      pct: spots > 0 ? (h.timing_locations / spots) * 100 : 0,
      note: 'Which stretch of the season actually holds birds at each place. '
          + 'A spot needs hunts in two different months before it can tell.',
    },
    {
      label: 'How far your results move a score',
      value: `±${trimPts.toFixed(1)} of ±${h.trim_max_points}`,
      pct: h.trim_confidence,
      note: `Points added or taken off a day's Hunt Score when the weather matches what has `
          + `worked for you. Reaches the full ±${h.trim_max_points} at ${h.trim_full_hunts} hunts.`,
    },
  ]
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5 mt-4">
      {/* Wraps rather than squeezing: on a narrow screen the count drops to its
          own line instead of forcing the title to break mid-phrase. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest">Learned from your hunts</p>
        <p className="text-xs text-muted whitespace-nowrap">
          {h.hunts_logged} hunt{h.hunts_logged === 1 ? '' : 's'}
          {seasons > 0 && ` · ${seasons} season${seasons === 1 ? '' : 's'}`}
        </p>
      </div>
      <p className="text-xs text-muted leading-snug mb-4">
        Everything else in your forecast is the same duck-behaviour model everyone gets.
        These two are the parts built from your own logs.
      </p>
      <div className="space-y-3.5 mb-3">
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-ink">{r.label}</span>
              <span className="text-xs text-muted tabular-nums whitespace-nowrap">{r.value}</span>
            </div>
            <div className="h-1 mt-1.5 rounded-full bg-hairline overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, backgroundColor: '#1B5E45' }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">{r.note}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted leading-snug border-t border-hairline pt-3">
        {seasons < 2
          ? 'One season can only count for so much — a good November might be the spot, or might be that '
            + 'November. Hunt the same weeks again next year and your logs start carrying real weight.'
          : 'Your logs now set when each spot peaks. The weather adjustment stays capped, so it breaks '
            + 'ties between similar days without rearranging your week.'}
      </p>
    </div>
  )
}

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase text-muted whitespace-nowrap" style={{ letterSpacing: '0.02em' }}>
      {children}
    </span>
  )
}

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const band = scoreBand(score)
  const dims = size === 'lg' ? 'w-14 h-14 text-xl' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'
  return (
    <div
      className={`${dims} rounded-full flex items-center justify-center font-display flex-shrink-0`}
      style={band.solid
        ? { color: '#FFFFFF', backgroundColor: band.color, border: `1.5px solid ${BADGE_RIM}` }
        : { color: band.color, backgroundColor: `${band.color}18`, border: `1.5px solid ${band.color}` }}
    >
      {score}
    </div>
  )
}

// Mobile: data columns flex to fill the row. Desktop (md+): day/weather stay
// left-anchored, the icon columns stay right-anchored (trailing 1.75rem matches
// the score-badge-to-chevron offset in the collapsed header row above, so the
// Score column lines up under it), and the gap between them is what collapses.
const DAY_ROW_GRID = 'grid gap-1.5 items-center grid-cols-[2.5rem_7rem_1fr_1fr_1fr_1fr] md:grid-cols-[2.5rem_7rem_minmax(1rem,1fr)_repeat(4,minmax(3rem,3.75rem))_0.625rem]' as const

const TIMING_COLOR: Record<TimingInfo['label'], string> = {
  Peak: '#1B5E45', Building: '#1B5E45', Active: '#1B4F6E', Tapering: '#D97706', Slow: '#797B7E',
}
const SOURCE_NOTE: Record<TimingInfo['source'], string> = {
  personal: 'from your logs', mixed: 'your logs + typical', typical: 'typical timing',
}

/** Spell out what actually backs this number. A timing score that leans on the
    hunter's own logs should say how many hunts and how many seasons stand
    behind it — the same figure means something different at 2 hunts than at 30,
    and hiding that is how a model earns undeserved trust. */
function timingTitle(timing: TimingInfo): string {
  const head = `Migration timing: ${timing.label} — ${SOURCE_NOTE[timing.source]} (${timing.flyway} flyway)`
  if (timing.basis === 'generic') return head
  const moved = timing.score - timing.generic_score
  const shift = moved === 0 ? 'matching typical timing'
    : `${moved > 0 ? '+' : ''}${moved} vs typical (${timing.generic_score})`
  if (timing.basis === 'overall') return `${head}\nBased on your other spots — ${shift}`
  const seasons = `${timing.seasons_here} season${timing.seasons_here === 1 ? '' : 's'}`
  const cap = timing.seasons_here < 2 ? ' · a second season here unlocks full trust' : ''
  return `${head}\n${timing.hunts_here} hunts here across ${seasons} · ${timing.confidence}% weight — ${shift}${cap}`
}

function TimingChip({ timing }: { timing: TimingInfo }) {
  const color = TIMING_COLOR[timing.label]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ color, backgroundColor: `${color}14` }}
      title={timingTitle(timing)}
    >
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h4l3 8 4-16 3 8h4" />
      </svg>
      {timing.label} migration
    </span>
  )
}

/** Point on the dial's semicircle for a 0-100 value: 0=left (season start), 50=top (peak), 100=right (tapered off). */
function dialPoint(cx: number, cy: number, r: number, valuePercent: number) {
  const angleRad = ((180 - 1.8 * valuePercent) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) }
}

function MigrationDial({ timing, size = 'md' }: { timing: TimingInfo; size?: 'sm' | 'md' }) {
  const scale = size === 'sm' ? 0.65 : 1
  const cx = 27 * scale, cy = 27 * scale, r = 20 * scale
  const svgW = 54 * scale, svgH = 30 * scale
  const value = Math.max(0, Math.min(100, timing.score))
  const color = TIMING_COLOR[timing.label]
  const start = dialPoint(cx, cy, r, 0)
  const end = dialPoint(cx, cy, r, 100)
  const needle = dialPoint(cx, cy, r, value)
  return (
    <div
      className="flex flex-col items-center flex-shrink-0"
      title={timingTitle(timing)}
    >
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <path d={`M${start.x} ${start.y} A${r} ${r} 0 0 1 ${end.x} ${end.y}`} fill="none" stroke="#E4E5E3" strokeWidth={5 * scale} strokeLinecap="round" />
        <path d={`M${start.x} ${start.y} A${r} ${r} 0 0 1 ${needle.x} ${needle.y}`} fill="none" stroke={color} strokeWidth={5 * scale} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={color} strokeWidth={2 * scale} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.2 * scale} fill={color} />
      </svg>
    </div>
  )
}

/** The free tier's day card.
 *
 * Deliberately not the Pro table row. Free gets two days, so they can be shown
 * large with the reasoning spelled out — the explanation is what proves there's
 * a real model behind the number, and a bare score is something nobody has any
 * reason to trust. What free withholds is the rest of the week, not the why.
 */
function FreeDayCard({ day }: { day: ForecastDay }) {
  const d = new Date(day.date + 'T12:00:00')
  const label = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE')
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5 mb-3">
      <div className="flex items-center gap-4">
        <ScoreBadge score={day.hunt_score} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">
            {label}
            <span className="text-muted font-normal"> · {format(d, 'MMM d')}</span>
          </p>
          <div className="flex items-center gap-x-3 gap-y-1.5 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1.5">
              <ConditionIcon code={day.weather_code} size={15} className="text-muted" />
              <span className="text-xs text-muted">{day.condition}</span>
            </span>
            {day.temp_max !== null && (
              <span className="text-xs text-muted tabular-nums">
                {Math.round(day.temp_max)}°{day.temp_min !== null && ` / ${Math.round(day.temp_min)}°`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <WindArrow direction={day.wind_direction} speed={day.wind_speed} size={14} />
              <span className="text-xs font-semibold tabular-nums" style={{ color: windColor(day.wind_speed) }}>
                {day.wind_cardinal} {day.wind_speed}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <MoonIcon phase={day.moon_phase} size={13} />
              <span className="text-xs text-muted">{day.moon_phase_name}</span>
            </span>
          </div>
        </div>
      </div>

      {(day.events.length > 0 || day.factors.length > 0) && (
        <div className="mt-4 pt-4 border-t border-hairline">
          {day.events.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {day.events.map((e, i) => <EventPill key={i} event={e} />)}
            </div>
          )}
          {day.factors.length > 0 && (
            <p className="text-xs text-muted leading-relaxed">
              <span className="font-semibold text-ink">Why this score: </span>
              {day.factors.join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** What Pro adds to the forecast, named rather than teased. */
function LockedForecast({ lockedDays, lockedLocations, onClick }: {
  lockedDays: number; lockedLocations: number; onClick: () => void
}) {
  const items = [
    lockedDays > 0 ? `The other ${lockedDays} days of the week` : 'The full seven-day outlook',
    lockedLocations > 0
      ? `Your other ${lockedLocations} location${lockedLocations === 1 ? '' : 's'}, scored the same way`
      : 'Every location you add, scored the same way',
    'Best bets — your top-scoring days ranked across every spot',
    'Per-blind wind matching for morning and evening sits',
  ]
  return (
    <button onClick={onClick} className="w-full text-left bg-surface border border-hairline rounded-xl p-5 hover:border-ink transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-xs font-semibold text-muted uppercase tracking-widest">The rest of the week — Pro</p>
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

export default function Forecast() {
  const [data, setData] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaywall, setShowPaywall] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Free accounts see one location at a time and can switch which one.
  const [freeLocationId, setFreeLocationId] = useState<string | null>(null)
  const { isPro } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { loadForecast() }, [isPro, freeLocationId])

  const loadForecast = async () => {
    setLoading(true)
    try {
      const res = await fetchForecast(freeLocationId ?? undefined)
      setData(res)
      if (res.locations?.length) setExpanded(res.locations[0].location_id)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const Header = ({ kicker = '7-Day Outlook' }: { kicker?: string }) => (
    <div className="mb-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
        <span className="inline-block w-5 h-px bg-muted/50" />
        {kicker}
      </p>
      <h1 className="font-display text-4xl text-ink tracking-wider leading-none">FORECAST</h1>
    </div>
  )

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
        <Header kicker={isPro ? '7-Day Outlook' : 'Next 2 Days'} />
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

  // Free: two real days for one spot, reasoning intact. The server has already
  // trimmed the payload, so there is nothing here to hide — what's missing is
  // genuinely absent from the response rather than concealed by the client.
  if (!isPro) {
    const loc = data.locations[0]
    const choices = data.location_choices ?? []
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="forecast" />}
        <Header kicker="Next 2 Days" />

        {choices.length > 1 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {choices.map(c => (
              <button
                key={c.id}
                onClick={() => setFreeLocationId(c.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                  c.id === loc.location_id
                    ? 'bg-ink text-white border-ink'
                    : 'bg-surface text-muted border-hairline hover:border-ink hover:text-ink'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{loc.location_name}</p>
            <p className="text-xs text-muted truncate">
              {loc.location_type ? LOCATION_TYPE_LABELS[loc.location_type] ?? loc.location_type : 'Location'}
            </p>
          </div>
          {loc.timing && <TimingChip timing={loc.timing} />}
        </div>

        {loc.days.map(day => <FreeDayCard key={day.date} day={day} />)}

        {/* What the score means — stays here, next to the scores it explains. */}
        <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Hunt Score</p>
          <p className="text-sm text-ink leading-relaxed mb-4">
            Each day gets a Hunt Score out of 100, built from
            {data.uses_history ? ' your hunt history,' : ''} seasonal migration timing,
            cold-front pressure, freeze timing, and weather conditions.
          </p>
          <ScoreKey />
          {data.history && data.history.hunts_logged === 0 && (
            <p className="text-xs text-muted mt-3 leading-snug">
              Running on the baseline model so far — no hunts logged yet. Log your hunts and
              the score starts learning when your own spots turn on.
            </p>
          )}
        </div>

        <LockedForecast
          lockedDays={data.locked_days ?? 5}
          lockedLocations={data.locked_locations ?? 0}
          onClick={() => setShowPaywall(true)}
        />

        {/* Progress, not reference — last, because it is the least urgent thing
            on the screen and it was pushing the forecast down from the top. */}
        {data.history && data.history.hunts_logged > 0 && (
          <HistoryPanel h={data.history} spots={data.locations.length + (data.locked_locations ?? 0)} />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Header />

      {/* What the score is and how to read it. Belongs up here: it is the legend
          for every number below, and it is read once and then skipped. */}
      <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Hunt Score</p>
        <p className="text-sm text-ink leading-relaxed mb-4">
          Every day, each of your locations gets a Hunt Score out of 100, built from
          {data.uses_history ? ' your hunt history,' : ''} seasonal migration timing,
          cold-front pressure, freeze timing, and weather conditions.
        </p>
        <ScoreKey />
      </div>

      {/* Best bets */}
      {data.best_bets.length > 0 && (
        <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Best Bets This Week</p>
            {!data.uses_history && (
              <span className="text-xs text-muted">baseline model · no hunts logged yet</span>
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
                <div className="px-5 py-1.5">
                  <div className={DAY_ROW_GRID}>
                    <div />
                    <div />
                    <div className="hidden md:block" />
                    <div className="flex justify-center min-w-0"><ColHeader>Wind</ColHeader></div>
                    <div className="flex justify-center min-w-0"><ColHeader>Moon</ColHeader></div>
                    <div className="flex justify-center min-w-0"><ColHeader>Migr.</ColHeader></div>
                    <div className="flex justify-center min-w-0"><ColHeader>Score</ColHeader></div>
                    <div className="hidden md:block" />
                  </div>
                </div>
                {loc.days.map(day => {
                  const isBest = bestDay?.date === day.date && day.hunt_score >= 45
                  return (
                    <div key={day.date} className={`px-5 py-3 ${isBest ? 'bg-green/[0.04]' : ''}`}>
                      <div className={DAY_ROW_GRID}>
                        {/* Day */}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink leading-none">{format(new Date(day.date + 'T12:00:00'), 'EEE')}</p>
                          <p className="text-xs text-muted mt-0.5">{format(new Date(day.date + 'T12:00:00'), 'M/d')}</p>
                        </div>
                        {/* Sky + temp */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ConditionIcon code={day.weather_code} size={18} className="text-ink flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink tabular-nums leading-none whitespace-nowrap">
                              {day.temp_max}°<span className="text-muted font-normal">/{day.temp_min}°</span>
                            </p>
                            {day.precip_prob > 20 && (
                              <p className="text-xs text-blue mt-0.5">{day.precip_prob}%</p>
                            )}
                          </div>
                        </div>
                        <div className="hidden md:block" />
                        {/* Wind */}
                        <div className="flex flex-col items-center justify-center min-w-0">
                          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                            <WindArrow direction={day.wind_direction} speed={day.wind_speed} size={16} />
                          </div>
                          <span className="text-xs font-semibold leading-tight" style={{ color: windColor(day.wind_speed) }}>{day.wind_cardinal}</span>
                          <span className="text-xs font-semibold tabular-nums leading-tight" style={{ color: windColor(day.wind_speed) }}>{day.wind_speed}</span>
                        </div>
                        {/* Moon */}
                        <div className="flex items-center justify-center min-w-0">
                          <MoonIcon phase={day.moon_phase} size={15} />
                        </div>
                        {/* Migration */}
                        <div className="flex items-center justify-center min-w-0">
                          <MigrationDial timing={day.timing} size="sm" />
                        </div>
                        {/* Score */}
                        <div className="flex items-center justify-center min-w-0">
                          <ScoreBadge score={day.hunt_score} size="sm" />
                        </div>
                        <div className="hidden md:block" />
                      </div>

                      {/* Event pills */}
                      {day.events.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-12">
                          {day.events.map((e, i) => <EventPill key={i} event={e} />)}
                        </div>
                      )}

                      {/* Ideal-wind blind badges */}
                      {(day.blind_wind ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-12">
                          {(day.blind_wind ?? []).map((bw, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
                              style={{
                                color: bw.level === 'perfect' ? '#1B5E45' : '#1B4F6E',
                                backgroundColor: bw.level === 'perfect' ? '#1B5E4518' : '#1B4F6E18',
                              }}
                            >
                              {bw.level === 'perfect' ? '★ Perfect wind' : 'Good wind'} — {bw.blind_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Best blinds for wind, across all locations, by day/time-of-day */}
      {(data.blind_wind_by_day ?? []).some(d => d.morning.length > 0 || d.evening.length > 0) && (
        <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">Best Blinds for Wind</p>
          <div className="space-y-3">
            {(data.blind_wind_by_day ?? [])
              .filter(d => d.morning.length > 0 || d.evening.length > 0)
              .map(d => (
                <div key={d.date} className="flex items-start gap-3">
                  <div className="w-12 flex-shrink-0">
                    <p className="text-xs font-semibold text-ink leading-none">{format(new Date(d.date + 'T12:00:00'), 'EEE')}</p>
                    <p className="text-xs text-muted mt-0.5">{format(new Date(d.date + 'T12:00:00'), 'M/d')}</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {d.morning.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-muted uppercase w-7 flex-shrink-0">AM</span>
                        {d.morning.map((m, i) => <BlindWindPill key={i} match={m} />)}
                      </div>
                    )}
                    {d.evening.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-muted uppercase w-7 flex-shrink-0">PM</span>
                        {d.evening.map((m, i) => <BlindWindPill key={i} match={m} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Progress, not reference — last, because it is the least urgent thing on
          the screen and it was pushing the actual forecast down from the top. */}
      {data.history && data.history.hunts_logged > 0 && (
        <HistoryPanel h={data.history} spots={data.locations.length} />
      )}

      <p className="text-xs text-muted text-center px-6 mt-4">
        Forecasts beyond ~5 days are less reliable.
      </p>
    </div>
  )
}
