import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchStatistics, fetchHuntYears } from '../../utils/api';
import { BarChart } from 'react-native-gifted-charts';
import { colors, typography } from '../../utils/theme';

interface Statistics {
  total_hunts: number;
  total_harvested: number;
  total_missed: number;
  total_shot_not_recovered: number;
  ducks_total: number;
  geese_total: number;
  others_total: number;
  by_species: Record<string, { harvested: number; missed: number; shot_not_recovered: number }>;
}

export default function StatsScreen() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    if (selectedYear !== null || years.length === 0) {
      loadStats();
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

  const loadStats = async () => {
    try {
      const data = await fetchStatistics(selectedYear || undefined);
      setStats(data);
    } catch (error) {
      console.error('Error loading statistics:', error);
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

  if (!stats || stats.total_hunts === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Statistics</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="stats-chart-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No data yet</Text>
          <Text style={styles.emptySubtext}>Start recording hunts to see your stats</Text>
        </View>
      </SafeAreaView>
    );
  }

  const categoryData = [
    { value: stats.ducks_total, label: 'Ducks', frontColor: '#4CAF50' },
    { value: stats.geese_total, label: 'Geese', frontColor: '#2E7D32' },
    { value: stats.others_total, label: 'Others', frontColor: '#81C784' },
  ];

  const topSpecies = Object.entries(stats.by_species)
    .sort(([, a], [, b]) => b.harvested - a.harvested)
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Statistics</Text>
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Ionicons name="calendar" size={32} color={colors.primary} />
            <Text style={styles.summaryValue}>{stats.total_hunts}</Text>
            <Text style={styles.summaryLabel}>Total Hunts</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="checkmark-circle" size={32} color={colors.primary} />
            <Text style={styles.summaryValue}>{stats.total_harvested}</Text>
            <Text style={styles.summaryLabel}>Harvested</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="close-circle" size={32} color={colors.warning} />
            <Text style={styles.summaryValue}>{stats.total_missed}</Text>
            <Text style={styles.summaryLabel}>Missed</Text>
          </View>

          <View style={styles.summaryCard}>
            <Ionicons name="remove-circle" size={32} color={colors.error} />
            <Text style={styles.summaryValue}>{stats.total_shot_not_recovered}</Text>
            <Text style={styles.summaryLabel}>Lost</Text>
          </View>
        </View>

        {/* Category Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Harvest by Category</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={categoryData}
              width={300}
              height={220}
              barWidth={60}
              spacing={30}
              roundedTop
              roundedBottom
              hideRules
              xAxisThickness={0}
              yAxisThickness={0}
              yAxisTextStyle={{ color: '#666' }}
              noOfSections={4}
              maxValue={Math.max(...categoryData.map(d => d.value)) || 10}
            />
          </View>
        </View>

        {/* Top Species */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Species</Text>
          {topSpecies.map(([species, data]) => (
            <View key={species} style={styles.speciesCard}>
              <View style={styles.speciesHeader}>
                <Text style={styles.speciesName}>{species}</Text>
                <Text style={styles.speciesCount}>{data.harvested}</Text>
              </View>
              <View style={styles.speciesStats}>
                <View style={styles.speciesStat}>
                  <Text style={styles.speciesStatLabel}>Missed:</Text>
                  <Text style={styles.speciesStatValue}>{data.missed}</Text>
                </View>
                <View style={styles.speciesStat}>
                  <Text style={styles.speciesStatLabel}>Lost:</Text>
                  <Text style={styles.speciesStatValue}>{data.shot_not_recovered}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Success Rate */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Success Rate</Text>
          <View style={styles.successCard}>
            <Text style={styles.successRate}>
              {stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered > 0
                ? (
                    (stats.total_harvested /
                      (stats.total_harvested + stats.total_missed + stats.total_shot_not_recovered)) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </Text>
            <Text style={styles.successLabel}>Harvest Success Rate</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minWidth: '47%',
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
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  chartSection: {
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
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  speciesCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speciesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speciesName: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
  },
  speciesCount: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.primary,
  },
  speciesStats: {
    flexDirection: 'row',
    gap: 16,
  },
  speciesStat: {
    flexDirection: 'row',
    gap: 4,
  },
  speciesStatLabel: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
  },
  speciesStatValue: {
    fontSize: typography.caption,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
  },
  successCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  successRate: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.primary,
  },
  successLabel: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginTop: 8,
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
