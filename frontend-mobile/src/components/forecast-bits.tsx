import { Platform, Text, View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polyline, Line } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, type, space, radius } from '@/constants/theme';

/* Shared forecast furniture, ported from frontend-web/src/pages/Forecast.tsx.
 * Every colour, threshold and label below is the web app's — they encode
 * measured score distributions and a scoring model, not taste. */

export interface TimingInfo {
  score: number;
  label: 'Peak' | 'Building' | 'Tapering' | 'Active' | 'Slow';
  source: 'personal' | 'mixed' | 'typical';
  flyway: string;
  generic_score: number;
  confidence: number;
  basis: 'location' | 'overall' | 'generic';
  hunts_here: number;
  seasons_here: number;
}

export interface WeatherEvent {
  type: 'strong_front' | 'cold_front' | 'snow' | 'rain' | 'freeze' | 'storm' | 'open_water' | 'iced';
  label: string;
}

export interface ForecastDay {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  weather_code: number;
  condition: string;
  precipitation: number;
  precip_prob: number;
  wind_speed: number;
  wind_direction: number;
  wind_cardinal: string;
  pressure_trend: 'falling' | 'steady' | 'rising';
  sunrise: string;
  sunset: string;
  moon_phase: number;
  moon_phase_name: string;
  moon_illumination: number;
  migration: { score: number; level: 'low' | 'med' | 'high'; factors: string[] };
  timing: TimingInfo;
  events: WeatherEvent[];
  hunt_score: number;
  factors: string[];
  blind_wind: Array<{ blind_id: string; blind_name: string; level: 'perfect' | 'good' }>;
}

export interface ForecastLocation {
  location_id: string;
  location_name: string;
  location_type: string | null;
  timing: TimingInfo | null;
  days: ForecastDay[];
}

export interface BestBet {
  location_id: string;
  location_name: string;
  location_type: string | null;
  date: string;
  hunt_score: number;
  wind_cardinal: string;
  wind_speed: number;
  temp_max: number | null;
  weather_code: number;
  events: WeatherEvent[];
  factors: string[];
}

export interface HistoryStatus {
  hunts_logged: number;
  seasons_logged: number;
  timing_locations: number;
  trim_confidence: number;
  trim_sample: number;
  trim_max_points: number;
  trim_full_hunts: number;
}

export interface ForecastResponse {
  locations: ForecastLocation[];
  best_bets: BestBet[];
  uses_history: boolean;
  history_sample: number;
  history: HistoryStatus;
  blind_wind_by_day: Array<{
    date: string;
    morning: Array<{ blind_id: string; blind_name: string; location_name: string; level: 'perfect' | 'good' }>;
    evening: Array<{ blind_id: string; blind_name: string; location_name: string; level: 'perfect' | 'good' }>;
  }>;
  tier?: 'free' | 'pro';
  free_days?: number;
  locked_days?: number;
  locked_locations?: number;
  location_choices?: Array<{ id: string; name: string }>;
}

/* Score bands, one base colour each. Measured over 2,604 real in-season days:
 * 90+ lands on ~1.6% of them (about once a season per spot) and 70+ on ~11%
 * (roughly weekly), so the two solid treatments are genuinely scarce. The lower
 * two invert to a tint — present, but clearly a step down from "go". */
const BADGE_RIM = '#EFF2F1';

export const SCORE_BANDS = [
  { min: 90, color: '#305D47', solid: true },
  { min: 70, color: '#406984', solid: true },
  { min: 50, color: '#CC7C2E', solid: false },
  { min: 0, color: '#797B7E', solid: false },
] as const;

export const BAND_LABELS = [
  'drop everything',
  'head for the blind',
  'could go either way',
  'stay home',
] as const;

export const scoreBand = (score: number) =>
  SCORE_BANDS.find(b => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];

export const windColor = (speed: number): string => {
  if (speed <= 5) return '#797B7E';
  if (speed <= 12) return '#1B5E45';
  if (speed <= 20) return '#1B4F6E';
  if (speed <= 30) return '#D97706';
  return '#DC2626';
};

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const band = scoreBand(score);
  const dim = size === 'lg' ? 56 : size === 'sm' ? 36 : 44;
  const font = size === 'lg' ? 24 : size === 'sm' ? 14 : 18;
  return (
    <View
      style={[
        styles.badge,
        { width: dim, height: dim, borderRadius: dim / 2 },
        band.solid
          ? { backgroundColor: band.color, borderColor: BADGE_RIM }
          : { backgroundColor: `${band.color}18`, borderColor: band.color },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { fontSize: font, color: band.solid ? '#FFFFFF' : band.color },
        ]}
      >
        {score}
      </Text>
    </View>
  );
}

export function ScoreKey() {
  return (
    <View style={styles.keyWrap}>
      {SCORE_BANDS.map((band, i) => (
        <View key={band.min} style={styles.keyRow}>
          <View
            style={[
              styles.keyDot,
              band.solid
                ? { backgroundColor: band.color }
                : { backgroundColor: `${band.color}30`, borderWidth: 1.5, borderColor: band.color },
            ]}
          />
          <Text style={styles.keyText}>
            <Text style={styles.keyStrong}>{band.min === 0 ? 'Under 50' : `${band.min}+`}</Text>
            {` ${BAND_LABELS[i]}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* `direction` is the meteorological "from" bearing, so the arrow is rotated 180°
 * past it to point where the wind is actually flowing TO. Reversing this would
 * quietly tell a hunter to sit the wrong side of a blind. */
export function WindArrow({
  direction,
  speed,
  size = 18,
}: {
  direction: number;
  speed: number;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" style={{ transform: [{ rotate: `${direction + 180}deg` }] }}>
      <Path d="M11 2 L15 16 L11 13 L7 16 Z" fill={windColor(speed)} />
    </Svg>
  );
}

/* The true terminator curve, ported arc-for-arc from the web app rather than
 * approximated — react-native-svg supports elliptical arcs, so there is no
 * reason to fake it. */
export function MoonIcon({ phase, size = 16 }: { phase: number; size?: number }) {
  const r = (size - 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const lit = '#D4A94A';
  const shadow = '#3A3C42';

  if (phase < 0.02 || phase > 0.98) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill={shadow} />
      </Svg>
    );
  }
  if (phase > 0.48 && phase < 0.52) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill={lit} />
      </Svg>
    );
  }

  const waxing = phase < 0.5;
  const termRx = Math.abs(Math.cos(Math.PI * 2 * phase)) * r;
  const top = `${cx},${cy - r}`;
  const bottom = `${cx},${cy + r}`;
  const shadowPath = waxing
    ? `M ${top} A ${r},${r} 0 0,1 ${bottom} A ${termRx},${r} 0 0,${phase > 0.25 ? 0 : 1} ${top} Z`
    : `M ${top} A ${r},${r} 0 0,0 ${bottom} A ${termRx},${r} 0 0,${phase < 0.75 ? 1 : 0} ${top} Z`;

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill={lit} />
      <Path d={shadowPath} fill={shadow} />
    </Svg>
  );
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
};

function EventGlyph({ type, color }: { type: WeatherEvent['type']; color: string }) {
  const common = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'snow' || type === 'iced') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Line x1="12" y1="3" x2="12" y2="21" {...common} />
        <Line x1="3" y1="12" x2="21" y2="12" {...common} />
        <Line x1="5.6" y1="5.6" x2="18.4" y2="18.4" {...common} />
        <Line x1="18.4" y1="5.6" x2="5.6" y2="18.4" {...common} />
      </Svg>
    );
  }
  if (type === 'rain') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Line x1="8" y1="13" x2="7" y2="20" {...common} />
        <Line x1="12" y1="13" x2="11" y2="21" {...common} />
        <Line x1="16" y1="13" x2="15" y2="20" {...common} />
        <Path d="M19 15a4 4 0 00-1-7.87A6 6 0 006 8.5" fill="none" {...common} />
      </Svg>
    );
  }
  if (type === 'freeze') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Line x1="12" y1="2" x2="12" y2="22" {...common} />
        <Line x1="3" y1="7" x2="21" y2="17" {...common} />
        <Line x1="3" y1="17" x2="21" y2="7" {...common} />
      </Svg>
    );
  }
  if (type === 'storm') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Path d="M13 3L5 14h6l-1 7 8-11h-6z" fill={color} />
      </Svg>
    );
  }
  if (type === 'open_water') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" fill={color} fillOpacity={0.18} {...common} />
      </Svg>
    );
  }
  // cold_front / strong_front — a down arrow for falling temperatures.
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Line x1="12" y1="4" x2="12" y2="20" {...common} />
      <Polyline points="6 14 12 20 18 14" fill="none" {...common} />
    </Svg>
  );
}

export function EventPill({ event }: { event: WeatherEvent }) {
  const s = EVENT_STYLE[event.type];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <EventGlyph type={event.type} color={s.color} />
      <Text style={[styles.pillText, { color: s.color }]}>{event.label}</Text>
    </View>
  );
}

export function BlindWindPill({
  match,
}: {
  match: { blind_name: string; location_name: string; level: 'perfect' | 'good' };
}) {
  const perfect = match.level === 'perfect';
  const color = perfect ? '#1B5E45' : '#1B4F6E';
  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.pillText, { color }]}>
        {perfect ? '★ ' : ''}
        {match.blind_name}
        <Text style={styles.pillMuted}> · {match.location_name}</Text>
      </Text>
    </View>
  );
}

const TIMING_COLOR: Record<TimingInfo['label'], string> = {
  Peak: '#1B5E45',
  Building: '#1B5E45',
  Active: '#1B4F6E',
  Tapering: '#D97706',
  Slow: '#797B7E',
};

export function TimingChip({ timing }: { timing: TimingInfo }) {
  const color = TIMING_COLOR[timing.label];
  return (
    <View style={[styles.timingChip, { backgroundColor: `${color}14` }]}>
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Path
          d="M3 12h4l3 8 4-16 3 8h4"
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.pillText, { color }]}>{timing.label} migration</Text>
    </View>
  );
}

export function LockIcon({ size = 15 }: { size?: number }) {
  return Platform.OS === 'ios' ? (
    <SymbolView name="lock" tintColor={colors.textMuted} size={size} />
  ) : (
    <Ionicons name="lock-closed-outline" size={size + 2} color={colors.textMuted} />
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  badgeText: { fontFamily: 'BebasNeue_400Regular' },

  keyWrap: { gap: space.sm },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  keyDot: { width: 10, height: 10, borderRadius: 5 },
  keyText: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, flex: 1 },
  keyStrong: { fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pillText: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold' },
  pillMuted: { fontFamily: 'WorkSans_400Regular', opacity: 0.7 },

  timingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});

/* Same moon, keyed by phase name instead of a number — the statistics endpoint
 * buckets hunts by name, not by fraction. Map copied from Stats.tsx. */
const PHASE_BY_NAME: Record<string, number> = {
  'New Moon': 0,
  'Waxing Crescent': 0.125,
  'First Quarter': 0.25,
  'Waxing Gibbous': 0.375,
  'Full Moon': 0.5,
  'Waning Gibbous': 0.625,
  'Last Quarter': 0.75,
  'Waning Crescent': 0.875,
};

export function MoonIconByName({ name, size = 16 }: { name: string; size?: number }) {
  return <MoonIcon phase={PHASE_BY_NAME[name] ?? 0} size={size} />;
}
