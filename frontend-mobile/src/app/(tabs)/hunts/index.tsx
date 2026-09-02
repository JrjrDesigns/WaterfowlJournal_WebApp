import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { ConditionIcon } from '@/components/condition-icon';
import { LocationTypeThumb } from '@/components/location-type-thumb';
import { ErrorBanner } from '@/components/ui';
import { fetchHunts, fetchHuntSeasons, type Season } from '@/utils/api';
import { colors, type, space, radius } from '@/constants/theme';

interface Hunt {
  id: string;
  name: string;
  blind_name: string;
  location_type: string | null;
  date: string;
  weather_data: {
    temp?: number;
    condition?: string;
    weather_code?: number;
    wind_speed?: number;
  } | null;
  harvests: Array<{ species_name: string; count: number }>;
  photo_count: number;
}

export default function HuntList() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Seasons first; the newest becomes the default tab, as on web. A season is
  // identified by the year it opened in and shown as "25/26", so the hunts on
  // either side of New Year's sit under one tab.
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchHuntSeasons();
        const available = data.seasons ?? [];
        setSeasons(available);
        if (available.length > 0) setSelectedSeason(available[0].start);
        else setLoading(false);
      } catch {
        // A missing season list is not fatal — the unfiltered hunt list still loads.
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      setError('');
      try {
        setHunts(await fetchHunts(selectedSeason ?? undefined));
      } catch (err: unknown) {
        // Unlike web, a failure says so rather than showing an empty journal —
        // "no hunts" and "couldn't ask" must not look identical.
        setError(err instanceof Error ? err.message : 'Could not load your hunts.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedSeason],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <View style={styles.eyebrowRow}>
            <View style={styles.rule} />
            <Text style={styles.eyebrow}>FIELD JOURNAL</Text>
          </View>
          <Text style={styles.title}>MY HUNTS</Text>
        </View>

        {/* Logging is unlimited on every tier — no gate here, by design. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log a hunt"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/hunts/create');
          }}
          style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.75 }]}
        >
          {Platform.OS === 'ios' ? (
            <SymbolView name="plus" tintColor={colors.textInverse} size={15} />
          ) : (
            <Ionicons name="add" size={16} color={colors.textInverse} />
          )}
          <Text style={styles.logBtnText}>Log Hunt</Text>
        </Pressable>
      </View>

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

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      ) : (
        <FlatList
          data={hunts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />
          }
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : null}
          ListEmptyComponent={
            error ? null : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No hunts logged yet.</Text>
                <Text style={styles.emptyBody}>Tap “Log Hunt” to record your first sit.</Text>
              </View>
            )
          }
          /* One card with hairline-divided rows, as on web — so the separator
             sits between rows rather than boxing each one. */
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item, index }) => (
            <HuntRow
              hunt={item}
              first={index === 0}
              last={index === hunts.length - 1}
              onPress={() => router.push({ pathname: '/(tabs)/hunts/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function HuntRow({
  hunt,
  first,
  last,
  onPress,
}: {
  hunt: Hunt;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const total = hunt.harvests.reduce((sum, h) => sum + h.count, 0);

  /* The free-tier "glance": temperature, wind, sky. Deliberately the only
     weather a free account sees on a logged hunt — the full conditions panel is
     Pro. This leak is a product decision, not an oversight. */
  const parts: string[] = [];
  if (hunt.weather_data?.temp != null) parts.push(`${hunt.weather_data.temp}°F`);
  if (hunt.weather_data?.wind_speed != null) parts.push(`${hunt.weather_data.wind_speed} mph`);
  if (hunt.weather_data?.condition) parts.push(hunt.weather_data.condition);
  const summary = parts.join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && { backgroundColor: colors.background },
      ]}
    >
      <LocationTypeThumb locationType={hunt.location_type} width={96} />

      <View style={styles.rowBody}>
        {/* Noon avoids the date shifting a day when parsed as UTC — same trick
            the web app uses. */}
        <Text style={styles.rowDate}>
          {format(new Date(`${hunt.date}T12:00:00`), 'MMM d, yyyy').toUpperCase()}
        </Text>
        <Text style={styles.rowName} numberOfLines={1}>
          {hunt.name}
        </Text>
        {hunt.blind_name ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {hunt.blind_name}
          </Text>
        ) : null}
        {summary ? (
          <View style={styles.summaryRow}>
            <ConditionIcon code={hunt.weather_data?.weather_code} />
            <Text style={styles.rowMeta} numberOfLines={1}>
              {summary}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.countBlock}>
        <Text style={styles.count}>{total}</Text>
        <Text style={styles.countLabel}>BIRDS</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: space.xxl },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  rule: { width: 20, height: 1, backgroundColor: colors.textMuted, opacity: 0.5 },
  eyebrow: { ...type.label, color: colors.textMuted },
  title: { ...type.screenTitle, fontSize: 36, lineHeight: 38, color: colors.text, letterSpacing: 1 },

  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    minHeight: 44,
  },
  logBtnText: { ...type.button, fontSize: 15, color: colors.textInverse },

  /* A ScrollView inside a flex column grows to fill the space left over,
   * which parked three pills in the middle of a tall empty band. Pinning the
   * height to the pill plus its padding keeps the row the size it looks. */
  seasonScroll: { flexGrow: 0, height: 34 + space.lg },
  seasonRow: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.sm,
    // Without this a horizontal ScrollView stretches children to its own
    // height, which turned these pills into tall ovals.
    alignItems: 'center',
  },
  seasonPill: {
    paddingHorizontal: space.lg,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  seasonPillOn: { backgroundColor: colors.text, borderColor: colors.text },
  seasonText: { ...type.label, color: colors.textMuted },
  seasonTextOn: { color: colors.textInverse },

  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  divider: { height: 1, backgroundColor: colors.hairline },

  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    height: 96,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  rowBody: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: 1 },
  rowDate: { ...type.label, color: colors.textMuted },
  rowName: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  rowMeta: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  countBlock: { justifyContent: 'center', alignItems: 'flex-end', paddingRight: space.lg },
  count: { ...type.statLarge, fontSize: 32, lineHeight: 32, color: colors.accent },
  countLabel: { ...type.label, fontSize: 10, color: colors.textMuted },

  empty: { alignItems: 'center', paddingVertical: space.xxxl, gap: space.xs },
  emptyTitle: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  emptyBody: { ...type.bodySmall, color: colors.textMuted },
});
