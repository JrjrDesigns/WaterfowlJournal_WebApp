import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format, isToday, isTomorrow } from 'date-fns';

import { ConditionIcon } from '@/components/condition-icon';
import {
  BlindWindPill,
  EventPill,
  LockIcon,
  MoonIcon,
  ScoreBadge,
  ScoreKey,
  TimingChip,
  WindArrow,
  windColor,
  type ForecastDay,
  type ForecastLocation,
  type ForecastResponse,
} from '@/components/forecast-bits';
import { PaywallModal } from '@/components/paywall-modal';
import { ErrorBanner } from '@/components/ui';
import { useAuth } from '@/contexts/auth';
import { fetchForecast } from '@/utils/api';
import { locationTypeImage, locationTypeLabel } from '@/constants/domain';
import { colors, type, space, radius } from '@/constants/theme';

export default function Forecast() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Free accounts see one location at a time and can switch which one.
  const [freeLocationId, setFreeLocationId] = useState<string | null>(null);

  const { isPro } = useAuth();
  const router = useRouter();

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      setError('');
      try {
        const res: ForecastResponse = await fetchForecast(freeLocationId ?? undefined);
        setData(res);
        if (res.locations?.length) setExpanded(res.locations[0].location_id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load the forecast.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [freeLocationId],
  );

  /* Refetch on focus, not on an interval. The forecast is a shared, rate-limited
   * upstream — a screen that polls would burn the quota for every user at once. */
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = (kicker: string) => (
    <View style={styles.headerBlock}>
      <View style={styles.eyebrowRow}>
        <View style={styles.rule} />
        <Text style={styles.eyebrow}>{kicker.toUpperCase()}</Text>
      </View>
      <Text style={styles.title}>FORECAST</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  if (!data || data.locations.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {header(isPro ? '7-Day Outlook' : 'Next 2 Days')}
          <ErrorBanner message={error} />
          {!error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No locations yet.</Text>
              <Text style={styles.emptyBody}>Add a hunting location to see its forecast.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(tabs)/locations')}
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.emptyBtnText}>Add Location</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* Free: two real days for one spot, reasoning intact. The server has already
   * trimmed the payload, so there is nothing here to hide — what's missing is
   * genuinely absent from the response rather than concealed by the client. */
  if (!isPro) {
    const loc = data.locations[0];
    const choices = data.location_choices ?? [];

    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
        >
          {header('Next 2 Days')}
          <ErrorBanner message={error} />

          {choices.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {choices.map(c => {
                const on = c.id === loc.location_id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFreeLocationId(c.id)}
                    style={[styles.choicePill, on && styles.choicePillOn]}
                  >
                    <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.locHead}>
            <View style={styles.grow}>
              <Text style={styles.locName} numberOfLines={1}>{loc.location_name}</Text>
              <Text style={styles.locType} numberOfLines={1}>
                {loc.location_type ? locationTypeLabel(loc.location_type) : 'Location'}
              </Text>
            </View>
            {loc.timing ? <TimingChip timing={loc.timing} /> : null}
          </View>

          {loc.days.map(day => <FreeDayCard key={day.date} day={day} />)}

          {/* What the score means — next to the scores it explains. */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>HUNT SCORE</Text>
            <Text style={styles.cardBody}>
              Each day gets a Hunt Score out of 100, built from
              {data.uses_history ? ' your hunt history,' : ''} seasonal migration timing,
              cold-front pressure, freeze timing, and weather conditions.
            </Text>
            <ScoreKey />
            {data.history && data.history.hunts_logged === 0 ? (
              <Text style={styles.footnote}>
                Running on the baseline model so far — no hunts logged yet. Log your hunts and the
                score starts learning when your own spots turn on.
              </Text>
            ) : null}
          </View>

          <LockedForecast
            lockedDays={data.locked_days ?? 5}
            lockedLocations={data.locked_locations ?? 0}
            onPress={() => setPaywall(true)}
          />

          {data.history && data.history.hunts_logged > 0 ? (
            <HistoryPanel
              h={data.history}
              spots={data.locations.length + (data.locked_locations ?? 0)}
            />
          ) : null}
        </ScrollView>

        <PaywallModal visible={paywall} reason="forecast" onClose={() => setPaywall(false)} />
      </SafeAreaView>
    );
  }

  // Pro: every location, every day.
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
      >
        {header('7-Day Outlook')}
        <ErrorBanner message={error} />

        <View style={styles.card}>
          <Text style={styles.cardLabel}>HUNT SCORE</Text>
          <Text style={styles.cardBody}>
            Every day, each of your locations gets a Hunt Score out of 100, built from
            {data.uses_history ? ' your hunt history,' : ''} seasonal migration timing,
            cold-front pressure, freeze timing, and weather conditions.
          </Text>
          <ScoreKey />
        </View>

        {data.best_bets.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>BEST BETS THIS WEEK</Text>
              {!data.uses_history ? (
                <Text style={styles.footnoteInline}>baseline model · no hunts logged yet</Text>
              ) : null}
            </View>
            {data.best_bets.map((b, i) => (
              <View key={i} style={styles.betRow}>
                <ScoreBadge score={b.hunt_score} size="md" />
                <View style={styles.grow}>
                  <Text style={styles.betName} numberOfLines={1}>
                    {b.location_name}
                    <Text style={styles.betDate}> · {format(new Date(`${b.date}T12:00:00`), 'EEE, MMM d')}</Text>
                  </Text>
                  {b.events.length > 0 ? (
                    <View style={styles.pillWrap}>
                      {b.events.map((e, j) => <EventPill key={j} event={e} />)}
                    </View>
                  ) : (
                    <Text style={styles.betFactors} numberOfLines={1}>
                      {b.factors.length > 0 ? b.factors.join(' · ') : `${b.wind_cardinal} ${b.wind_speed}mph`}
                    </Text>
                  )}
                </View>
                <View style={styles.betWind}>
                  <ConditionIcon code={b.weather_code} size={17} />
                  <Text style={[styles.windText, { color: windColor(b.wind_speed) }]}>
                    {b.wind_cardinal} {b.wind_speed}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {data.locations.map(loc => (
          <LocationForecast
            key={loc.location_id}
            loc={loc}
            open={expanded === loc.location_id}
            onToggle={() => setExpanded(expanded === loc.location_id ? null : loc.location_id)}
          />
        ))}

        {data.history && data.history.hunts_logged > 0 ? (
          <HistoryPanel h={data.history} spots={data.locations.length} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FreeDayCard({ day }: { day: ForecastDay }) {
  const d = new Date(`${day.date}T12:00:00`);
  const label = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE');

  return (
    <View style={styles.card}>
      <View style={styles.freeHead}>
        <ScoreBadge score={day.hunt_score} size="lg" />
        <View style={styles.grow}>
          <Text style={styles.freeDay}>
            {label}
            <Text style={styles.freeDayMuted}> · {format(d, 'MMM d')}</Text>
          </Text>
          <View style={styles.metaWrap}>
            <View style={styles.metaItem}>
              <ConditionIcon code={day.weather_code} size={14} />
              <Text style={styles.metaText}>{day.condition}</Text>
            </View>
            {day.temp_max !== null ? (
              <Text style={styles.metaText}>
                {Math.round(day.temp_max)}°
                {day.temp_min !== null ? ` / ${Math.round(day.temp_min)}°` : ''}
              </Text>
            ) : null}
            <View style={styles.metaItem}>
              <WindArrow direction={day.wind_direction} speed={day.wind_speed} size={14} />
              <Text style={[styles.windText, { color: windColor(day.wind_speed) }]}>
                {day.wind_cardinal} {day.wind_speed}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <MoonIcon phase={day.moon_phase} size={13} />
              <Text style={styles.metaText}>{day.moon_phase_name}</Text>
            </View>
          </View>
        </View>
      </View>

      {day.events.length > 0 || day.factors.length > 0 ? (
        <View style={styles.freeWhy}>
          {day.events.length > 0 ? (
            <View style={styles.pillWrap}>
              {day.events.map((e, i) => <EventPill key={i} event={e} />)}
            </View>
          ) : null}
          {day.factors.length > 0 ? (
            <Text style={styles.metaText}>
              <Text style={styles.whyStrong}>Why this score: </Text>
              {day.factors.join(' · ')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LocationForecast({
  loc,
  open,
  onToggle,
}: {
  loc: ForecastLocation;
  open: boolean;
  onToggle: () => void;
}) {
  const bestDay = loc.days.reduce<ForecastDay | null>(
    (best, d) => (!best || d.hunt_score > best.hunt_score ? d : best),
    null,
  );
  const image = loc.location_type ? locationTypeImage(loc.location_type) : undefined;

  return (
    <View style={styles.locCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.locToggle, pressed && { opacity: 0.7 }]}
      >
        {image ? <Image source={image} style={styles.locThumb} contentFit="cover" /> : null}
        <View style={styles.grow}>
          <Text style={styles.locName} numberOfLines={1}>{loc.location_name}</Text>
          <Text style={styles.locType} numberOfLines={1}>
            {loc.location_type ? locationTypeLabel(loc.location_type) : 'Location'}
            {bestDay && bestDay.hunt_score >= 45
              ? ` · best ${format(new Date(`${bestDay.date}T12:00:00`), 'EEE')}`
              : ''}
          </Text>
          {loc.timing ? (
            <View style={styles.timingWrap}>
              <TimingChip timing={loc.timing} />
            </View>
          ) : null}
        </View>
        {bestDay ? <ScoreBadge score={bestDay.hunt_score} size="sm" /> : null}
        {Platform.OS === 'ios' ? (
          <SymbolView name={open ? 'chevron.up' : 'chevron.down'} tintColor={colors.textMuted} size={14} />
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {open ? (
        <View style={styles.dayList}>
          {loc.days.map(day => {
            const isBest = bestDay?.date === day.date && day.hunt_score >= 45;
            return (
              <View key={day.date} style={[styles.dayRow, isBest && styles.dayRowBest]}>
                <View style={styles.dayCol}>
                  <Text style={styles.dayName}>{format(new Date(`${day.date}T12:00:00`), 'EEE')}</Text>
                  <Text style={styles.dayDate}>{format(new Date(`${day.date}T12:00:00`), 'M/d')}</Text>
                </View>

                <View style={styles.dayWeather}>
                  <View style={styles.metaItem}>
                    <ConditionIcon code={day.weather_code} size={14} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {day.temp_max !== null ? `${Math.round(day.temp_max)}°` : '—'}
                      {day.temp_min !== null ? ` / ${Math.round(day.temp_min)}°` : ''}
                    </Text>
                  </View>
                  {day.events.length > 0 ? (
                    <View style={styles.pillWrap}>
                      {day.events.map((e, i) => <EventPill key={i} event={e} />)}
                    </View>
                  ) : null}
                </View>

                <View style={styles.dayIconCol}>
                  <WindArrow direction={day.wind_direction} speed={day.wind_speed} size={16} />
                  <Text style={[styles.tinyText, { color: windColor(day.wind_speed) }]}>
                    {day.wind_cardinal} {day.wind_speed}
                  </Text>
                </View>

                <View style={styles.dayIconCol}>
                  <MoonIcon phase={day.moon_phase} size={15} />
                </View>

                <ScoreBadge score={day.hunt_score} size="sm" />
              </View>
            );
          })}

          {/* Per-blind wind matching — the other thing Pro pays for. */}
          {loc.days.some(d => d.blind_wind?.length > 0) ? (
            <View style={styles.blindWindBlock}>
              <Text style={styles.cardLabel}>BLINDS MATCHED TO THE WIND</Text>
              {loc.days
                .filter(d => d.blind_wind?.length > 0)
                .map(d => (
                  <View key={d.date} style={styles.blindWindRow}>
                    <Text style={styles.tinyStrong}>
                      {format(new Date(`${d.date}T12:00:00`), 'EEE')}
                    </Text>
                    <View style={styles.pillWrap}>
                      {d.blind_wind.map(b => (
                        <BlindWindPill
                          key={b.blind_id}
                          match={{ ...b, location_name: loc.location_name }}
                        />
                      ))}
                    </View>
                  </View>
                ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** What Pro adds to the forecast, named rather than teased. */
function LockedForecast({
  lockedDays,
  lockedLocations,
  onPress,
}: {
  lockedDays: number;
  lockedLocations: number;
  onPress: () => void;
}) {
  const items = [
    lockedDays > 0 ? `The other ${lockedDays} days of the week` : 'The full seven-day outlook',
    lockedLocations > 0
      ? `Your other ${lockedLocations} location${lockedLocations === 1 ? '' : 's'}, scored the same way`
      : 'Every location you add, scored the same way',
    'Best bets — your top-scoring days ranked across every spot',
    'Per-blind wind matching for morning and evening sits',
  ];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.text }]}
    >
      <View style={styles.lockHead}>
        <LockIcon />
        <Text style={styles.cardLabel}>THE REST OF THE WEEK — PRO</Text>
      </View>
      <View style={styles.lockList}>
        {items.map(i => (
          <View key={i} style={styles.lockItem}>
            <View style={styles.lockDot} />
            <Text style={styles.lockText}>{i}</Text>
          </View>
        ))}
      </View>
      <View style={styles.goPro}>
        <Text style={styles.goProText}>Go Pro</Text>
      </View>
    </Pressable>
  );
}

/* How far the hunter's own logs have got. One line — the reader has two
 * questions, "is it using my hunts yet" and "what makes it better", and the
 * honest answers fit in a sentence. No caps, points, or channel names. */
function HistoryPanel({
  h,
  spots,
}: {
  h: { hunts_logged: number; timing_locations: number };
  spots: number;
}) {
  const hunts = `${h.hunts_logged} logged hunt${h.hunts_logged === 1 ? '' : 's'}`;
  return (
    <View style={styles.card}>
      <Text style={styles.metaText}>
        Learning from your {hunts} — your forecast leans further on your own results with every
        season you log.
        {spots > 0
          ? ` ${h.timing_locations} of ${spots} spot${spots === 1 ? '' : 's'} ${
              h.timing_locations === 1 ? 'has' : 'have'
            } enough history to be personalized.`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  grow: { flex: 1, minWidth: 0 },
  loader: { marginTop: space.xxl },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },

  headerBlock: { paddingTop: space.sm, paddingBottom: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  rule: { width: 20, height: 1, backgroundColor: colors.textMuted, opacity: 0.5 },
  eyebrow: { ...type.label, color: colors.textMuted },
  title: { ...type.screenTitle, fontSize: 36, lineHeight: 38, color: colors.text, letterSpacing: 1 },

  chipScroll: { flexGrow: 0, height: 34 },
  chipRow: { gap: space.sm, alignItems: 'center' },
  choicePill: {
    paddingHorizontal: space.md,
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  choicePillOn: { backgroundColor: colors.text, borderColor: colors.text },
  choiceText: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  choiceTextOn: { color: colors.textInverse },

  locHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  locName: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  locType: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: space.xl,
    gap: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cardLabel: { ...type.label, color: colors.textMuted },
  cardBody: { ...type.bodySmall, color: colors.text },
  footnote: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  footnoteInline: { ...type.bodySmall, fontSize: 11, color: colors.textMuted },

  freeHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  freeDay: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  freeDayMuted: { fontFamily: 'WorkSans_400Regular', color: colors.textMuted },
  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  windText: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', fontVariant: ['tabular-nums'] },
  tinyText: { ...type.bodySmall, fontSize: 10, fontFamily: 'WorkSans_600SemiBold' },
  tinyStrong: { ...type.label, fontSize: 11, color: colors.text, width: 34 },
  freeWhy: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.md, gap: space.sm },
  whyStrong: { fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  betRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  betName: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  betDate: { fontFamily: 'WorkSans_400Regular', color: colors.textMuted },
  betFactors: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  betWind: { alignItems: 'center', gap: 2 },

  locCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  locToggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  locThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.background },
  timingWrap: { marginTop: 6 },

  dayList: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  dayRowBest: { backgroundColor: 'rgba(27, 94, 69, 0.04)' },
  dayCol: { width: 38 },
  dayName: { ...type.label, fontSize: 11, color: colors.text },
  dayDate: { ...type.bodySmall, fontSize: 11, color: colors.textMuted },
  dayWeather: { flex: 1, minWidth: 0, gap: 4 },
  dayIconCol: { alignItems: 'center', gap: 2, width: 46 },

  blindWindBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    padding: space.lg,
    gap: space.sm,
  },
  blindWindRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },

  lockHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lockList: { gap: space.sm },
  lockItem: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  lockDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, marginTop: 7 },
  lockText: { ...type.bodySmall, flex: 1, color: colors.text },
  goPro: {
    alignSelf: 'flex-start',
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    minHeight: 40,
    justifyContent: 'center',
  },
  goProText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textInverse },

  empty: { alignItems: 'center', paddingVertical: space.xxxl, gap: space.sm },
  emptyTitle: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  emptyBody: { ...type.bodySmall, color: colors.textMuted },
  emptyBtn: {
    marginTop: space.md,
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyBtnText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textInverse },
});
