import { ScrollView, Text, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, type, space } from '@/constants/theme';

/* Hour-by-hour wind through the sit — the Pro half of the conditions panel.
 * Ported from WindStrips in frontend-web/src/pages/hunts/HuntDetail.tsx.
 *
 * The arrow is rotated by direction + 180 because a meteorological wind
 * direction is where the wind comes FROM, and the arrow should point where it
 * is going. Getting that backwards silently tells a hunter to sit the wrong
 * side of a blind. */
export interface WindEntry {
  time: string;
  speed: number;
  direction: number;
  cardinal: string;
}

const windColor = (speed: number): string => {
  if (speed < 5) return colors.textMuted;
  if (speed < 12) return colors.accent;
  if (speed < 20) return '#B45309';
  return colors.danger;
};

const fmtHour = (iso: string): string => {
  const d = new Date(iso);
  const h = d.getHours();
  const suffix = h >= 12 ? 'p' : 'a';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${suffix}`;
};

function Entry({ entry }: { entry: WindEntry }) {
  const color = windColor(entry.speed);
  return (
    <View style={styles.entry}>
      <Text style={styles.hour}>{fmtHour(entry.time)}</Text>
      <Svg width={20} height={20} viewBox="0 0 22 22" style={{ transform: [{ rotate: `${entry.direction + 180}deg` }] }}>
        <Path d="M11 2 L15 16 L11 13 L7 16 Z" fill={color} />
      </Svg>
      <Text style={[styles.cardinal, { color }]}>{entry.cardinal}</Text>
      <Text style={[styles.speed, { color }]}>{entry.speed}</Text>
    </View>
  );
}

export function WindStrip({
  morning,
  evening,
  showMorning,
  showEvening,
}: {
  morning: WindEntry[];
  evening: WindEntry[];
  showMorning: boolean;
  showEvening: boolean;
}) {
  const m = showMorning ? morning : [];
  const e = showEvening ? evening : [];
  if (m.length === 0 && e.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {m.map((entry, i) => <Entry key={`m${i}`} entry={entry} />)}
      {m.length > 0 && e.length > 0 ? <View style={styles.divider} /> : null}
      {e.map((entry, i) => <Entry key={`e${i}`} entry={entry} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  entry: { alignItems: 'center', gap: 2, width: 40 },
  hour: { ...type.bodySmall, fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  cardinal: { ...type.label, fontSize: 10 },
  speed: { ...type.bodySmall, fontSize: 12, fontFamily: 'WorkSans_600SemiBold', fontVariant: ['tabular-nums'] },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.hairline, marginHorizontal: space.sm },
});
