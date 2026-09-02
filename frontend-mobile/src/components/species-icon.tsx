import { Platform, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius } from '@/constants/theme';

/* Species artwork, fetched from the web app rather than bundled.
 *
 * Deliberate, and worth explaining. The house convention is that adding a
 * species means dropping a PNG into frontend-web/public/species-icons/ by slug
 * with no code change (see the species-icons-convention note). Metro can only
 * bundle assets named in a static require, so bundling these would mean editing
 * a map for every new species — quietly breaking that convention. Fetching by
 * URL keeps it intact, and expo-image caches to disk so each icon downloads
 * once per device.
 *
 * The source files are currently ~1.7MB each for a 40px avatar. That is being
 * fixed on the web side; nothing here needs to change when it is.
 */
const BASE = 'https://app.blindguideapp.com/species-icons';

// Mirrors slugify() in frontend-web/src/components/SpeciesIcon.tsx. Keep in step
// or the two apps will disagree about which file a species maps to.
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function SpeciesIcon({ species, size = 40 }: { species: string; size?: number }) {
  if (!species) return <Placeholder size={size} />;

  return (
    <Image
      source={{ uri: `${BASE}/${slugify(species)}.png` }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      contentFit="cover"
      // Disk cache: an icon is fetched once, then read locally forever after —
      // which is what makes this viable in a marsh with no signal.
      cachePolicy="disk"
      transition={150}
      placeholder={undefined}
    />
  );
}

function Placeholder({ size }: { size: number }) {
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
      {Platform.OS === 'ios' ? (
        <SymbolView name="bird" tintColor={colors.textMuted} size={size * 0.55} />
      ) : (
        <Ionicons name="egg-outline" size={size * 0.55} color={colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
});

export { radius };
