import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from '@/constants/theme';

/* WMO weather code → icon, buckets copied verbatim from wmoCategory() in
 * frontend-web/src/pages/hunts/HuntList.tsx. The thresholds are the WMO table,
 * not taste; do not "tidy" them.
 *
 * The web app hand-draws six Feather-style SVGs. On iOS the same six concepts
 * exist as SF Symbols, so this draws those instead — same meaning, in the
 * platform's own icon language, per the native-conventions rule. */
type Category = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunder';

export function wmoCategory(code: number | undefined | null): Category {
  if (code == null) return 'clear';
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'clear';
}

const SF: Record<Category, string> = {
  clear: 'sun.max',
  cloudy: 'cloud',
  fog: 'cloud.fog',
  rain: 'cloud.rain',
  snow: 'snowflake',
  thunder: 'cloud.bolt',
};

const ION: Record<Category, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny-outline',
  cloudy: 'cloud-outline',
  fog: 'reorder-three-outline',
  rain: 'rainy-outline',
  snow: 'snow-outline',
  thunder: 'thunderstorm-outline',
};

export function ConditionIcon({
  code,
  size = 14,
  color = colors.textMuted,
}: {
  code: number | undefined | null;
  size?: number;
  color?: string;
}) {
  const cat = wmoCategory(code);
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={SF[cat] as never}
        tintColor={color}
        size={size}
        resizeMode="scaleAspectFit"
        fallback={<Ionicons name={ION[cat]} size={size} color={color} />}
      />
    );
  }
  return <Ionicons name={ION[cat]} size={size} color={color} />;
}
