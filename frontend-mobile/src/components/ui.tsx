import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors, type, space, radius } from '@/constants/theme';

/* The shared kit. Screens compose these rather than restyling a Pressable each
 * time — the web app's consistency comes from Tailwind classes it can't bring
 * along, so on native that consistency has to live in components. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  const isOff = disabled || loading;

  const handlePress = () => {
    // Every committing tap gets a light tick. iOS users read its absence as an
    // app that didn't register the press.
    if (variant === 'danger') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: loading }}
      onPress={handlePress}
      disabled={isOff}
      style={({ pressed }) => [
        styles.btn,
        btnVariant[variant],
        fullWidth && { alignSelf: 'stretch' },
        pressed && !isOff && styles.btnPressed,
        isOff && styles.btnOff,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.textInverse : colors.text} />
      ) : (
        <Text style={[styles.btnLabel, btnLabelVariant[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const btnVariant: Record<ButtonVariant, object> = {
  primary: { backgroundColor: colors.text },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
};

const btnLabelVariant: Record<ButtonVariant, object> = {
  primary: { color: colors.textInverse },
  secondary: { color: colors.text },
  ghost: { color: colors.textMuted },
  danger: { color: colors.textInverse },
};

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  onHintPress?: () => void;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, onHintPress, style, ...rest },
  ref,
) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
        {hint ? (
          <Text style={styles.fieldHint} onPress={onHintPress}>
            {hint}
          </Text>
        ) : null}
      </View>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
});

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

/* Errors get their own block rather than an Alert. A modal steals the form the
 * user is trying to correct, and on a failed sign-in the message needs to sit
 * next to the fields it refers to. */
export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48, // iOS wants 44pt minimum; 48 leaves room for gloved hands.
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnPressed: { opacity: 0.75 },
  btnOff: { opacity: 0.45 },
  btnLabel: { ...type.button },

  field: { gap: space.sm },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  fieldLabel: { ...type.label, color: colors.textMuted },
  fieldHint: { ...type.bodySmall, color: colors.textMuted },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 48,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.lg,
  },

  sectionLabel: { ...type.label, color: colors.textMuted },

  errorBanner: {
    backgroundColor: '#FDECEA',
    borderWidth: 1,
    borderColor: '#F5C6C0',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  errorText: { ...type.bodySmall, color: '#8C1D18' },

  empty: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { ...type.sectionTitle, color: colors.text, textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
