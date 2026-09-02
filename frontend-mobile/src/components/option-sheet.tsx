import { FlatList, Modal, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SpeciesIcon } from '@/components/species-icon';
import { colors, type, space, radius } from '@/constants/theme';

/* Stands in for the web app's <select>.
 *
 * This is the interaction half of the rules, where native wins: a dropdown has
 * no iOS equivalent, and a wheel picker holding 30-odd species is unusable. A
 * searchable full-height sheet is what iOS apps actually do, and it keeps the
 * same job — pick exactly one from a list. */
export interface Option {
  value: string;
  label: string;
}

export function OptionSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  showSpeciesIcons = false,
  emptyMessage,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selected?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  showSpeciesIcons?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.head}>
          <Text style={styles.title}>{title.toUpperCase()}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => pressed && { opacity: 0.5 }}
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <FlatList
          data={options}
          keyExtractor={item => item.value}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            emptyMessage ? <Text style={styles.empty}>{emptyMessage}</Text> : null
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => {
            const on = item.value === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
              >
                {showSpeciesIcons ? <SpeciesIcon species={item.label} size={32} /> : null}
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                {on ? (
                  Platform.OS === 'ios' ? (
                    <SymbolView name="checkmark" tintColor={colors.accent} size={16} />
                  ) : (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  )
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

/* The trigger that opens one. Looks like a form field so it reads as the same
 * control the web app has, not as a button that happens to be there. */
export function OptionField({
  label,
  value,
  placeholder,
  onPress,
  hint,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        onPress={onPress}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {Platform.OS === 'ios' ? (
          <SymbolView name="chevron.up.chevron.down" tintColor={colors.textMuted} size={13} />
        ) : (
          <Ionicons name="chevron-expand-outline" size={15} color={colors.textMuted} />
        )}
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  title: { ...type.sectionTitle, color: colors.text },
  done: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl },
  divider: { height: 1, backgroundColor: colors.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  rowLabel: { ...type.body, flex: 1, color: colors.text },
  empty: { ...type.bodySmall, color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },

  fieldBlock: { gap: space.sm },
  fieldLabel: { ...type.label, color: colors.textMuted },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  triggerText: { ...type.body, flex: 1, color: colors.text },
  triggerPlaceholder: { color: colors.textMuted },
  hint: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
});
