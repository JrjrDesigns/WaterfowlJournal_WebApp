import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchHunts, fetchHuntYears } from '../../../utils/api';
import { format } from 'date-fns';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography } from '../../../utils/theme';

interface Hunt {
  id: string;
  name: string;
  blind_name: string;
  date: string;
  weather_data: any;
  harvests: any[];
  photos: string[];
}

export default function HuntsScreen() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadYears();
    }, [])
  );

  useEffect(() => {
    if (selectedYear !== null || years.length === 0) {
      loadHunts();
    }
  }, [selectedYear]);

  const loadYears = async () => {
    try {
      const data = await fetchHuntYears();
      const availableYears = data.years || [];
      setYears(availableYears);
      
      // Set selected year to most recent if not set
      if (availableYears.length > 0 && selectedYear === null) {
        setSelectedYear(availableYears[0]);
      }
    } catch (error) {
      console.error('Error loading years:', error);
    }
  };

  const loadHunts = async () => {
    try {
      const data = await fetchHunts(selectedYear || undefined);
      setHunts(data);
    } catch (error) {
      console.error('Error loading hunts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadHunts();
  };

  const getTotalHarvested = (harvests: any[]) => {
    return harvests.reduce((sum, h) => sum + (h.harvested || 0), 0);
  };

  const SPECIES_CATEGORIES = {
    ducks: ['Mallard', 'Teal', 'Wood Duck', 'Pintail', 'Widgeon', 'Gadwall', 'Canvasback', 'Redhead', 'Shoveler'],
    geese: ['Canada Goose', 'Snow Goose', 'Specklebelly', 'White-fronted Goose'],
  };

  const getThumbnailType = (hunt: Hunt) => {
    // If has photos, return 'photo'
    if (hunt.photos && hunt.photos.length > 0) {
      return 'photo';
    }

    // Check if harvested any ducks
    const hasDucks = hunt.harvests?.some(
      h => h.harvested > 0 && SPECIES_CATEGORIES.ducks.includes(h.species)
    );
    if (hasDucks) return 'duck';

    // Check if harvested any geese
    const hasGeese = hunt.harvests?.some(
      h => h.harvested > 0 && SPECIES_CATEGORIES.geese.includes(h.species)
    );
    if (hasGeese) return 'goose';

    // Default to outdoor icon
    return 'outdoor';
  };

  const renderThumbnail = (hunt: Hunt) => {
    const thumbnailType = getThumbnailType(hunt);

    if (thumbnailType === 'photo' && hunt.photos[0]) {
      return (
        <Image 
          source={{ uri: hunt.photos[0] }} 
          style={styles.thumbnail}
        />
      );
    }

    // Icon backgrounds and colors
    const iconConfig = {
      duck: { name: 'water' as const, color: '#2E7D32', bgColor: '#E8F5E9' },
      goose: { name: 'airplane' as const, color: '#1976D2', bgColor: '#E3F2FD' },
      outdoor: { name: 'leaf' as const, color: '#F57C00', bgColor: '#FFF3E0' },
    };

    const config = iconConfig[thumbnailType];

    return (
      <View style={[styles.thumbnailIcon, { backgroundColor: config.bgColor }]}>
        <Ionicons name={config.name} size={32} color={config.color} />
      </View>
    );
  };

  const renderHuntCard = ({ item }: { item: Hunt }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => router.push(`/hunts/${item.id}`)}
      activeOpacity={0.7}
    >
      {renderThumbnail(item)}
      
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.name}</Text>
          </View>
          <View style={styles.cardSubtitle}>
            <Ionicons name="location" size={14} color={colors.textTertiary} />
            <Text style={styles.cardSubtitleText}>{item.blind_name}</Text>
          </View>
          <Text style={styles.cardDate}>
            {format(new Date(item.date), 'MM-dd-yyyy')}
          </Text>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statRow}>
            <Ionicons name="partly-sunny" size={16} color={colors.textTertiary} />
            <Text style={styles.statText}>
              {item.weather_data?.temp}°F - {item.weather_data?.condition}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.statText}>
              {getTotalHarvested(item.harvests)} birds harvested
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Hunts</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(tabs)/hunts/create')}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Year Tabs */}
      {years.length > 0 && (
        <View style={styles.yearTabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.yearTabsContainer}
            contentContainerStyle={styles.yearTabsContent}
          >
            {years.map((year) => (
              <TouchableOpacity
                key={year}
                style={[
                  styles.yearTab,
                  selectedYear === year && styles.yearTabActive,
                ]}
                onPress={() => {
                  setSelectedYear(year);
                  setLoading(true);
                }}
              >
                <Text
                  style={[
                    styles.yearTabText,
                    selectedYear === year && styles.yearTabTextActive,
                  ]}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {hunts.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="water-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No hunts recorded yet</Text>
          <Text style={styles.emptySubtext}>Tap + to record your first hunt</Text>
        </View>
      ) : (
        <FlatList
          data={hunts}
          renderItem={renderHuntCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2E7D32']} />
          }
        />
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    backgroundColor: colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyText: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textTertiary,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnailIcon: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  cardSubtitleText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textTertiary,
  },
  cardDate: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
  },
  cardStats: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
  },
  yearTabsWrapper: {
    height: 40,
  },
  yearTabsContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  yearTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  yearTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    minWidth: 70,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  yearTabText: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
  },
  yearTabTextActive: {
    color: colors.white,
  },
});
