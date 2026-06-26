import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { colors, typography } from '../../../utils/theme';
import axios from 'axios';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

interface Hunt {
  id: string;
  name: string;
  date: string;
  location: { lat: number; lng: number };
  blind_name: string;
  notes: string;
  photos: string[];
  harvests: Array<{
    species_name: string;
    count: number;
    missed: number;
    shot_not_recovered: number;
  }>;
}

export default function HuntDetailScreen() {
  const { id } = useLocalSearchParams();
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHuntDetails();
  }, [id]);

  const loadHuntDetails = async () => {
    try {
      const backendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
      const token = await AsyncStorage.getItem('token');
      
      const response = await axios.get(`${backendUrl}/api/hunts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setHunt(response.data);
    } catch (error: any) {
      console.error('Error loading hunt details:', error);
      Alert.alert('Error', 'Failed to load hunt details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hunt) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textTertiary} />
        <Text style={styles.emptyText}>Hunt not found</Text>
      </View>
    );
  }

  const totalHarvested = hunt.harvests.reduce((sum, h) => sum + h.count, 0);
  const totalMissed = hunt.harvests.reduce((sum, h) => sum + h.missed, 0);
  const totalLost = hunt.harvests.reduce((sum, h) => sum + h.shot_not_recovered, 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header Info */}
        <View style={styles.headerCard}>
          <Text style={styles.huntName}>{hunt.name}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color={colors.textSecondary} />
            <Text style={styles.infoText}>{format(new Date(hunt.date), 'MM-dd-yyyy')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={16} color={colors.textSecondary} />
            <Text style={styles.infoText}>{hunt.blind_name}</Text>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={32} color={colors.primary} />
            <Text style={styles.statValue}>{totalHarvested}</Text>
            <Text style={styles.statLabel}>Harvested</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="close-circle" size={32} color={colors.warning} />
            <Text style={styles.statValue}>{totalMissed}</Text>
            <Text style={styles.statLabel}>Missed</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="remove-circle" size={32} color={colors.error} />
            <Text style={styles.statValue}>{totalLost}</Text>
            <Text style={styles.statLabel}>Lost</Text>
          </View>
        </View>

        {/* Harvest Details */}
        {hunt.harvests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Harvest Details</Text>
            {hunt.harvests.map((harvest, index) => (
              <View key={index} style={styles.harvestCard}>
                <Text style={styles.speciesName}>{harvest.species_name}</Text>
                <View style={styles.harvestStats}>
                  <View style={styles.harvestStat}>
                    <Text style={styles.harvestStatValue}>{harvest.count}</Text>
                    <Text style={styles.harvestStatLabel}>Harvested</Text>
                  </View>
                  <View style={styles.harvestStat}>
                    <Text style={styles.harvestStatValue}>{harvest.missed}</Text>
                    <Text style={styles.harvestStatLabel}>Missed</Text>
                  </View>
                  <View style={styles.harvestStat}>
                    <Text style={styles.harvestStatValue}>{harvest.shot_not_recovered}</Text>
                    <Text style={styles.harvestStatLabel}>Lost</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {hunt.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{hunt.notes}</Text>
            </View>
          </View>
        )}

        {/* Photos */}
        {hunt.photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <View style={styles.photoGrid}>
              {hunt.photos.map((photo, index) => (
                <Image
                  key={index}
                  source={{ uri: photo }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </View>
          </View>
        )}

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.locationCard}>
            <View style={styles.infoRow}>
              <Ionicons name="navigate" size={16} color={colors.textSecondary} />
              <Text style={styles.infoText}>
                {hunt.location.lat.toFixed(6)}, {hunt.location.lng.toFixed(6)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  emptyText: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  huntName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  infoText: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  harvestCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speciesName: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  harvestStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  harvestStat: {
    alignItems: 'center',
  },
  harvestStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.primary,
  },
  harvestStatLabel: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  notesCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photo: {
    width: '48%',
    height: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
