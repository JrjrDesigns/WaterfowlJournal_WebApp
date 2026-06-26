import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { colors, typography } from '../../utils/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  const handleExport = () => {
    Alert.alert(
      'Export Data',
      'This feature will be available soon. You\'ll be able to export your hunting logs as PDF or CSV.',
      [{ text: 'OK' }]
    );
  };

  const handleSubscription = () => {
    Alert.alert(
      'Subscription',
      'Stripe integration will be added here. You can upgrade to premium for advanced features.',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={48} color={colors.white} />
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.subscriptionBadge}>
            <Text style={styles.subscriptionText}>
              {user?.subscription_status === 'premium' ? 'Premium' : 'Free'}
            </Text>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={handleSubscription}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="star" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>Subscription</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleExport}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="download" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>Export Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="settings" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* API Keys Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>API Configuration</Text>
          <Text style={styles.infoText}>
            Weather and payment integrations are configured with placeholder keys.
            Update your API keys in the backend .env file:
          </Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>OPENWEATHER_API_KEY=your_key</Text>
            <Text style={styles.codeText}>STRIPE_SECRET_KEY=your_key</Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color={colors.white} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.h2,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  userCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  subscriptionBadge: {
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  subscriptionText: {
    fontSize: typography.caption,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary,
  },
  menuSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    marginBottom: 24,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
  },
  infoSection: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  codeBlock: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  codeText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMono,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: colors.error,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  logoutText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
  },
  version: {
    textAlign: 'center',
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textTertiary,
    marginBottom: 24,
  },
});
