import { Platform, type ColorValue } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

/* iOS gets real SF Symbols; Android gets the nearest Ionicon.
 *
 * This is the native-conventions rule in miniature — the same tab means the
 * same thing on both platforms, but it is drawn in each platform's own icon
 * language rather than one set of custom art imposed on both. */
type IconName = 'hunts' | 'locations' | 'forecast' | 'stats' | 'profile';

const SF: Record<IconName, SymbolViewProps['name']> = {
  hunts: 'list.bullet.rectangle',
  locations: 'mappin.and.ellipse',
  forecast: 'cloud.sun',
  stats: 'chart.bar',
  profile: 'person.crop.circle',
};

const ION: Record<IconName, keyof typeof Ionicons.glyphMap> = {
  hunts: 'list',
  locations: 'location',
  forecast: 'partly-sunny',
  stats: 'stats-chart',
  profile: 'person-circle',
};

export function TabIcon({
  name,
  color,
  size = 26,
}: {
  name: IconName;
  // Navigator passes a ColorValue, which is wider than string — it can be an
  // opaque platform colour token, not just a hex string.
  color: ColorValue;
  size?: number;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={SF[name]}
        tintColor={color}
        size={size}
        resizeMode="scaleAspectFit"
        fallback={<Ionicons name={ION[name]} size={size} color={color} />}
      />
    );
  }
  return <Ionicons name={ION[name]} size={size} color={color} />;
}
