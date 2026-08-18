import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SpeciesIcon } from '@/components/species-icon';
import { colors, type, space, radius } from '@/constants/theme';

/* Ported from frontend-web/src/components/HarvestEntryCard.tsx, including its
 * confirmed/editing split: a confirmed entry collapses to a one-line summary so
 * a five-species bag does not become five open forms. */

export interface Harvest {
  species: string;
  harvested: number;
  missed: number;
  shot_not_recovered: number;
  seen: number;
  mine: number;
  confirmed?: boolean;
}

const summarize = (h: Harvest, hasParty: boolean): string => {
  const parts: string[] = [];
  if (h.seen > 0) parts.push(`${h.seen} seen`);
  if (h.harvested > 0) parts.push(`${h.harvested} ${hasParty ? 'party' : 'harvested'}`);
  if (hasParty && h.mine > 0) parts.push(`${h.mine} mine`);
  if (h.missed > 0) parts.push(`${h.missed} missed`);
  if (h.shot_not_recovered > 0) parts.push(`${h.shot_not_recovered} lost`);
  return parts.length > 0 ? parts.join(' · ') : 'No harvest recorded';
};

/**
 * A count box that can sit empty while you type.
 *
 * Writing `parseInt('') || 0` back on every keystroke means backspacing the last
 * digit instantly re-renders a "0" that can never be cleared. Holding the raw
 * text locally lets the box stay empty until blur. This bug and its fix are
 * inherited from the web version — do not "simplify" it back into a controlled
 * numeric field.
 */
function CountInput({
  value,
  max,
  onChange,
}: {
  value: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <TextInput
      value={draft ?? String(value)}
      onChangeText={text => {
        const digits = text.replace(/[^0-9]/g, '');
        const parsed = digits === '' ? 0 : parseInt(digits, 10);
        const clamped = max !== undefined ? Math.min(parsed, max) : parsed;
        setDraft(clamped === parsed ? digits : String(clamped));
        onChange(clamped);
      }}
      onBlur={() => setDraft(null)}
      keyboardType="number-pad"
      selectTextOnFocus
      style={styles.count}
      textAlign="center"
    />
  );
}

const COUNT_FIELDS = [
  ['seen', 'Seen'],
  ['harvested', 'Harvested'],
  ['missed', 'Missed'],
  ['shot_not_recovered', 'Lost'],
] as const;

export function HarvestEntryCard({
  harvest,
  index,
  allSpecies,
  hasParty,
  onUpdate,
  onRemove,
  onPickSpecies,
}: {
  harvest: Harvest;
  index: number;
  allSpecies: string[];
  hasParty: boolean;
  onUpdate: (field: keyof Harvest, value: string | number | boolean) => void;
  onRemove: () => void;
  /* Species selection is a full-screen native picker rather than a dropdown —
   * 30+ options in a wheel is unusable, and this is the interaction half of the
   * rules, where native wins. The parent owns the picker. */
  onPickSpecies: () => void;
}) {
  if (harvest.confirmed) {
    return (
      <View style={styles.confirmed}>
        <SpeciesIcon species={harvest.species} size={40} />
        <View style={styles.grow}>
          <Text style={styles.speciesName} numberOfLines={1}>
            {harvest.species}
          </Text>
          <Text style={styles.summary}>{summarize(harvest, hasParty)}</Text>
        </View>
        <IconButton label="Edit this entry" symbol="pencil" ion="pencil" onPress={() => onUpdate('confirmed', false)} />
        <IconButton label="Remove this entry" symbol="trash" ion="trash-outline" onPress={onRemove} danger />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.entryLabel}>ENTRY {index + 1}</Text>
        <IconButton label="Remove this entry" symbol="trash" ion="trash-outline" onPress={onRemove} danger />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Species: ${harvest.species || 'none selected'}`}
        onPress={onPickSpecies}
        style={({ pressed }) => [styles.speciesRow, pressed && { opacity: 0.7 }]}
      >
        <SpeciesIcon species={harvest.species} size={36} />
        <Text style={[styles.speciesPick, !harvest.species && styles.speciesPickEmpty]} numberOfLines={1}>
          {harvest.species || 'Choose a species…'}
        </Text>
        {Platform.OS === 'ios' ? (
          <SymbolView name="chevron.up.chevron.down" tintColor={colors.textMuted} size={13} />
        ) : (
          <Ionicons name="chevron-expand-outline" size={15} color={colors.textMuted} />
        )}
      </Pressable>

      <View style={styles.countGrid}>
        {COUNT_FIELDS.map(([field, label]) => (
          <View key={field} style={styles.countCell}>
            <Text style={styles.countLabel}>{label}</Text>
            <CountInput value={harvest[field]} onChange={n => onUpdate(field, n)} />
          </View>
        ))}
      </View>

      {hasParty ? (
        <View style={styles.mineBlock}>
          <Text style={styles.countLabel}>Mine (of the {harvest.harvested} harvested)</Text>
          <View style={styles.mineBox}>
            <CountInput value={harvest.mine} max={harvest.harvested} onChange={n => onUpdate('mine', n)} />
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => onUpdate('confirmed', true)}
        style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.8 }]}
      >
        {Platform.OS === 'ios' ? (
          <SymbolView name="checkmark" tintColor={colors.textInverse} size={14} />
        ) : (
          <Ionicons name="checkmark" size={15} color={colors.textInverse} />
        )}
        <Text style={styles.confirmText}>Confirm</Text>
      </Pressable>
    </View>
  );
}

function IconButton({
  label,
  symbol,
  ion,
  onPress,
  danger = false,
}: {
  label: string;
  symbol: string;
  ion: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView name={symbol as never} tintColor={tint} size={17} />
      ) : (
        <Ionicons name={ion} size={18} color={tint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },

  confirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: space.md,
  },
  speciesName: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  summary: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryLabel: { ...type.label, color: colors.textMuted },
  iconBtn: { padding: 2 },

  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 52,
  },
  speciesPick: { ...type.body, flex: 1, color: colors.text },
  speciesPickEmpty: { color: colors.textMuted },

  countGrid: { flexDirection: 'row', gap: space.sm },
  countCell: { flex: 1, gap: space.xs },
  countLabel: { ...type.label, fontSize: 11, color: colors.textMuted },
  count: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    minHeight: 48,
  },

  mineBlock: { gap: space.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.md },
  mineBox: { width: 96 },

  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    minHeight: 48,
  },
  confirmText: { ...type.button, fontSize: 15, color: colors.textInverse },
});
