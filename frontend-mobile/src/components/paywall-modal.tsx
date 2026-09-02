import { Modal, Platform, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/auth';
import { colors, type, space, radius } from '@/constants/theme';

/* Ported from frontend-web/src/components/PaywallModal.tsx, copy included.
 *
 * The governing rule: never blur locked content. This names what Pro adds in a
 * plain list. A blurred chart reads as a tax on data the user already earned,
 * which is why there is no preview here at all — just a description. */
export type PaywallReason = 'stats' | 'weather' | 'export' | 'forecast';

// Logging is unlimited on free, so nothing here sells hunt capacity. What Pro
// sells is the reading of those hunts: the forecast ahead, the patterns behind.
const FEATURES = [
  'The whole week ranked, at every spot',
  'Which blind to sit, matched to the wind',
  'Scores tuned to what has produced for you',
  'Your season explained — species, spots, weather',
  'The full conditions on every hunt, plus CSV export',
];

const TITLES: Record<PaywallReason, string> = {
  stats: 'The rest of your season — Pro',
  weather: 'Weather Data — Pro',
  export: 'Data Export — Pro',
  forecast: 'The rest of the week — Pro',
};

const DESCRIPTIONS: Record<PaywallReason, string> = {
  stats: 'You keep your season totals for free. Pro shows what is behind them — every species, blind, and condition that shaped the year.',
  weather: 'Pro opens the full conditions on every hunt — sky, temperature, pressure, and the wind hour by hour through your sit.',
  export: 'Exporting your hunt history as CSV requires Pro.',
  forecast: 'Free covers today and tomorrow at one spot. Pro scores all seven days at every location you hunt.',
};

export function PaywallModal({
  visible,
  reason = 'forecast',
  onClose,
}: {
  visible: boolean;
  reason?: PaywallReason;
  onClose: () => void;
}) {
  const { isPaused } = useAuth();
  const router = useRouter();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.cardInner}>
            <View style={styles.headBlock}>
              <Text style={styles.title}>
                {isPaused ? 'YOUR PRO IS PAUSED' : TITLES[reason].toUpperCase()}
              </Text>
              <Text style={styles.body}>
                {isPaused
                  ? 'Resume your subscription to get this back — your hunt history is untouched.'
                  : DESCRIPTIONS[reason]}
              </Text>
            </View>

            <View style={styles.featureBox}>
              <Text style={styles.featureLabel}>PRO INCLUDES</Text>
              {FEATURES.map(f => (
                <View key={f} style={styles.featureRow}>
                  {Platform.OS === 'ios' ? (
                    <SymbolView name="checkmark" tintColor={colors.accent} size={14} />
                  ) : (
                    <Ionicons name="checkmark" size={16} color={colors.accent} />
                  )}
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push('/(tabs)/profile');
              }}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.ctaText}>
                {isPaused ? 'Resume Pro' : 'Go Pro — from $4.17/mo'}
              </Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={onClose} style={styles.later}>
              <Text style={styles.laterText}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(19, 20, 26, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
  },
  cardInner: { padding: space.xl, gap: space.xl },
  headBlock: { gap: space.sm },
  title: { ...type.screenTitle, color: colors.text, letterSpacing: 1 },
  body: { ...type.bodySmall, color: colors.textMuted },

  featureBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.lg,
    gap: space.md,
  },
  featureLabel: { ...type.label, color: colors.textMuted },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  featureText: { ...type.bodySmall, flex: 1, color: colors.text },

  cta: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...type.button, color: colors.textInverse },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { ...type.bodySmall, color: colors.textMuted },
});
