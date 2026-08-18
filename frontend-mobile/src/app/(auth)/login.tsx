import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import LogoStacked from '@/assets/brand/logo-stacked.svg';
import { Button, Card, ErrorBanner, Field } from '@/components/ui';
import { useAuth } from '@/contexts/auth';
import { colors, type, space } from '@/constants/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const { login } = useAuth();

  const submit = async () => {
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      // Routing happens in the root navigator the moment `user` lands, so there
      // is nothing to navigate to here.
      await login(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <LogoStacked width={200} height={168} />
            <Text style={styles.tagline}>The intelligent waterfowl field journal</Text>
          </View>

          <Card style={styles.card}>
            <ErrorBanner message={error} />

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="hunter@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />

            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <Button label={loading ? 'Signing in…' : 'Sign In'} onPress={submit} loading={loading} />

            <Text style={styles.footer}>
              No account?{' '}
              <Link href="/(auth)/register" style={styles.link}>
                Create one
              </Link>
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  header: { alignItems: 'center', marginBottom: space.xl, gap: space.sm },
  tagline: { ...type.bodySmall, color: colors.textMuted },
  card: { gap: space.lg },
  footer: { ...type.bodySmall, color: colors.textMuted, textAlign: 'center' },
  link: { ...type.bodySmall, color: colors.text, fontFamily: 'WorkSans_600SemiBold' },
});
