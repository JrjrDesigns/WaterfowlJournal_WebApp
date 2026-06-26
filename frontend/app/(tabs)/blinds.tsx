import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchBlinds, deleteBlind } from '../../utils/api';
import { useRouter } from 'expo-router';
import { colors, typography } from '../../utils/theme';
import axios from 'axios';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

interface Blind {
  id: string;
  name: string;
  description: string;
  location: { lat: number; lng: number };
  blind_type?: string;
  photo_base64?: string;
}

// Map blind types to icons
const getBlindIcon = (type: string = 'ground') => {
  const iconMap: Record<string, any> = {
    ground: { name: 'telescope' as const, color: '#8B4513' },
    pit: { name: 'layers' as const, color: '#654321' },
    panel: { name: 'grid' as const, color: '#A0522D' },
    'a-frame': { name: 'home' as const, color: '#D2691E' },
    layout: { name: 'swap-horizontal' as const, color: '#CD853F' },
    boat: { name: 'boat' as const, color: '#4682B4' },
  };
  
  return iconMap[type] || iconMap['ground'];
};

export default function BlindsScreen() {
  const [blinds, setBlinds] = useState<Blind[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [newBlindName, setNewBlindName] = useState('');
  const [newBlindDescription, setNewBlindDescription] = useState('');
  const [newBlindType, setNewBlindType] = useState('ground');
  const [newBlindLat, setNewBlindLat] = useState('');
  const [newBlindLng, setNewBlindLng] = useState('');
  const [newBlindPhoto, setNewBlindPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadBlinds();
  }, []);

  const loadBlinds = async () => {
    try {
      const data = await fetchBlinds();
      setBlinds(data);
    } catch (error) {
      console.error('Error loading blinds:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBlinds();
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setNewBlindPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Blind',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBlind(id);
              loadBlinds();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete blind');
            }
          },
        },
      ]
    );
  };

  const handleCreateBlind = async () => {
    if (!newBlindName || !newBlindDescription) {
      Alert.alert('Error', 'Please fill in name and description');
      return;
    }

    // Parse coordinates if provided
    let location = { lat: 0, lng: 0 };
    
    if (newBlindLat || newBlindLng) {
      const lat = parseFloat(newBlindLat);
      const lng = parseFloat(newBlindLng);

      if (isNaN(lat) || isNaN(lng)) {
        Alert.alert('Error', 'Please enter valid coordinates or leave both fields empty');
        return;
      }
      
      location = { lat, lng };
    }

    setCreating(true);
    try {
      const backendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
      const token = await import('@react-native-async-storage/async-storage').then(m => m.default.getItem('token'));
      
      await axios.post(
        `${backendUrl}/api/blinds`,
        {
          name: newBlindName,
          description: newBlindDescription,
          blind_type: newBlindType,
          location: location,
          photo_base64: newBlindPhoto,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert('Success', 'Blind created successfully');
      setShowModal(false);
      resetForm();
      loadBlinds();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create blind');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewBlindName('');
    setNewBlindDescription('');
    setNewBlindType('ground');
    setNewBlindLat('');
    setNewBlindLng('');
    setNewBlindPhoto(null);
  };

  const renderBlindCard = ({ item }: { item: Blind }) => {
    const blindIcon = getBlindIcon(item.blind_type);
    
    return (
      <View style={styles.card}>
        {/* Thumbnail - Use photo if available, otherwise icon */}
        <View style={styles.thumbnail}>
          {item.photo_base64 ? (
            <Image
              source={{ uri: item.photo_base64 }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnailIcon, { backgroundColor: `${blindIcon.color}20` }]}>
              <Ionicons name={blindIcon.name} size={32} color={blindIcon.color} />
            </View>
          )}
        </View>
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.blindType}>
            {item.blind_type === 'a-frame' ? 'A-Frame' : (item.blind_type || 'ground').charAt(0).toUpperCase() + (item.blind_type || 'ground').slice(1)}
          </Text>

          <Text style={styles.description}>{item.description}</Text>

          <View style={styles.locationRow}>
            <Ionicons name="navigate" size={14} color={colors.textSecondary} />
            <Text style={styles.locationText}>
              {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Blinds</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      </View>

      {blinds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No blinds added yet</Text>
          <Text style={styles.emptySubtext}>
            Tap the + button to add a blind
          </Text>
        </View>
      ) : (
        <FlatList
          data={blinds}
          renderItem={renderBlindCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        />
      )}

      {/* Add Blind Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowModal(false);
          resetForm();
        }}
        statusBarTranslucent={false}
      >
        <View style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            {/* Modal Header with Back Button */}
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => {
                  setShowModal(false);
                  resetForm();
                }}
                style={styles.backButton}
              >
                <Ionicons name="chevron-back" size={28} color={colors.primary} />
                <Text style={styles.backButtonText}>Blinds</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Blind</Text>
              <View style={{ width: 80 }} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {/* Photo Upload */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Blind Photo</Text>
                <TouchableOpacity style={styles.photoUploadButton} onPress={pickImage}>
                  {newBlindPhoto ? (
                    <Image source={{ uri: newBlindPhoto }} style={styles.photoPreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="camera-outline" size={32} color={colors.textTertiary} />
                      <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Blind Name */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Blind Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={newBlindName}
                  onChangeText={setNewBlindName}
                  placeholder="e.g., North Point Blind"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              {/* Description */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.formInput, styles.textArea]}
                  value={newBlindDescription}
                  onChangeText={setNewBlindDescription}
                  placeholder="Describe the blind location and setup"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Blind Type */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Blind Type</Text>
                <View style={styles.blindTypeContainer}>
                  {['ground', 'pit', 'panel', 'a-frame', 'layout', 'boat'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={styles.blindTypeOption}
                      onPress={() => setNewBlindType(type)}
                    >
                      <View style={styles.checkbox}>
                        {newBlindType === type && (
                          <Ionicons name="checkmark" size={16} color={colors.primary} />
                        )}
                      </View>
                      <Text style={styles.blindTypeLabel}>
                        {type === 'a-frame' ? 'A-Frame' : type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Location */}
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Location (Optional)</Text>
                <View style={styles.coordinateInputs}>
                  <View style={styles.coordinateInput}>
                    <Text style={styles.coordinateLabel}>Latitude</Text>
                    <TextInput
                      style={styles.formInput}
                      value={newBlindLat}
                      onChangeText={setNewBlindLat}
                      placeholder="e.g., 40.712800"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.coordinateInput}>
                    <Text style={styles.coordinateLabel}>Longitude</Text>
                    <TextInput
                      style={styles.formInput}
                      value={newBlindLng}
                      onChangeText={setNewBlindLng}
                      placeholder="e.g., -74.006000"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Create Button */}
              <TouchableOpacity
                style={[styles.createButton, creating && styles.createButtonDisabled]}
                onPress={handleCreateBlind}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.createButtonText}>Create Blind</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 80,
    height: 80,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
  },
  blindType: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.primary,
    marginBottom: 8,
    fontWeight: '600',
  },
  description: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 17,
    fontFamily: typography.fontFamilyRegular,
    color: colors.primary,
    marginLeft: -4,
  },
  modalTitle: {
    fontSize: typography.h2,
    fontWeight: 'bold',
    fontFamily: typography.fontFamilyBold,
    color: colors.textPrimary,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  formSection: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  blindTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  blindTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: '47%',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blindTypeLabel: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
  },
  coordinateInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateInput: {
    flex: 1,
  },
  coordinateLabel: {
    fontSize: typography.bodySmall,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
  },
  photoUploadButton: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
  },
  photoPlaceholderText: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
