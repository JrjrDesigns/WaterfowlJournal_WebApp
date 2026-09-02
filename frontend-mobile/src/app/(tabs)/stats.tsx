import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

import LogoIcon from '@/assets/brand/duck-head.svg';
import { MoonIconByName, LockIcon } from '@/components/forecast-bits';
import { SpeciesIcon } from '@/components/species-icon';
import { PaywallModal } from '@/components/paywall-modal';
import { ErrorBanner } from '@/components/ui';
import { useAuth } from '@/contexts/auth';
import { fetchStatistics, fetchSeasonSummary, fetchHuntSeasons, type Season } from '@/utils/api';
import { colors, type, space, radius } from '@/constants/theme';

interface Bucket { name: string; hunts: number; harvested: number }
interface TopEntry { name: string; hunts: number; harvested: number }

interface Statistics {
  total_hunts: number;
  total_harvested: number;
  total_missed: number;
  total_shot_not_recovered: number;
  total_seen: number;
  ducks_total: number;
  geese_total: number;
  others_total: number;
  by_species: Record<string, { harvested: number; missed: number; shot_not_recovered: number; seen: number }>;
  success_rate: number;
  avg_birds_per_hunt: number;
  shot_efficiency: number;
  best_blind: TopEntry | null;
  most_used_blind: TopEntry | null;
  best_location: TopEntry | null;
  best_location_type: TopEntry | null;
  best_day: { date: string; name: string; harvested: number } | null;
  time_split: { morning: { hunts: number; harvested: number }; evening: { hunts: number; harvested: number } };
  by_month: Array<{ month: string; hunts: number; harvested: number }>;
  by_day_of_week: Bucket[];
  by_moon_phase: Bucket[];
  by_sky: Bucket[];
  by_temp: Bucket[];
  by_wind: Bucket[];
  group: {
    hunts: number;
    total_harvested: number;
    avg_party_size: number;
    by_species: Record<string, number>;
  } | null;
}

/** The free tier's Season Card — counting, not analysis. */
interface SeasonSummary {
  total_hunts: number;
  total_harvested: number;
  species_count: number;
  days_afield: number;
  first_hunt_date: string | null;
  last_hunt_date: string | null;
  insight: { text: string; sample: number } | null;
  insight_unlocks_at: number;
}

export default function Stats() {
  const { isPro } = useAuth();

  const [stats, setStats] = useState<Statistics | null>(null);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchHuntSeasons();
        const available = data.seasons ?? [];
        setSeasons(available);
        if (available.length > 0) setSelectedSeason(available[0].start);
      } catch {
        // Not fatal — the unfiltered season still loads.
      }
    })();
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      setError('');
      try {
        /* Two endpoints, deliberately. A free account requests the summary and
         * never receives the Pro payload at all — nothing is hidden client-side,
         * so there is nothing to uncover by reading the response. */
        if (isPro) setStats(await fetchStatistics(selectedSeason ?? undefined));
        else setSummary(await fetchSeasonSummary(selectedSeason ?? undefined));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load your season.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isPro, selectedSeason],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.grow}>
          <View style={styles.eyebrowRow}>
            <View style={styles.rule} />
            <Text style={styles.eyebrow}>SEASON REVIEW</Text>
          </View>
          <Text style={styles.title}>STATISTICS</Text>
        </View>
      </View>
      {/* A season is named by the year it opened in and shown as "25/26", so a
        * season that runs past New Year's stays under one tab. */}
      {seasons.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.seasonScroll}
          contentContainerStyle={styles.seasonRow}
        >
          {seasons.map(season => {
            const on = selectedSeason === season.start;
            return (
              <Pressable
                key={season.start}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${season.label} season`}
                onPress={() => setSelectedSeason(season.start)}
                style={[styles.seasonPill, on && styles.seasonPillOn]}
              >
                <Text style={[styles.seasonText, on && styles.seasonTextOn]}>{season.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  /* Free — the Season Card. Governing principle: free answers "what did I do",
   * Pro answers "what should I do". The hunter's real numbers come first and
   * what Pro adds is named underneath, because an earlier version showed the
   * headline stats with the charts blurred and that read as being taxed on
   * their own data. Never reintroduce a blurred preview. */
  if (!isPro) {
    const hasHunts = (summary?.total_hunts ?? 0) > 0;
    const shortfall = summary ? summary.insight_unlocks_at - summary.total_hunts : 0;

    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
        >
          {header}
          <ErrorBanner message={error} />

          {!hasHunts ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No hunts logged yet.</Text>
              <Text style={styles.emptyBody}>
                Your season fills in here as you log them — free, with no limit.
              </Text>
            </View>
          ) : summary ? (
            <>
              <View style={styles.tileRow}>
                <SummaryTile label="Hunts" value={summary.total_hunts} />
                <View style={styles.tileDivider} />
                <SummaryTile label="Harvested" value={summary.total_harvested} accent />
                <View style={styles.tileDivider} />
                <SummaryTile label="Species" value={summary.species_count} />
                <View style={styles.tileDivider} />
                <SummaryTile label="Days Afield" value={summary.days_afield} />
              </View>

              {/* Species stays a bare count on free — no per-species breakdown.
                  The logo sits in the slot the species photograph occupies on
                  Pro, so upgrading fills the shape in rather than rearranging
                  the screen. */}
              <View style={styles.speciesRow}>
                <View style={styles.speciesLogo}>
                  <LogoIcon width={40} height={40} />
                </View>
                <View style={styles.speciesBody}>
                  <View style={styles.grow}>
                    <Text style={styles.speciesTitle}>Species taken</Text>
                    <Text style={styles.speciesSub}>See every bird by name on Pro</Text>
                  </View>
                  <Text style={styles.speciesCount}>{summary.species_count}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>FROM YOUR SEASON</Text>
                {summary.insight ? (
                  <>
                    <Text style={styles.insight}>{summary.insight.text}</Text>
                    <Text style={styles.footnote}>
                      Drawn from {summary.insight.sample} of your hunts. Pro shows every pattern
                      behind your season, not just the strongest one.
                    </Text>
                  </>
                ) : shortfall > 0 ? (
                  <Text style={styles.cardBody}>
                    Log {shortfall} more hunt{shortfall === 1 ? '' : 's'} and Blind Guide will start
                    finding the patterns in your season.
                  </Text>
                ) : (
                  <Text style={styles.cardBody}>
                    No clear pattern in this season yet — keep logging and one will surface.
                  </Text>
                )}
              </View>
            </>
          ) : null}

          <LockedPro onPress={() => setPaywall(true)} />
        </ScrollView>

        <PaywallModal visible={paywall} reason="stats" onClose={() => setPaywall(false)} />
      </SafeAreaView>
    );
  }

  if (!stats || stats.total_hunts === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {header}
          <ErrorBanner message={error} />
          {!error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No data yet.</Text>
              <Text style={styles.emptyBody}>Log some hunts to see your season stats.</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const morningAvg =
    stats.time_split.morning.hunts > 0
      ? stats.time_split.morning.harvested / stats.time_split.morning.hunts
      : 0;
  const eveningAvg =
    stats.time_split.evening.hunts > 0
      ? stats.time_split.evening.harvested / stats.time_split.evening.hunts
      : 0;

  const topSpecies = Object.entries(stats.by_species)
    .map(([name, v]) => ({ name, harvested: v.harvested, hunts: 0 }))
    .sort((a, b) => b.harvested - a.harvested)
    .slice(0, 8);

  const categories = [
    { name: 'Ducks', value: stats.ducks_total },
    { name: 'Geese', value: stats.geese_total },
    { name: 'Other', value: stats.others_total },
  ].filter(c => c.value > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />}
      >
        {header}
        <ErrorBanner message={error} />

        <View style={styles.tileRow}>
          <StatCol label="Hunts" value={stats.total_hunts} />
          <StatCol label="Harvested" value={stats.total_harvested} accent />
          <StatCol label="Missed" value={stats.total_missed} secondary />
          {stats.total_seen > 0 ? <StatCol label="Seen" value={stats.total_seen} muted /> : null}
        </View>

        <View style={styles.ringCard}>
          <View style={styles.ringBlock}>
            <View style={styles.ringWrap}>
              <SuccessRing percent={stats.success_rate} />
              <View style={styles.ringCentre}>
                <Text style={styles.ringValue}>{stats.success_rate}%</Text>
              </View>
            </View>
            <Text style={styles.cardLabel}>SUCCESS RATE</Text>
            <Text style={styles.footnote}>hunts with birds</Text>
          </View>

          <View style={styles.ringSide}>
            <View style={styles.centred}>
              <Text style={styles.bigNum}>{stats.avg_birds_per_hunt}</Text>
              <Text style={styles.cardLabel}>BIRDS / HUNT</Text>
            </View>
            <View style={styles.centred}>
              <Text style={styles.bigNum}>{stats.shot_efficiency}%</Text>
              <Text style={styles.cardLabel}>SHOT EFFICIENCY</Text>
            </View>
          </View>
        </View>

        {stats.best_blind || stats.most_used_blind || stats.best_location || stats.best_day ? (
          <Card title="Season Highlights">
            {stats.best_blind ? (
              <HighlightTile label="BEST BLIND" value={stats.best_blind.name} sub={`${stats.best_blind.harvested} birds`} />
            ) : null}
            {stats.most_used_blind ? (
              <HighlightTile label="MOST HUNTED BLIND" value={stats.most_used_blind.name} sub={`${stats.most_used_blind.hunts} hunt${stats.most_used_blind.hunts === 1 ? '' : 's'}`} />
            ) : null}
            {stats.best_location ? (
              <HighlightTile label="BEST LOCATION" value={stats.best_location.name} sub={`${stats.best_location.harvested} birds`} />
            ) : null}
            {stats.best_day ? (
              <HighlightTile label="BEST DAY" value={stats.best_day.name} sub={`${stats.best_day.harvested} birds`} />
            ) : null}
          </Card>
        ) : null}

        {stats.time_split.morning.hunts > 0 || stats.time_split.evening.hunts > 0 ? (
          <Card title="Morning vs Evening">
            <View style={styles.splitRow}>
              {([['Morning', morningAvg, stats.time_split.morning], ['Evening', eveningAvg, stats.time_split.evening]] as const).map(
                ([label, avg, s], i) => {
                  const best = morningAvg !== eveningAvg && avg === Math.max(morningAvg, eveningAvg);
                  return (
                    <View key={label} style={[styles.splitCol, i === 1 && styles.leftHairline]}>
                      <Text style={[styles.bigNum, best && { color: colors.accent }]}>{avg.toFixed(1)}</Text>
                      <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
                      <Text style={styles.footnote}>
                        {s.harvested} birds · {s.hunts} hunt{s.hunts === 1 ? '' : 's'}
                      </Text>
                    </View>
                  );
                },
              )}
            </View>
            <Text style={styles.centredFootnote}>avg birds per hunt</Text>
          </Card>
        ) : null}

        {topSpecies.length > 0 ? (
          <Card title="Top Species">
            <ValueBars
              rows={topSpecies.map(s => ({ name: s.name, value: s.harvested }))}
              suffix=" birds"
              icon={name => <SpeciesIcon species={name} size={24} />}
            />
          </Card>
        ) : null}

        {categories.length > 0 ? (
          <Card title="Harvest by Category">
            <ValueBars rows={categories} suffix=" birds" />
          </Card>
        ) : null}

        {stats.by_month.length > 1 ? (
          <Card title="Harvest by Month">
            <ValueBars rows={stats.by_month.map(m => ({ name: m.month, value: m.harvested }))} suffix=" birds" />
          </Card>
        ) : null}

        {stats.by_day_of_week.length > 0 ? (
          <Card title="Best Day of the Week">
            <BreakdownRows data={stats.by_day_of_week} />
          </Card>
        ) : null}

        {stats.by_moon_phase.length > 0 ? (
          <Card title="Moon Phase">
            <BreakdownRows data={stats.by_moon_phase} icon={name => <MoonIconByName name={name} />} />
          </Card>
        ) : null}

        {stats.by_sky.length > 0 || stats.by_temp.length > 0 || stats.by_wind.length > 0 ? (
          <Card title="Best Conditions">
            {stats.by_sky.length > 0 ? (
              <>
                <Text style={styles.subLabel}>SKY</Text>
                <BreakdownRows data={stats.by_sky} />
              </>
            ) : null}
            {stats.by_temp.length > 0 ? (
              <>
                <Text style={styles.subLabel}>TEMPERATURE</Text>
                <BreakdownRows data={stats.by_temp} />
              </>
            ) : null}
            {stats.by_wind.length > 0 ? (
              <>
                <Text style={styles.subLabel}>WIND</Text>
                <BreakdownRows data={stats.by_wind} />
              </>
            ) : null}
          </Card>
        ) : null}

        {stats.group ? (
          <Card title="Group Hunts">
            <View style={styles.splitRow}>
              <View style={styles.splitCol}>
                <Text style={styles.bigNum}>{stats.group.hunts}</Text>
                <Text style={styles.cardLabel}>HUNTS</Text>
              </View>
              <View style={[styles.splitCol, styles.leftHairline]}>
                <Text style={[styles.bigNum, { color: colors.accent }]}>{stats.group.total_harvested}</Text>
                <Text style={styles.cardLabel}>PARTY BIRDS</Text>
              </View>
              <View style={[styles.splitCol, styles.leftHairline]}>
                <Text style={[styles.bigNum, { color: colors.accentSecondary }]}>{stats.group.avg_party_size}</Text>
                <Text style={styles.cardLabel}>AVG PARTY</Text>
              </View>
            </View>
            {Object.keys(stats.group.by_species).length > 0 ? (
              <View style={styles.groupSpecies}>
                <ValueBars
                  rows={Object.entries(stats.group.by_species).map(([name, value]) => ({ name, value }))}
                  suffix=" birds"
                  icon={name => <SpeciesIcon species={name} size={24} />}
                />
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCol({
  label,
  value,
  accent = false,
  secondary = false,
  muted = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  secondary?: boolean;
  muted?: boolean;
}) {
  const color = accent
    ? colors.accent
    : secondary
      ? colors.accentSecondary
      : muted
        ? colors.textMuted
        : colors.text;
  return (
    <View style={styles.statCol}>
      <Text style={[styles.statColValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** A Season Card counter. Smaller than StatCol so four fit across a phone. */
function SummaryTile({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={[styles.summaryValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function HighlightTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.highlight}>
      <Text style={styles.highlightLabel}>{label}</Text>
      <Text style={styles.highlightValue}>{value}</Text>
      {sub ? <Text style={styles.footnote}>{sub}</Text> : null}
    </View>
  );
}

/** Label, birds-per-hunt bar, values. Bar scaled to the max average in the set. */
function BreakdownRows({
  data,
  icon,
}: {
  data: Bucket[];
  icon?: (name: string) => React.ReactNode;
}) {
  const rows = data.map(d => ({ ...d, avg: d.hunts > 0 ? d.harvested / d.hunts : 0 }));
  const maxAvg = Math.max(...rows.map(r => r.avg), 0.001);
  return (
    <View style={styles.barList}>
      {rows.map(r => (
        <View key={r.name} style={styles.barRow}>
          {icon ? <View style={styles.barIcon}>{icon(r.name)}</View> : null}
          <Text style={styles.barName} numberOfLines={1}>{r.name}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(r.avg / maxAvg) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>{r.avg.toFixed(1)}</Text>
          <Text style={styles.barHunts}>{r.hunts} hunt{r.hunts === 1 ? '' : 's'}</Text>
        </View>
      ))}
    </View>
  );
}

/* The web app draws these three as recharts bar charts. On a phone the same
 * data reads better as the horizontal rows already used elsewhere on this
 * screen — same numbers, same order, no chart library. */
function ValueBars({
  rows,
  suffix = '',
  icon,
}: {
  rows: Array<{ name: string; value: number }>;
  suffix?: string;
  icon?: (name: string) => React.ReactNode;
}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <View style={styles.barList}>
      {rows.map(r => (
        <View key={r.name} style={styles.barRow}>
          {icon ? <View style={styles.barIcon}>{icon(r.name)}</View> : null}
          <Text style={styles.barName} numberOfLines={1}>{r.name}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(r.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.barValueWide}>{r.value}{suffix}</Text>
        </View>
      ))}
    </View>
  );
}

function SuccessRing({ percent }: { percent: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <Svg width={128} height={128} viewBox="0 0 120 120">
      <Circle cx={60} cy={60} r={r} fill="none" stroke={colors.hairline} strokeWidth={8} />
      <Circle
        cx={60}
        cy={60}
        r={r}
        fill="none"
        stroke={colors.accent}
        strokeWidth={8}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
    </Svg>
  );
}

/** What Pro adds, named rather than blurred. A blurred chart reads as a tax on
 *  something the hunter already earned; a plain list reads as an offer. */
function LockedPro({ onPress }: { onPress: () => void }) {
  const items = [
    'Every species you took, bird by bird',
    'Your best blind, best spot and best day',
    'Morning versus evening performance',
    'How wind, sky, temperature and moon shaped your season',
    'Month-by-month and season-over-season trends',
    'CSV export of everything you have logged',
  ];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.text }]}
    >
      <View style={styles.lockHead}>
        <LockIcon />
        <Text style={styles.cardLabel}>THE REST OF YOUR SEASON — PRO</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  grow: { flex: 1, minWidth: 0 },
  loader: { marginTop: space.xxl },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingTop: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  rule: { width: 20, height: 1, backgroundColor: colors.textMuted, opacity: 0.5 },
  eyebrow: { ...type.label, color: colors.textMuted },
  title: { ...type.screenTitle, fontSize: 36, lineHeight: 38, color: colors.text, letterSpacing: 1 },
  seasonScroll: { flexGrow: 0, height: 34 + space.md },
  seasonRow: { gap: space.sm, alignItems: 'center' },
  seasonPill: {
    paddingHorizontal: space.md,
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  seasonPillOn: { backgroundColor: colors.text, borderColor: colors.text },
  seasonText: { ...type.label, fontSize: 11, color: colors.textMuted },
  seasonTextOn: { color: colors.textInverse },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: space.xl,
    gap: space.md,
  },
  cardLabel: { ...type.label, color: colors.textMuted },
  cardBody: { ...type.bodySmall, color: colors.text },
  subLabel: { ...type.label, fontSize: 10, color: colors.textMuted, marginTop: space.sm },
  footnote: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  centredFootnote: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  insight: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  tileRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tileDivider: { width: 1, backgroundColor: colors.hairline },
  summaryTile: { flex: 1, alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.xs, gap: space.sm },
  summaryValue: { ...type.statLarge, fontSize: 38, lineHeight: 38, color: colors.text },
  summaryLabel: { ...type.label, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: space.lg, gap: space.sm },
  statColValue: { ...type.statHero, fontSize: 46, lineHeight: 46 },

  speciesRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
    height: 80,
  },
  speciesLogo: {
    width: 96,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
  },
  speciesBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  speciesTitle: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  speciesSub: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  speciesCount: { ...type.statLarge, fontSize: 32, lineHeight: 32, color: colors.accent },

  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingVertical: space.xxl,
  },
  ringBlock: { alignItems: 'center', gap: space.sm },
  ringWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  ringCentre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { ...type.statLarge, fontSize: 30, lineHeight: 30, color: colors.accent },
  ringSide: { gap: space.xl },
  centred: { alignItems: 'center', gap: space.xs },
  bigNum: { ...type.statLarge, fontSize: 36, lineHeight: 36, color: colors.text },

  highlight: { gap: 2, paddingVertical: space.sm },
  highlightLabel: { ...type.label, fontSize: 10, color: colors.textMuted },
  highlightValue: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  splitRow: { flexDirection: 'row' },
  splitCol: { flex: 1, alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm },
  leftHairline: { borderLeftWidth: 1, borderLeftColor: colors.hairline },

  barList: { gap: space.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barIcon: { width: 26, alignItems: 'center' },
  barName: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', color: colors.text, width: 96 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  barValue: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', color: colors.text, width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },
  barValueWide: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', color: colors.text, width: 66, textAlign: 'right', fontVariant: ['tabular-nums'] },
  barHunts: { ...type.bodySmall, fontSize: 11, color: colors.textMuted, width: 52, textAlign: 'right', fontVariant: ['tabular-nums'] },

  groupSpecies: { marginTop: space.md },

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

  empty: { alignItems: 'center', paddingVertical: space.xxxl, gap: space.xs },
  emptyTitle: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  emptyBody: { ...type.bodySmall, color: colors.textMuted, textAlign: 'center' },
});
