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
import * as WebBrowser from 'expo-web-browser';

import LogoStacked from '@/assets/brand/logo-stacked.svg';
import { Button, Card, ErrorBanner, Field } from '@/components/ui';
import { useAuth } from '@/contexts/auth';
import { colors, type, space } from '@/constants/theme';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { register } = useAuth();

  const submit = async () => {
    setError('');
    if (!name || !email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  /* Terms and privacy open in an in-app browser sheet rather than kicking the
   * user out to Safari mid-signup — they swipe down and their half-filled form
   * is still there. */
  const openLegal = (path: string) =>
    WebBrowser.openBrowserAsync(`https://blindguideapp.com/${path}`);

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
            <Text style={styles.tagline}>Start logging your hunts today</Text>
          </View>

          <Card style={styles.card}>
            <ErrorBanner message={error} />

            <Field
              label="Full Name"
              value={name}
              onChangeText={setName}
              placeholder="John Hunter"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
            />

            <Field
              ref={emailRef}
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
              placeholder="Min 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <Button
              label={loading ? 'Creating account…' : 'Create Account'}
              onPress={submit}
              loading={loading}
            />

            <Text style={styles.legal}>
              By creating an account you agree to our{' '}
              <Text style={styles.link} onPress={() => openLegal('terms')}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text style={styles.link} onPress={() => openLegal('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>

            <Text style={styles.footer}>
              Already have an account?{' '}
              <Link href="/(auth)/login" style={styles.link}>
                Sign in
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
  legal: { ...type.bodySmall, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
  footer: { ...type.bodySmall, color: colors.textMuted, textAlign: 'center' },
  link: { color: colors.text, fontFamily: 'WorkSans_600SemiBold' },
});
