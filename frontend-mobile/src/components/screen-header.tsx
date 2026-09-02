import { Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { colors, type, space } from '@/constants/theme';

/* The screen title block. Bebas, uppercase, with an optional Back control above
 * and up to a few actions on the right — the web app's pattern, close enough to
 * a large iOS title to read as native rather than as a ported web header. */
export interface HeaderAction {
  /** SF Symbol name, used on iOS. */
  symbol: string;
  /** Ionicon name, used on Android. */
  ion: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export function ScreenHeader({
  title,
  eyebrow,
  actions = [],
  onBack,
  backLabel = 'Back',
}: {
  title: string;
  eyebrow?: string;
  actions?: HeaderAction[];
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <View>
      {/* An explicit Back control, by the owner's decision, even though the
          edge-swipe still works. Swipe-back is invisible — discoverable only if
          you already know it exists — and this app gets used outdoors in
          gloves. A visible target costs one row of chrome and never has to be
          guessed at. */}
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={12}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
        >
          {Platform.OS === 'ios' ? (
            <SymbolView name="chevron.left" tintColor={colors.textMuted} size={17} />
          ) : (
            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          )}
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <View style={styles.titleBlock}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={styles.title} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
        </View>

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map(action => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                hitSlop={12}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  action.onPress();
                }}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.5 }]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name={action.symbol as never}
                    tintColor={action.danger ? colors.danger : colors.text}
                    size={24}
                  />
                ) : (
                  <Ionicons
                    name={action.ion}
                    size={24}
                    color={action.danger ? colors.danger : colors.text}
                  />
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    minHeight: 44, // iOS minimum touch target
    paddingRight: space.md,
    paddingLeft: space.lg - 4, // optical alignment with the title below
  },
  backLabel: { ...type.body, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.label, color: colors.textMuted, marginBottom: 2 },
  title: { ...type.screenTitle, color: colors.text, letterSpacing: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { padding: space.xs },
});
