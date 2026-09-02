import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { Button, Card, ErrorBanner, Field, SectionLabel } from '@/components/ui';
import { PlaceSearch } from '@/components/place-search';
import { ScreenHeader } from '@/components/screen-header';
import { useCurrentPosition, positionErrorMessage } from '@/hooks/use-current-position';
import {
  fetchLocations,
  fetchBlindsForLocation,
  createBlind,
  updateBlind,
  deleteBlind,
  deleteLocation,
} from '@/utils/api';
import {
  BLIND_TYPES,
  blindTypeLabel,
  locationTypeLabel,
  type BlindData,
  type LocationData,
} from '@/constants/domain';
import { colors, type, space, radius } from '@/constants/theme';

interface Draft {
  id: string | null;
  name: string;
  blindType: string;
  notes: string;
  lat: number;
  lng: number;
}

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [location, setLocation] = useState<LocationData | null>(null);
  const [blinds, setBlinds] = useState<BlindData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState('');

  const { locate, locating, error: posError } = useCurrentPosition();

  const load = useCallback(async () => {
    setError('');
    try {
      /* There is no GET /api/locations/{id} — the web app keeps the location in
       * memory from the list it already has. On mobile this screen can be the
       * first thing restored on a cold start (or landed on straight from the
       * create sheet), so it finds its own record in the list. */
      const [all, blindList] = await Promise.all([
        fetchLocations(),
        fetchBlindsForLocation(id),
      ]);
      const found = (all as LocationData[]).find(l => l.id === id) ?? null;
      setLocation(found);
      setBlinds(blindList);
      if (found) {
        mapRef.current?.animateToRegion(
          {
            latitude: found.center.lat,
            longitude: found.center.lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          400,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this location.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const startNewBlind = (lat: number, lng: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraftError('');
    setDraft({ id: null, name: '', blindType: 'ground', notes: '', lat, lng });
  };

  const startEditBlind = (b: BlindData) => {
    setDraftError('');
    setDraft({
      id: b.id,
      name: b.name,
      blindType: b.blind_type,
      notes: b.notes ?? '',
      lat: b.lat,
      lng: b.lng,
    });
  };

  const dropAtMyLocation = async () => {
    const coords = await locate();
    if (!coords) return;
    mapRef.current?.animateToRegion(
      { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      600,
    );
    startNewBlind(coords.lat, coords.lng);
  };

  const saveBlind = async () => {
    if (!draft) return;
    setDraftError('');
    if (!draft.name.trim()) {
      setDraftError('Give this blind a title');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        blind_type: draft.blindType,
        notes: draft.notes,
        lat: draft.lat,
        lng: draft.lng,
      };
      if (draft.id) await updateBlind(draft.id, payload);
      else await createBlind(id, payload);
      setDraft(null);
      setBlinds(await fetchBlindsForLocation(id));
    } catch (err: unknown) {
      setDraftError(err instanceof Error ? err.message : 'Failed to save blind');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteBlind = (b: BlindData) => {
    Alert.alert(`Delete "${b.name}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBlind(b.id);
            setBlinds(await fetchBlindsForLocation(id));
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to delete blind');
          }
        },
      },
    ]);
  };

  const confirmDeleteLocation = () => {
    if (!location) return;
    Alert.alert(
      `Delete "${location.name}"?`,
      'This will also delete all blinds at this location. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocation(location.id);
              router.back();
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : 'Failed to delete location');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Not found" onBack={() => router.back()} backLabel="Locations" />
        <View style={styles.pad}>
          <ErrorBanner message={error || 'That location no longer exists.'} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title={location.name}
          eyebrow={locationTypeLabel(location.location_type)}
          onBack={() => router.back()}
          backLabel="Locations"
          actions={[{
            symbol: 'trash',
            ion: 'trash-outline',
            label: 'Delete this location',
            onPress: confirmDeleteLocation,
            danger: true,
          }]}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ErrorBanner message={error} />
          {posError ? <ErrorBanner message={positionErrorMessage(posError)} /> : null}

          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: location.center.lat,
                longitude: location.center.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              mapType="hybrid"
              showsUserLocation
              showsMyLocationButton={false}
              onPress={e =>
                startNewBlind(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
              }
            >
              <Marker
                coordinate={{ latitude: location.center.lat, longitude: location.center.lng }}
                title={location.name}
                pinColor={colors.textMuted}
              />
              {blinds.map(b => (
                <Marker
                  key={b.id}
                  coordinate={{ latitude: b.lat, longitude: b.lng }}
                  title={b.name}
                  description={blindTypeLabel(b.blind_type)}
                  pinColor={colors.accent}
                  onCalloutPress={() => startEditBlind(b)}
                />
              ))}
              {draft ? (
                <Marker
                  coordinate={{ latitude: draft.lat, longitude: draft.lng }}
                  pinColor={colors.accentSecondary}
                  draggable
                  onDragEnd={e =>
                    setDraft(d =>
                      d
                        ? {
                            ...d,
                            lat: e.nativeEvent.coordinate.latitude,
                            lng: e.nativeEvent.coordinate.longitude,
                          }
                        : d,
                    )
                  }
                />
              ) : null}
            </MapView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Drop a blind where I'm standing"
              onPress={dropAtMyLocation}
              disabled={locating}
              style={({ pressed }) => [styles.gpsBtn, pressed && { opacity: 0.7 }]}
            >
              {locating ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  {Platform.OS === 'ios' ? (
                    <SymbolView name="location.fill" tintColor={colors.text} size={15} />
                  ) : null}
                  <Text style={styles.gpsLabel}>Blind here</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Tap the map to mark a blind, or use “Blind here” to drop one where you’re standing.
          </Text>

          <PlaceSearch
            onPick={coords => {
              mapRef.current?.animateToRegion(
                { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 },
                600,
              );
              // Moves the pin of a blind already being drafted rather than
              // starting over — a name already typed must not be lost.
              setDraft(d =>
                d ? { ...d, lat: coords.lat, lng: coords.lng } : {
                  id: null, name: '', blindType: 'ground', notes: '',
                  lat: coords.lat, lng: coords.lng,
                },
              );
            }}
          />

          {draft ? (
            <Card style={styles.draftCard}>
              <View style={styles.draftHead}>
                <View style={styles.flex}>
                  <Text style={styles.draftTitle}>{draft.id ? 'EDIT BLIND' : 'ADD BLIND'}</Text>
                  <Text style={styles.coords}>
                    {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
                  </Text>
                </View>
                <Pressable hitSlop={12} onPress={() => setDraft(null)} accessibilityLabel="Cancel">
                  <Text style={styles.dismiss}>Cancel</Text>
                </Pressable>
              </View>

              <ErrorBanner message={draftError} />

              <Field
                label="Blind"
                value={draft.name}
                onChangeText={v => setDraft(d => (d ? { ...d, name: v } : d))}
                placeholder="Call it something — North Pit, Point Blind…"
                autoFocus
                returnKeyType="done"
              />

              <View style={styles.block}>
                <SectionLabel>Type</SectionLabel>
                <View style={styles.chipGrid}>
                  {BLIND_TYPES.map(t => {
                    const selected = draft.blindType === t;
                    return (
                      <Pressable
                        key={t}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setDraft(d => (d ? { ...d, blindType: t } : d))}
                        style={({ pressed }) => [
                          styles.chip,
                          selected && styles.chipOn,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                          {blindTypeLabel(t)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Field
                label="Notes"
                value={draft.notes}
                onChangeText={v => setDraft(d => (d ? { ...d, notes: v } : d))}
                placeholder="Optional"
                multiline
                numberOfLines={3}
                style={styles.notes}
              />

              <Button
                label={saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Save Blind'}
                onPress={saveBlind}
                loading={saving}
              />
            </Card>
          ) : null}

          <View style={styles.block}>
            <SectionLabel>{`${blinds.length} ${blinds.length === 1 ? 'Blind' : 'Blinds'}`}</SectionLabel>
            {blinds.length === 0 ? (
              <Text style={styles.hint}>No blinds marked here yet.</Text>
            ) : (
              blinds.map(b => (
                <Pressable
                  key={b.id}
                  onPress={() => startEditBlind(b)}
                  onLongPress={() => confirmDeleteBlind(b)}
                  style={({ pressed }) => [styles.blindRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.blindName}>{b.name.toUpperCase()}</Text>
                    <Text style={styles.blindMeta}>
                      {blindTypeLabel(b.blind_type)} · {b.lat.toFixed(4)}, {b.lng.toFixed(4)}
                    </Text>
                  </View>
                  {Platform.OS === 'ios' ? (
                    <SymbolView name="chevron.right" tintColor={colors.textMuted} size={14} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pad: { paddingHorizontal: space.lg },
  loader: { marginTop: space.xxl },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.lg },

  mapWrap: {
    height: 300,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  // Written out rather than StyleSheet.absoluteFillObject: RN 0.86's types
  // no longer expose that helper, though it still exists at runtime.
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gpsBtn: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  gpsLabel: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  hint: { ...type.bodySmall, color: colors.textMuted },
  block: { gap: space.sm },

  draftCard: { gap: space.lg },
  draftHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  draftTitle: { ...type.sectionTitle, color: colors.text },
  dismiss: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  coords: { ...type.bodySmall, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  notes: { minHeight: 80, textAlignVertical: 'top' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  chipTextOn: { color: colors.textInverse },

  blindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  blindName: { ...type.sectionTitle, fontSize: 18, lineHeight: 22, color: colors.text },
  blindMeta: { ...type.bodySmall, color: colors.textMuted },
});
