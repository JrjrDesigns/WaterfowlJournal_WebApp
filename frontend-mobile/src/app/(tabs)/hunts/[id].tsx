import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';

import { ConditionIcon } from '@/components/condition-icon';
import { SpeciesIcon } from '@/components/species-icon';
import { WindStrip, type WindEntry } from '@/components/wind-strip';
import { MoonIcon } from '@/components/forecast-bits';
import { PaywallModal } from '@/components/paywall-modal';
import { ScreenHeader } from '@/components/screen-header';
import { ErrorBanner } from '@/components/ui';
import { useAuth } from '@/contexts/auth';
import { fetchHunt, deleteHunt } from '@/utils/api';
import { locationTypeImage } from '@/constants/domain';
import { colors, type, space, radius } from '@/constants/theme';

interface Hunt {
  id: string;
  name: string;
  date: string;
  location: { lat: number; lng: number };
  blind_name: string;
  location_type: string | null;
  notes: string;
  photos: string[];
  is_morning: boolean;
  is_evening: boolean;
  weather_data: {
    temp?: number;
    temp_max?: number;
    temp_min?: number;
    condition?: string;
    weather_code?: number;
    wind_speed?: number;
    precipitation?: number;
    sunrise?: string;
    sunset?: string;
    wind_morning?: WindEntry[];
    wind_evening?: WindEntry[];
    moon_phase?: number;
    moon_phase_name?: string;
  } | null;
  harvests: Array<{
    species_name: string;
    count: number;
    mine: number;
    missed: number;
    shot_not_recovered: number;
    seen: number;
  }>;
  party: string[];
}

// Temperature colour scale, verbatim from the web app.
const tempColor = (t: number): string => {
  if (t <= 0) return '#E2E8F0';
  if (t <= 32) return '#BAE6FD';
  if (t <= 45) return '#1B4F6E';
  if (t <= 60) return '#F97316';
  return '#DC2626';
};

export default function HuntDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro } = useAuth();

  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHunt(await fetchHunt(id));
    } catch (err: unknown) {
      /* Web navigates away on failure, which hides the reason. Showing it means
         a dropped signal doesn't look like a deleted hunt. */
      setError(err instanceof Error ? err.message : 'Could not load this hunt.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = () => {
    Alert.alert('Delete this hunt?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHunt(id);
            router.back();
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to delete hunt');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  if (!hunt) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Not found" onBack={() => router.back()} backLabel="Hunts" />
        <View style={styles.pad}><ErrorBanner message={error || 'That hunt no longer exists.'} /></View>
      </SafeAreaView>
    );
  }

  const w = hunt.weather_data;
  const heroImage = hunt.location_type ? locationTypeImage(hunt.location_type) : undefined;
  const showWind = isPro && w && (hunt.is_morning || hunt.is_evening);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Field Log"
        onBack={() => router.back()}
        backLabel="Hunts"
        actions={[
          {
            symbol: 'square.and.pencil',
            ion: 'create-outline',
            label: 'Edit this hunt',
            onPress: () => router.push({ pathname: '/(tabs)/hunts/edit', params: { id } }),
          },
          {
            symbol: 'trash',
            ion: 'trash-outline',
            label: 'Delete this hunt',
            onPress: confirmDelete,
            danger: true,
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBanner message={error} />

        <View style={styles.card}>
          {/* Hero: terrain photo under a darkening gradient, title on top. */}
          <View style={styles.hero}>
            {heroImage ? (
              <Image source={heroImage} style={styles.heroImage} contentFit="cover" />
            ) : null}
            <LinearGradient
              colors={['rgba(19,20,26,0.15)', 'rgba(19,20,26,0.75)']}
              style={styles.heroImage}
            />
            <View style={styles.heroText}>
              <Text style={styles.heroDate}>
                {format(new Date(`${hunt.date}T12:00:00`), 'MMM d, yyyy').toUpperCase()}
              </Text>
              <Text style={styles.heroTitle}>{hunt.name.toUpperCase()}</Text>
              {hunt.blind_name ? <Text style={styles.heroMeta}>{hunt.blind_name}</Text> : null}
              {hunt.party?.length > 0 ? (
                <Text style={styles.heroParty}>Hunting with {hunt.party.join(', ')}</Text>
              ) : null}
            </View>
          </View>

          {/* Conditions. Pro-only, by explicit product decision — free still
              sees temp · wind · sky on the hunt-list row, which is a deliberate
              leak so the data is visibly there without giving the full picture. */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CONDITIONS</Text>
            {!isPro ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPaywall(true)}
                style={({ pressed }) => [styles.lockRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.lockText}>Weather data — Pro feature</Text>
                <Text style={styles.lockCta}>Unlock</Text>
              </Pressable>
            ) : w ? (
              <>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <ConditionIcon code={w.weather_code} size={26} color={colors.text} />
                    <Text style={styles.statValue} numberOfLines={2}>{w.condition ?? '—'}</Text>
                    <Text style={styles.statLabel}>SKY</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.stat}>
                    <View style={[styles.tempDot, { backgroundColor: tempColor(w.temp ?? 50) }]} />
                    <Text style={styles.statValue}>{w.temp != null ? `${w.temp}°` : '—'}</Text>
                    <Text style={styles.statLabel}>AVG</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.stat}>
                    {w.temp_max != null && w.temp_min != null ? (
                      <>
                        <LinearGradient
                          colors={[tempColor(w.temp_min), tempColor(w.temp_max)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.tempBar}
                        />
                        <Text style={styles.statValue}>{w.temp_max}° / {w.temp_min}°</Text>
                      </>
                    ) : (
                      <Text style={styles.statValue}>—</Text>
                    )}
                    <Text style={styles.statLabel}>HI / LO</Text>
                  </View>

                  {w.moon_phase != null ? (
                    <>
                      <View style={styles.statDivider} />
                      <View style={styles.stat}>
                        <MoonIcon phase={w.moon_phase} size={24} />
                        <Text style={styles.statValue} numberOfLines={2}>
                          {w.moon_phase_name?.replace('Waxing ', '').replace('Waning ', '') ?? '—'}
                        </Text>
                        <Text style={styles.statLabel}>MOON</Text>
                      </View>
                    </>
                  ) : null}
                </View>

                {w.precipitation != null || w.sunrise || w.sunset ? (
                  <View style={styles.rows}>
                    {w.precipitation != null && w.precipitation > 0 ? (
                      <DataRow label="PRECIP" value={`${w.precipitation}"`} />
                    ) : null}
                    {w.sunrise ? <DataRow label="SUNRISE" value={w.sunrise} /> : null}
                    {w.sunset ? <DataRow label="SUNSET" value={w.sunset} /> : null}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.noData}>No weather data available.</Text>
            )}
          </View>

          {showWind ? (
            <View style={styles.windSection}>
              <WindStrip
                morning={w?.wind_morning ?? []}
                evening={w?.wind_evening ?? []}
                showMorning={hunt.is_morning}
                showEvening={hunt.is_evening}
              />
            </View>
          ) : null}

          {hunt.harvests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>HARVEST</Text>
              {hunt.harvests.map((h, i) => (
                <View key={i} style={[styles.harvestRow, i > 0 && styles.topHairline]}>
                  <View style={styles.harvestName}>
                    <SpeciesIcon species={h.species_name} size={28} />
                    <Text style={styles.speciesText} numberOfLines={1}>{h.species_name}</Text>
                  </View>
                  <View style={styles.harvestCounts}>
                    {h.seen > 0 ? <MiniStat n={h.seen} label="seen" /> : null}
                    {h.missed > 0 ? <MiniStat n={h.missed} label="missed" /> : null}
                    {h.shot_not_recovered > 0 ? <MiniStat n={h.shot_not_recovered} label="lost" /> : null}
                    <MiniStat n={h.count} label="bagged" accent />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {hunt.photos.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PHOTOS</Text>
              <View style={styles.photoGrid}>
                {hunt.photos.map((photo, i) => (
                  <Pressable
                    key={i}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="View photo"
                    onPress={() => setLightbox(photo)}
                    style={styles.photoCell}
                  >
                    <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" cachePolicy="disk" />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {hunt.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              <Text style={styles.notes}>{hunt.notes}</Text>
            </View>
          ) : null}

          <View style={styles.mapWrap} pointerEvents="none">
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: hunt.location.lat,
                longitude: hunt.location.lng,
                latitudeDelta: 0.004,
                longitudeDelta: 0.004,
              }}
              mapType="hybrid"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{ latitude: hunt.location.lat, longitude: hunt.location.lng }}
                pinColor={colors.accent}
              />
            </MapView>
          </View>
        </View>
      </ScrollView>

      <PaywallModal visible={paywall} reason="weather" onClose={() => setPaywall(false)} />

      <Modal visible={lightbox !== null} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(null)}>
          {lightbox ? (
            <Image source={{ uri: lightbox }} style={styles.lightboxImage} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function MiniStat({ n, label, accent = false }: { n: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniNum, accent && { color: colors.accent }]}>{n}</Text>
      <Text style={styles.miniLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: space.lg },
  loader: { marginTop: space.xxl },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.lg },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
  },

  hero: { height: 176, backgroundColor: colors.text },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroText: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingBottom: space.lg },
  heroDate: { ...type.label, color: 'rgba(255,255,255,0.7)' },
  heroTitle: { ...type.screenTitle, fontSize: 34, lineHeight: 36, color: colors.textInverse, letterSpacing: 1 },
  heroMeta: { ...type.bodySmall, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroParty: { ...type.bodySmall, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  section: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: space.sm,
  },
  windSection: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  sectionLabel: { ...type.label, color: colors.textMuted },

  lockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  lockText: { ...type.bodySmall, color: colors.textMuted },
  lockCta: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text, textDecorationLine: 'underline' },

  statRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: space.sm },
  stat: { flex: 1, alignItems: 'center', gap: space.xs + 2, paddingHorizontal: space.xs },
  statDivider: { width: 1, backgroundColor: colors.hairline },
  statValue: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', color: colors.text, textAlign: 'center' },
  statLabel: { ...type.label, fontSize: 10, color: colors.textMuted },
  tempDot: { width: 22, height: 22, borderRadius: 11 },
  tempBar: { width: 52, height: 8, borderRadius: 4, marginTop: 7, marginBottom: 7 },

  rows: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dataRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  dataValue: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  noData: { ...type.bodySmall, color: colors.textMuted, paddingVertical: space.md },

  harvestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: space.md, paddingVertical: space.md,
  },
  topHairline: { borderTopWidth: 1, borderTopColor: colors.hairline },
  harvestName: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 },
  speciesText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text, flexShrink: 1 },
  harvestCounts: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg },
  miniStat: { alignItems: 'flex-end' },
  miniNum: { ...type.statLarge, fontSize: 20, lineHeight: 20, color: colors.textMuted },
  miniLabel: { ...type.label, fontSize: 9, color: colors.textMuted },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photoCell: { width: '31.5%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: radius.sm, backgroundColor: colors.background },

  notes: { ...type.body, color: colors.text },

  mapWrap: { height: 176 },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  lightbox: { flex: 1, backgroundColor: 'rgba(19,20,26,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  lightboxImage: { width: '100%', height: '100%' },
});
