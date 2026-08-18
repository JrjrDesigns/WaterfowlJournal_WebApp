import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MapView, { Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';

import { Button, ErrorBanner, Field, SectionLabel } from '@/components/ui';
import { PlaceSearch } from '@/components/place-search';
import { ScreenHeader } from '@/components/screen-header';
import { useCurrentPosition, positionErrorMessage, type Coords } from '@/hooks/use-current-position';
import { createLocation } from '@/utils/api';
import { LOCATION_TYPES } from '@/constants/domain';
import { colors, type, space, radius } from '@/constants/theme';

// Continental US, so an un-located map opens on something recognisable rather
// than the middle of the Atlantic.
const FALLBACK_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

const SPOT_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

export default function NewLocation() {
  const [name, setName] = useState('');
  const [locType, setLocType] = useState<string>('marsh');
  const [center, setCenter] = useState<Coords | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { locate, locating, error: posError, openSettings } = useCurrentPosition();

  /* If permission was granted on a previous visit, centre on the user quietly.
   * If it wasn't, do NOT prompt on mount — a permission dialog before the user
   * has asked for anything is the fastest way to get a permanent no. */
  useEffect(() => {
    (async () => {
      const { granted } = await Location.getForegroundPermissionsAsync();
      setHasLocationPermission(granted);
      if (!granted) return;
      try {
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        mapRef.current?.animateToRegion(
          { latitude: fix.coords.latitude, longitude: fix.coords.longitude, ...SPOT_DELTA },
          600,
        );
      } catch {
        // No fix on open is not worth an error — the map still works.
      }
    })();
  }, []);

  const useMyLocation = async () => {
    const coords = await locate();
    if (!coords) return;
    setHasLocationPermission(true);
    setCenter(coords);
    mapRef.current?.animateToRegion(
      { latitude: coords.lat, longitude: coords.lng, ...SPOT_DELTA },
      600,
    );
  };

  const save = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give this location a title');
      return;
    }
    if (!center) {
      setError('Tap the map to set the center point');
      return;
    }
    setSaving(true);
    try {
      const created = await createLocation({
        name: name.trim(),
        location_type: locType,
        center,
      });
      // Replace rather than push: dismissing the sheet and landing on the new
      // location is one motion, and back should not return to a filled form
      // that would create a duplicate if resubmitted.
      router.replace({ pathname: '/(tabs)/locations/[id]', params: { id: created.id } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title="New Location"
          actions={[{
            symbol: 'xmark',
            ion: 'close',
            label: 'Cancel',
            onPress: () => router.back(),
          }]}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.intro}>
            A location is the whole area you hunt — a marsh, a field, a stretch of river. Once it’s
            saved, you’ll drop a pin for each blind inside it.
          </Text>

          <ErrorBanner message={error} />

          <Field
            label="What You Call It"
            value={name}
            onChangeText={setName}
            placeholder="Big Timber Marsh"
            autoCorrect={false}
            returnKeyType="done"
          />

          <View style={styles.block}>
            <SectionLabel>Location Type</SectionLabel>
            <View style={styles.chipGrid}>
              {LOCATION_TYPES.map(t => {
                const selected = locType === t.value;
                return (
                  <Pressable
                    key={t.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setLocType(t.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && styles.chipOn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.block}>
            <SectionLabel>Center of the Area</SectionLabel>
            <Text style={styles.hint}>
              This just centers the map here — you’ll mark the actual blinds next.
            </Text>

            {posError ? <ErrorBanner message={positionErrorMessage(posError)} /> : null}
            {posError === 'blocked' ? (
              <Pressable onPress={openSettings} hitSlop={8}>
                <Text style={styles.settingsLink}>Open Settings</Text>
              </Pressable>
            ) : null}

            <View style={styles.mapWrap}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={FALLBACK_REGION}
                // Satellite with roads and labels, matching the web app's Esri
                // hybrid tiles — on iOS this is Apple's own imagery, which is
                // both sharper and free of a third-party tile dependency.
                mapType="hybrid"
                showsUserLocation={hasLocationPermission}
                showsMyLocationButton={false}
                onPress={e => setCenter({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })}
              >
                {center ? (
                  <Marker
                    coordinate={{ latitude: center.lat, longitude: center.lng }}
                    pinColor={colors.accent}
                    draggable
                    onDragEnd={e => setCenter({
                      lat: e.nativeEvent.coordinate.latitude,
                      lng: e.nativeEvent.coordinate.longitude,
                    })}
                  />
                ) : null}
              </MapView>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use my current location"
                onPress={useMyLocation}
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
                    <Text style={styles.gpsLabel}>Use my location</Text>
                  </>
                )}
              </Pressable>
            </View>

            <PlaceSearch
              onPick={coords => {
                setCenter(coords);
                setError('');
                mapRef.current?.animateToRegion(
                  { latitude: coords.lat, longitude: coords.lng, ...SPOT_DELTA },
                  600,
                );
              }}
            />

            <Text style={styles.coords}>
              {center
                ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
                : 'Search to navigate, then tap to drop your center pin'}
            </Text>
          </View>

          <Button
            label={saving ? 'Saving…' : 'Save Location'}
            onPress={save}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  intro: { ...type.body, color: colors.textMuted },
  block: { gap: space.sm },
  hint: { ...type.bodySmall, color: colors.textMuted },

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

  mapWrap: {
    height: 280,
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
  coords: { ...type.bodySmall, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  settingsLink: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
});
