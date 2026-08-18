import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState, ErrorBanner } from '@/components/ui';
import { fetchLocations } from '@/utils/api';
import {
  locationTypeImage,
  locationTypeLabel,
  type LocationData,
} from '@/constants/domain';
import { colors, type, space, radius } from '@/constants/theme';

export default function LocationsList() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      setLocations(await fetchLocations());
    } catch (err: unknown) {
      /* The web version swallows this failure and shows an empty list, which
       * reads as "you have no locations" when the truth is "we couldn't ask".
       * Those need to look different, especially to someone standing in a
       * marsh wondering where their spots went. */
      setError(err instanceof Error ? err.message : 'Could not load your locations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch on focus so a location added or deleted on the detail screen is
  // reflected when the user swipes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Locations"
        actions={[{
          symbol: 'plus',
          ion: 'add',
          label: 'Add a location',
          onPress: () => router.push('/(tabs)/locations/new'),
        }]}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.textMuted} />
      ) : (
        <FlatList
          data={locations}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} />
          }
          ListHeaderComponent={error ? <ErrorBanner message={error} /> : null}
          ListEmptyComponent={
            error ? null : (
              <EmptyState
                title="No locations yet"
                body="A location is the whole area you hunt — a marsh, a field, a stretch of river. Add one, then drop a pin for each blind inside it."
              />
            )
          }
          renderItem={({ item }) => (
            <LocationRow
              location={item}
              onPress={() => router.push({ pathname: '/(tabs)/locations/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function LocationRow({
  location,
  onPress,
}: {
  location: LocationData;
  onPress: () => void;
}) {
  const image = locationTypeImage(location.location_type);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.thumb}>
        {image ? (
          <Image source={image} style={styles.thumbImage} resizeMode="cover" />
        ) : null}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowType}>{locationTypeLabel(location.location_type).toUpperCase()}</Text>
        <Text style={styles.rowName} numberOfLines={1}>
          {location.name.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: space.xxl },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },

  /* Height is fixed, not a minimum. The thumbnail fills its parent by
   * percentage, and a percentage of an unresolved height leaves the image free
   * to size itself — which stretched a single card to the full screen. One of
   * the two has to be a real number; this is the one. */
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    height: 96,
  },
  rowPressed: { opacity: 0.7 },
  thumb: {
    width: 96,
    height: '100%',
    backgroundColor: colors.hairline,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
  },
  thumbImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: 2 },
  rowType: { ...type.label, color: colors.textMuted },
  rowName: { ...type.sectionTitle, fontSize: 24, lineHeight: 28, color: colors.text },
});
