import { Image, Platform, View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { locationTypeImage } from '@/constants/domain';
import { colors } from '@/constants/theme';

/* The location-type stub from the web app — a photo of the terrain type with a
 * translucent pin over it, used on both the hunt row and the location row.
 *
 * Width is a prop because the two lists use different widths on web (w-24 for
 * hunts, w-28 for locations); height always comes from the parent row, which
 * must set a real number. A percentage height inside an auto-height parent lets
 * the image size itself and stretches the row — that bug already happened once. */
export function LocationTypeThumb({
  locationType,
  width = 96,
}: {
  locationType: string | null | undefined;
  width?: number;
}) {
  const image = locationType ? locationTypeImage(locationType) : undefined;

  return (
    <View style={[styles.wrap, { width }]}>
      {image ? <Image source={image} style={styles.image} resizeMode="cover" /> : null}
      <View style={styles.pin}>
        {Platform.OS === 'ios' ? (
          <SymbolView name="mappin.and.ellipse" tintColor={PIN} size={22} />
        ) : (
          <Ionicons name="location" size={22} color={PIN} />
        )}
      </View>
    </View>
  );
}

// The web app draws this pin at green/40. Same weight, so a location with no
// photo still reads as a place rather than as a loading failure.
const PIN = 'rgba(27, 94, 69, 0.4)';

const styles = StyleSheet.create({
  wrap: {
    height: '100%',
    backgroundColor: 'rgba(27, 94, 69, 0.10)',
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  pin: { opacity: 1 },
});
