import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format } from 'date-fns';

import { Button, ErrorBanner, Field } from '@/components/ui';
import { ScreenHeader } from '@/components/screen-header';
import { PaywallModal } from '@/components/paywall-modal';
import { useAuth } from '@/contexts/auth';
import {
  API_URL,
  createCheckoutSession,
  createCustomerPortalSession,
  pauseSubscription,
  resumeSubscription,
  requestAccountDeletion,
  restoreAccount,
} from '@/utils/api';
import { secureGet, TOKEN_KEY } from '@/utils/storage';
import {
  attachListeners,
  buy,
  connect,
  disconnect,
  iapSupported,
  loadProducts,
  openManageSubscriptions,
  restore,
  syncActiveSubscriptions,
  PRODUCT_IDS,
  type StoreProduct,
} from '@/utils/iap';
import { colors, type, space, radius } from '@/constants/theme';

const DELETION_GRACE_DAYS = 30;
const PAUSE_CHOICES = [1, 3, 6] as const;

const formatUnix = (seconds?: number | null): string | null =>
  seconds ? format(new Date(seconds * 1000), 'MMM d, yyyy') : null;

export default function Profile() {
  const { user, isPro, isPaused, logout, refreshUser } = useAuth();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const [showManage, setShowManage] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [pauseMonths, setPauseMonths] = useState<number>(3);

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const deletionDate = formatUnix(user?.deletion_scheduled_for);
  const resumeDate = formatUnix(user?.subscription_resumes_at);

  /* Subscription state changes off-device — a renewal, a card failure, a
   * cancellation from the billing portal or the App Store — so re-read the user
   * on focus rather than trusting the cached copy. */
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser]),
  );

  /* Open the StoreKit connection once for the life of this screen, and keep the
   * purchase listener attached the whole time it is mounted.
   *
   * The listener matters more than the buy button: a purchase can land while the
   * app is backgrounded, be restored from another device, or renew a year later,
   * and none of those come back through the call that started them. */
  useEffect(() => {
    if (!iapSupported) return;

    let detach = () => {};
    let cancelled = false;

    (async () => {
      try {
        await connect();
        if (cancelled) return;

        detach = attachListeners({
          onGranted: async () => {
            setError('');
            await refreshUser();
          },
          onError: setError,
        });

        // Prices come from the store, localised — never hardcoded here.
        setProducts(await loadProducts());

        /* Self-healing pass: if a renewal was recorded at Apple but never
         * reached our backend, this repairs it on app open. */
        if (await syncActiveSubscriptions()) await refreshUser();
      } catch {
        /* A store that will not connect must not break the rest of Profile —
         * signing out, exporting and deleting all still have to work. */
      }
    })();

    return () => {
      cancelled = true;
      detach();
      disconnect();
    };
  }, [refreshUser]);

  const priceFor = (plan: 'monthly' | 'annual'): string | null =>
    products.find(p => p.id === PRODUCT_IDS[plan])?.displayPrice ?? null;

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(null);
    }
  };

  /* Purchases go through StoreKit, as guideline 3.1.1 requires for digital
   * subscriptions. Stripe is still how the WEB app charges, which is why the
   * backend reconciles Apple transactions and Stripe webhooks into one
   * subscription_status — see /api/subscription/apple/verify.
   *
   * Nothing here grants Pro. `buy` opens Apple's sheet and returns; the
   * transaction arrives on the listener above, goes to the server for signature
   * verification, and only a server-confirmed result flips the account. */
  const subscribe = () =>
    run(
      'subscribe',
      async () => {
        if (!iapSupported) {
          // Only reachable in the web dev target, which is not a shipped surface.
          throw new Error('Purchases are only available in the app.');
        }
        await buy(plan);
      },
      'Could not start the purchase',
    );

  const restorePurchases = () =>
    run(
      'restore',
      async () => {
        await restore();
        const found = await syncActiveSubscriptions();
        await refreshUser();
        if (!found) setError('No previous purchase found on this Apple ID.');
      },
      'Could not restore your purchases',
    );

  const openBilling = () =>
    run(
      'billing',
      async () => {
        const res = await createCustomerPortalSession();
        if (res?.url) await WebBrowser.openBrowserAsync(res.url);
        await refreshUser();
      },
      'Could not open billing',
    );

  const doPause = () =>
    run(
      'pause',
      async () => {
        await pauseSubscription(pauseMonths);
        setShowPause(false);
        await refreshUser();
      },
      'Could not pause your subscription',
    );

  const doResume = () =>
    run('resume', async () => {
      await resumeSubscription();
      await refreshUser();
    }, 'Could not resume your subscription');

  const doRestore = () =>
    run('restore', async () => {
      await restoreAccount();
      await refreshUser();
    }, 'Could not cancel the deletion');

  const doDelete = () => {
    if (!deleteEmail || !deletePassword) {
      setError('Enter your email and password to confirm');
      return;
    }
    run(
      'delete',
      async () => {
        await requestAccountDeletion(deletePassword, deleteEmail);
        setShowDelete(false);
        setDeleteEmail('');
        setDeletePassword('');
        await refreshUser();
      },
      'Could not schedule the deletion',
    );
  };

  /* CSV export. The web app clicks a hidden anchor; on device the file has to be
   * written somewhere real and handed to the share sheet, which is also how a
   * hunter actually gets it off the phone and into email or Drive. */
  const exportCsv = () => {
    if (!isPro) {
      setPaywall(true);
      return;
    }
    run(
      'export',
      async () => {
        const token = await secureGet(TOKEN_KEY);
        /* SDK 54 replaced downloadAsync with the File/Paths API. It rejects on a
         * non-2xx rather than handing back a status to check, and needs
         * idempotent so a second export overwrites the first instead of
         * failing. */
        const file = await File.downloadFileAsync(
          `${API_URL}/api/hunts/export/csv`,
          new File(Paths.cache, 'blind-guide-hunts.csv'),
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            idempotent: true,
          },
        );
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'text/csv',
            dialogTitle: 'Your hunt history',
            UTI: 'public.comma-separated-values-text',
          });
        }
      },
      'Could not export your hunts',
    );
  };

  const confirmLogout = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Profile" eyebrow="Account" />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ErrorBanner message={error} />

          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
            <View style={styles.grow}>
              <Text style={styles.userName} numberOfLines={1}>{user?.name}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
            </View>
            <View style={[styles.badge, isPro ? styles.badgePro : isPaused ? styles.badgePaused : styles.badgeFree]}>
              <Text style={[styles.badgeText, isPro ? styles.badgeTextPro : isPaused ? styles.badgeTextPaused : styles.badgeTextFree]}>
                {isPro ? 'Pro' : isPaused ? 'Paused' : 'Free'}
              </Text>
            </View>
          </View>

          {/* A pending deletion is never tucked behind Manage — it is a countdown
              on their data, and they need to see it to stop it. */}
          {deletionDate ? (
            <View style={styles.dangerCard}>
              <Text style={styles.rowTitle}>Your account is scheduled for deletion</Text>
              <Text style={styles.rowBody}>
                Everything on it will be erased on <Text style={styles.strong}>{deletionDate}</Text>.
                Until then nothing has been touched, and you can change your mind.
              </Text>
              <Text style={styles.rowBody}>
                Billing has already stopped, so you won't be charged again. Restoring the account
                doesn't restart a subscription — you'd resubscribe if you wanted Pro back.
              </Text>
              <Button
                label={busy === 'restore' ? 'Restoring…' : 'Keep my account'}
                onPress={doRestore}
                loading={busy === 'restore'}
              />
            </View>
          ) : null}

          <View style={styles.panel}>
            {isPaused ? (
              <View style={styles.pausedBlock}>
                <Text style={styles.rowTitle}>Pro is paused</Text>
                <Text style={styles.rowBody}>
                  {resumeDate
                    ? `Billing restarts on ${resumeDate} and Pro turns back on automatically. Every hunt you've logged is safe.`
                    : `You won't be billed while paused. Every hunt you've logged is safe — resume any time to get Pro back.`}
                </Text>
                <Button
                  label={busy === 'resume' ? 'Resuming…' : 'Resume Pro now'}
                  onPress={doResume}
                  loading={busy === 'resume'}
                />
              </View>
            ) : null}

            {isPro ? (
              <View style={styles.rowStatic}>
                <Text style={styles.rowTitle}>Pro — Active</Text>
              </View>
            ) : null}

            {!isPro && !isPaused ? (
              showUpgrade ? (
                <View style={styles.upgradeBlock}>
                  <Text style={styles.upgradeTitle}>GO PRO</Text>
                  <Text style={styles.rowBody}>
                    Your journal stays free. Pro is Blind Guide working ahead of you — and reading
                    everything you log.
                  </Text>

                  <View style={styles.featureList}>
                    {[
                      'The whole week ranked, at every spot',
                      'Which blind to sit, matched to the wind',
                      'Scores tuned to what has produced for you',
                      'Your season explained — species, spots, weather',
                      'The full conditions on every hunt, plus CSV export',
                    ].map(f => (
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

                  <View style={styles.planRow}>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: plan === 'monthly' }}
                      onPress={() => setPlan('monthly')}
                      style={[styles.planCard, plan === 'monthly' && styles.planCardOn]}
                    >
                      <Text style={styles.planPrice}>{priceFor('monthly') ?? '$8.99'}</Text>
                      <Text style={styles.planSub}>per month</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: plan === 'annual' }}
                      onPress={() => setPlan('annual')}
                      style={[styles.planCard, plan === 'annual' && styles.planCardOn]}
                    >
                      <View style={styles.bestValue}>
                        <Text style={styles.bestValueText}>Best Value</Text>
                      </View>
                      <Text style={styles.planPrice}>{priceFor('annual') ?? '$49.99'}</Text>
                      <Text style={styles.planSub}>
                        per year <Text style={styles.planSubAccent}>($4.17/mo)</Text>
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={styles.centredFootnote}>Cancel anytime</Text>

                  <Button
                    label={
                      busy === 'subscribe'
                        ? 'Opening App Store…'
                        : plan === 'annual'
                          ? `Subscribe — ${priceFor('annual') ?? '$49.99'}/year`
                          : `Subscribe — ${priceFor('monthly') ?? '$8.99'}/month`
                    }
                    onPress={subscribe}
                    loading={busy === 'subscribe'}
                  />
                </View>
              ) : (
                <Row
                  symbol="star.fill"
                  ion="star"
                  title="Upgrade to Pro"
                  sub="Forecasts, analytics & more — from $4.17/mo"
                  onPress={() => setShowUpgrade(true)}
                  accentIcon
                />
              )
            ) : null}

            {/* Manage — anything that changes billing or ends the account sits
                one layer in, out of reach of a stray tap. */}
            <Row
              symbol="gearshape"
              ion="settings-outline"
              title="Manage account"
              onPress={() => setShowManage(v => !v)}
              chevronDown={showManage}
            />

            {showManage ? (
              <View style={styles.manageBlock}>
                {/* Apple requires that a StoreKit subscription be cancellable
                    through the system sheet, and it is where a customer expects
                    to find it. Stripe's portal is only relevant to someone who
                    subscribed on the web. */}
                {isPro || isPaused ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={iapSupported ? openManageSubscriptions : openBilling}
                    style={({ pressed }) => [styles.subRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.rowTitle}>
                      {busy === 'billing' ? 'Opening…' : 'Manage subscription'}
                    </Text>
                    <Text style={styles.rowBody}>
                      {iapSupported
                        ? 'Change or cancel in your Apple subscriptions'
                        : 'Managed securely at Stripe'}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Apple requires a restore path — reinstalling or signing in on
                    a second device must not mean paying twice. A missing restore
                    is a routine rejection. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={restorePurchases}
                  style={({ pressed }) => [styles.subRow, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.rowTitle}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
                  </Text>
                  <Text style={styles.rowBody}>Already subscribed on another device?</Text>
                </Pressable>

                {isPro && !showPause ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowPause(true)}
                    style={({ pressed }) => [styles.subRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.rowTitle}>Pause my subscription</Text>
                    <Text style={styles.rowBody}>Stop billing through the off-season</Text>
                  </Pressable>
                ) : null}

                {isPro && showPause ? (
                  <View style={styles.subRow}>
                    <Text style={styles.rowTitle}>Pause for the off-season</Text>
                    <View style={styles.pauseRow}>
                      {PAUSE_CHOICES.map(m => (
                        <Pressable
                          key={m}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: pauseMonths === m }}
                          onPress={() => setPauseMonths(m)}
                          style={[styles.pausePill, pauseMonths === m && styles.pausePillOn]}
                        >
                          <Text style={[styles.pausePillText, pauseMonths === m && styles.pausePillTextOn]}>
                            {m} mo
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.buttonPair}>
                      <View style={styles.grow}>
                        <Button label="Never mind" variant="secondary" onPress={() => setShowPause(false)} />
                      </View>
                      <View style={styles.grow}>
                        <Button
                          label={busy === 'pause' ? 'Pausing…' : `Pause ${pauseMonths} mo`}
                          onPress={doPause}
                          loading={busy === 'pause'}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* Deletion. Last, and still its own confirm step. Apple
                    guideline 5.1.1(v) requires this exist in the app. */}
                {deletionDate ? (
                  <Text style={styles.rowBody}>
                    A deletion is already scheduled — see the notice above to cancel it.
                  </Text>
                ) : !showDelete ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { setShowDelete(true); setError(''); }}
                    style={({ pressed }) => [styles.subRow, styles.deleteRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.rowTitle}>Delete my account</Text>
                    <Text style={styles.rowBody}>Erases everything after {DELETION_GRACE_DAYS} days</Text>
                  </Pressable>
                ) : (
                  <View style={styles.deletePanel}>
                    <Text style={styles.rowTitle}>Delete your account?</Text>
                    <Text style={styles.rowBody}>
                      Your account and every hunt, location and blind on it will be erased after{' '}
                      {DELETION_GRACE_DAYS} days. Nothing is deleted straight away — you can cancel any
                      time before then by coming back here.
                    </Text>
                    <Text style={styles.rowBody}>
                      {isPro
                        ? 'Your Pro subscription is cancelled immediately, so you are not charged again. '
                        : ''}
                      Want a copy of your hunts first? Close this and use Export Data.
                    </Text>

                    <Field
                      label="Type your email to confirm"
                      value={deleteEmail}
                      onChangeText={setDeleteEmail}
                      placeholder={user?.email ?? 'you@example.com'}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="emailAddress"
                    />
                    <Field
                      label="And your password"
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      placeholder="Your password"
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="password"
                    />

                    <View style={styles.buttonPair}>
                      <View style={styles.grow}>
                        <Button
                          label="Keep my account"
                          variant="secondary"
                          onPress={() => {
                            setShowDelete(false);
                            setDeleteEmail('');
                            setDeletePassword('');
                            setError('');
                          }}
                        />
                      </View>
                      <View style={styles.grow}>
                        <Button
                          label={busy === 'delete' ? 'Scheduling…' : 'Schedule deletion'}
                          variant="danger"
                          onPress={doDelete}
                          loading={busy === 'delete'}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.panel}>
            <Row
              symbol="square.and.arrow.down"
              ion="download-outline"
              title="Export Data"
              sub="CSV of your hunt history"
              onPress={exportCsv}
              badge={!isPro ? 'Pro' : undefined}
              busy={busy === 'export'}
            />
          </View>

          <Button label="Sign Out" variant="secondary" onPress={confirmLogout} />

          <View style={styles.legalRow}>
            <Text
              style={styles.legalLink}
              onPress={() => WebBrowser.openBrowserAsync('https://blindguideapp.com/terms')}
            >
              Terms of Service
            </Text>
            <Text style={styles.legalDot}>·</Text>
            <Text
              style={styles.legalLink}
              onPress={() => WebBrowser.openBrowserAsync('https://blindguideapp.com/privacy')}
            >
              Privacy Policy
            </Text>
          </View>
          <Text style={styles.version}>Blind Guide v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <PaywallModal visible={paywall} reason="export" onClose={() => setPaywall(false)} />
    </SafeAreaView>
  );
}

function Row({
  symbol,
  ion,
  title,
  sub,
  onPress,
  badge,
  busy = false,
  chevronDown,
  accentIcon = false,
}: {
  symbol: string;
  ion: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  onPress: () => void;
  badge?: string;
  busy?: boolean;
  chevronDown?: boolean;
  accentIcon?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
    >
      <View style={[styles.rowIcon, accentIcon && styles.rowIconAccent]}>
        {Platform.OS === 'ios' ? (
          <SymbolView
            name={symbol as never}
            tintColor={accentIcon ? colors.accent : colors.textMuted}
            size={16}
          />
        ) : (
          <Ionicons name={ion} size={17} color={accentIcon ? colors.accent : colors.textMuted} />
        )}
      </View>
      <View style={styles.grow}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowBody}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {busy ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : Platform.OS === 'ios' ? (
        <SymbolView
          name={chevronDown === undefined ? 'chevron.right' : chevronDown ? 'chevron.down' : 'chevron.right'}
          tintColor={colors.textMuted}
          size={13}
        />
      ) : (
        <Ionicons
          name={chevronDown ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textMuted}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: space.xl,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.body, fontFamily: 'WorkSans_700Bold', fontSize: 18, color: colors.textInverse },
  userName: { ...type.body, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  userEmail: { ...type.bodySmall, color: colors.textMuted },

  badge: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  badgePro: { borderColor: 'rgba(27,94,69,0.3)', backgroundColor: 'rgba(27,94,69,0.05)' },
  badgePaused: { borderColor: 'rgba(217,119,6,0.3)', backgroundColor: 'rgba(217,119,6,0.05)' },
  badgeFree: { borderColor: colors.hairline, backgroundColor: colors.background },
  badgeText: { ...type.label, fontSize: 11 },
  badgeTextPro: { color: colors.accent },
  badgeTextPaused: { color: '#B45309' },
  badgeTextFree: { color: colors.textMuted },

  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: 64,
  },
  rowStatic: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  rowIconAccent: { backgroundColor: 'rgba(27,94,69,0.10)' },
  rowTitle: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },
  rowBody: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  strong: { fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  proBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(27,94,69,0.3)',
    backgroundColor: 'rgba(27,94,69,0.05)',
  },
  proBadgeText: { ...type.label, fontSize: 10, color: colors.accent },

  dangerCard: {
    borderWidth: 1,
    borderColor: '#F5C6C0',
    backgroundColor: '#FDECEA',
    borderRadius: radius.md,
    padding: space.xl,
    gap: space.sm,
  },
  pausedBlock: {
    padding: space.xl,
    gap: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(217,119,6,0.4)',
  },

  upgradeBlock: { padding: space.xl, gap: space.md },
  upgradeTitle: { ...type.sectionTitle, fontSize: 26, color: colors.text },
  featureList: { gap: space.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  featureText: { ...type.bodySmall, flex: 1, color: colors.text },
  planRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  planCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  planCardOn: { borderColor: colors.text, backgroundColor: colors.background },
  planPrice: { ...type.sectionTitle, fontSize: 24, color: colors.text },
  planSub: { ...type.bodySmall, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  planSubAccent: { fontFamily: 'WorkSans_600SemiBold', color: colors.accent },
  bestValue: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
  },
  bestValueText: { ...type.label, fontSize: 9, color: colors.textInverse },
  centredFootnote: { ...type.bodySmall, fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  manageBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    padding: space.lg,
    gap: space.md,
    backgroundColor: colors.background,
  },
  subRow: {
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    padding: space.md,
  },
  deleteRow: { borderColor: '#F5C6C0' },
  deletePanel: {
    gap: space.md,
    borderWidth: 1,
    borderColor: '#F5C6C0',
    backgroundColor: '#FDECEA',
    borderRadius: radius.sm,
    padding: space.lg,
  },
  pauseRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  pausePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pausePillOn: { borderColor: colors.text, backgroundColor: colors.background },
  pausePillText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textMuted },
  pausePillTextOn: { color: colors.text },
  buttonPair: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },

  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: space.md, marginTop: space.lg },
  legalLink: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  legalDot: { ...type.bodySmall, fontSize: 12, color: colors.hairline },
  version: { ...type.bodySmall, fontSize: 11, color: colors.textMuted, textAlign: 'center', opacity: 0.6 },
});
