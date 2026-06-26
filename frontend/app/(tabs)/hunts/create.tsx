import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { launchImageLibraryAsync, launchCameraAsync, requestMediaLibraryPermissionsAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import { fetchBlinds, createHunt, fetchSpecies } from '../../../utils/api';
import { format } from 'date-fns';
import DropDownPicker from 'react-native-dropdown-picker';
import { colors, typography } from '../../../utils/theme';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Blind {
  id: string;
  name: string;
  location: { lat: number; lng: number };
}

interface Harvest {
  species: string;
  harvested: number;
  missed: number;
  shot_not_recovered: number;
}

export default function CreateHuntScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [blinds, setBlinds] = useState<Blind[]>([]);
  const [species, setSpecies] = useState<any>({ ducks: [], geese: [], others: [] });
  
  // Form fields
  const [huntName, setHuntName] = useState('');
  const [selectedBlindId, setSelectedBlindId] = useState<string>('');
  const [newBlindName, setNewBlindName] = useState('');
  const [newBlindDescription, setNewBlindDescription] = useState('');
  const [newBlindType, setNewBlindType] = useState('ground');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [showNewBlindForm, setShowNewBlindForm] = useState(false);
  
  // Dropdown states for react-native-dropdown-picker
  const [blindDropdownOpen, setBlindDropdownOpen] = useState(false);
  const [blindItems, setBlindItems] = useState<Array<{label: string; value: string}>>([]);
  
  // Keep track of species dropdown open state for each harvest entry
  const [openDropdowns, setOpenDropdowns] = useState<{[key: number]: boolean}>({});

  useEffect(() => {
    loadData();
    getCurrentLocation();
  }, []);

  const loadData = async () => {
    try {
      const [blindsData, speciesData] = await Promise.all([
        fetchBlinds(),
        fetchSpecies(),
      ]);
      setBlinds(blindsData);
      setSpecies(speciesData);
      
      // Format blinds for dropdown
      const blindDropdownItems = blindsData.map((blind: Blind) => ({
        label: blind.name,
        value: blind.id,
      }));
      setBlindItems(blindDropdownItems);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to add photos to your hunt.');
        return;
      }

      const result = await launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.3,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const base64Image = `data:image/jpeg;base64,${asset.base64}`;
          setPhotos([...photos, base64Image]);
        } else {
          Alert.alert('Error', 'Unable to process image. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      Alert.alert('Error', error.message || 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access to take photos.');
        return;
      }

      const result = await launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.3,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const base64Image = `data:image/jpeg;base64,${asset.base64}`;
          setPhotos([...photos, base64Image]);
        } else {
          Alert.alert('Error', 'Unable to process photo. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', error.message || 'Failed to take photo. Please try again.');
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: takePhoto,
        },
        {
          text: 'Choose from Library',
          onPress: pickImage,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const addHarvestEntry = () => {
    const newIndex = harvests.length;
    setHarvests([
      ...harvests,
      { species: species.ducks[0] || '', harvested: 0, missed: 0, shot_not_recovered: 0 },
    ]);
    setOpenDropdowns({ ...openDropdowns, [newIndex]: false });
  };

  const updateHarvest = (index: number, field: keyof Harvest, value: any) => {
    const updated = [...harvests];
    updated[index] = { ...updated[index], [field]: value };
    setHarvests(updated);
  };

  const removeHarvest = (index: number) => {
    setHarvests(harvests.filter((_, i) => i !== index));
    const newOpenDropdowns = { ...openDropdowns };
    delete newOpenDropdowns[index];
    setOpenDropdowns(newOpenDropdowns);
  };

  const handleSubmit = async () => {
    if (!huntName) {
      Alert.alert('Error', 'Hunt name is required');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location is required');
      return;
    }

    if (showNewBlindForm && (!newBlindName || !newBlindDescription)) {
      Alert.alert('Error', 'Please fill in blind name and description');
      return;
    }

    if (!showNewBlindForm && !selectedBlindId) {
      Alert.alert('Error', 'Please select a blind or create a new one');
      return;
    }

    setLoading(true);
    try {
      const huntData: any = {
        name: huntName,
        date: format(date, 'yyyy-MM-dd'), // Send to backend in ISO format
        location,
        notes,
        photos,
        harvests,
      };

      if (showNewBlindForm) {
        huntData.blind_name = newBlindName;
        huntData.blind_description = newBlindDescription;
        huntData.blind_type = newBlindType;
      } else {
        huntData.blind_id = selectedBlindId;
      }

      await createHunt(huntData);
      Alert.alert('Success', 'Hunt recorded successfully');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create hunt');
    } finally {
      setLoading(false);
    }
  };

  const allSpecies = [
    ...species.ducks,
    ...species.geese,
    ...species.others,
  ];

  const speciesItems = allSpecies.map(sp => ({ label: sp, value: sp }));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Hunt Name */}
          <View style={styles.section}>
            <Text style={styles.label}>Hunt Name</Text>
            <TextInput
              style={styles.input}
              value={huntName}
              onChangeText={setHuntName}
              placeholder="e.g., Morning Duck Hunt"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.dateButtonText}>
                {format(date, 'MM-dd-yyyy')}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    setDate(selectedDate);
                  }
                }}
                themeVariant="light"
              />
            )}
          </View>

          {/* Blind Selection */}
          <View style={styles.section}>
            <Text style={styles.label}>Blind</Text>
            <View style={styles.blindToggle}>
              <TouchableOpacity
                style={[styles.toggleButton, !showNewBlindForm && styles.toggleButtonActive]}
                onPress={() => setShowNewBlindForm(false)}
              >
                <Text style={[styles.toggleText, !showNewBlindForm && styles.toggleTextActive]}>
                  Existing
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, showNewBlindForm && styles.toggleButtonActive]}
                onPress={() => setShowNewBlindForm(true)}
              >
                <Text style={[styles.toggleText, showNewBlindForm && styles.toggleTextActive]}>
                  New Blind
                </Text>
              </TouchableOpacity>
            </View>

            {!showNewBlindForm ? (
              <View style={styles.dropdownContainer}>
                <DropDownPicker
                  open={blindDropdownOpen}
                  value={selectedBlindId}
                  items={blindItems}
                  setOpen={setBlindDropdownOpen}
                  setValue={setSelectedBlindId}
                  setItems={setBlindItems}
                  placeholder="Select a blind"
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownList}
                  listMode="MODAL"
                  modalProps={{
                    animationType: "slide"
                  }}
                  modalTitle="Select a Blind"
                />
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={newBlindName}
                  onChangeText={setNewBlindName}
                  placeholder="Blind Name"
                  placeholderTextColor={colors.textTertiary}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newBlindDescription}
                  onChangeText={setNewBlindDescription}
                  placeholder="Blind Description"
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={colors.textTertiary}
                />
                
                {/* Blind Type Selection */}
                <Text style={[styles.label, { marginTop: 12 }]}>Blind Type</Text>
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
              </>
            )}
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.label}>Hunt Location (Coordinates)</Text>
            
            <View style={styles.coordinateInputs}>
              <View style={styles.coordinateInput}>
                <Text style={styles.coordinateLabel}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={location ? location.lat.toString() : ''}
                  onChangeText={(text) => {
                    const lat = parseFloat(text) || 0;
                    setLocation({ lat, lng: location?.lng || 0 });
                  }}
                  placeholder="e.g., 40.712800"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              <View style={styles.coordinateInput}>
                <Text style={styles.coordinateLabel}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={location ? location.lng.toString() : ''}
                  onChangeText={(text) => {
                    const lng = parseFloat(text) || 0;
                    setLocation({ lat: location?.lat || 0, lng });
                  }}
                  placeholder="e.g., -74.006000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.optionalGPSButton}
              onPress={getCurrentLocation}
            >
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <Text style={styles.optionalGPSText}>Or use current GPS location</Text>
            </TouchableOpacity>
          </View>

          {/* Harvests */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>Harvest Data</Text>
              <TouchableOpacity onPress={addHarvestEntry} style={styles.addHarvestButton}>
                <Ionicons name="add-circle" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {harvests.map((harvest, index) => (
              <View key={index} style={styles.harvestCard}>
                <View style={styles.harvestHeader}>
                  <Text style={styles.harvestTitle}>Entry {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeHarvest(index)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>

                <View style={styles.dropdownContainer}>
                  <DropDownPicker
                    open={openDropdowns[index] || false}
                    value={harvest.species}
                    items={speciesItems}
                    setOpen={(open) => setOpenDropdowns({ ...openDropdowns, [index]: open })}
                    setValue={(callback) => {
                      const value = typeof callback === 'function' ? callback(harvest.species) : callback;
                      updateHarvest(index, 'species', value);
                    }}
                    placeholder="Select species"
                    style={styles.dropdown}
                    dropDownContainerStyle={styles.dropdownList}
                    listMode="MODAL"
                    modalProps={{
                      animationType: "slide"
                    }}
                    modalTitle="Select Species"
                  />
                </View>

                <View style={styles.harvestInputRow}>
                  <View style={styles.harvestInputContainer}>
                    <Text style={styles.harvestInputLabel}>Harvested</Text>
                    <TextInput
                      style={styles.harvestInput}
                      value={harvest.harvested.toString()}
                      onChangeText={(text) =>
                        updateHarvest(index, 'harvested', parseInt(text) || 0)
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View style={styles.harvestInputContainer}>
                    <Text style={styles.harvestInputLabel}>Missed</Text>
                    <TextInput
                      style={styles.harvestInput}
                      value={harvest.missed.toString()}
                      onChangeText={(text) =>
                        updateHarvest(index, 'missed', parseInt(text) || 0)
                      }
                      keyboardType="number-pad"
                    />
                  </View>

                  <View style={styles.harvestInputContainer}>
                    <Text style={styles.harvestInputLabel}>Shot/Lost</Text>
                    <TextInput
                      style={styles.harvestInput}
                      value={harvest.shot_not_recovered.toString()}
                      onChangeText={(text) =>
                        updateHarvest(index, 'shot_not_recovered', parseInt(text) || 0)
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.label}>Photos</Text>
            <TouchableOpacity style={styles.photoButton} onPress={showImageOptions}>
              <Ionicons name="camera" size={24} color={colors.primary} />
              <Text style={styles.photoButtonText}>Add Photo</Text>
            </TouchableOpacity>

            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotos(photos.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close-circle" size={24} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes about this hunt..."
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Record Hunt</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    zIndex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButton: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateButtonText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  blindToggle: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: typography.bodySmall,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.white,
  },
  dropdownContainer: {
    marginTop: 8,
    marginBottom: 12,
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  dropdownList: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationText: {
    flex: 1,
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textPrimary,
  },
  refreshButton: {
    padding: 4,
  },
  mapContainer: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationActions: {
    gap: 12,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  locationButtonText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
  },
  coordinatesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coordinatesText: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyMono,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  locationPlaceholder: {
    height: 250,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: typography.bodySmall,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textTertiary,
    marginTop: 12,
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
  optionalGPSButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 8,
    gap: 6,
  },
  optionalGPSText: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.primary,
  },
  addHarvestButton: {
    padding: 4,
  },
  harvestCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    zIndex: 900,
  },
  harvestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  harvestTitle: {
    fontSize: typography.bodySmall,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.textSecondary,
  },
  harvestInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  harvestInputContainer: {
    flex: 1,
  },
  harvestInputLabel: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  harvestInput: {
    backgroundColor: colors.background,
    borderRadius: 6,
    padding: 8,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 8,
  },
  photoButtonText: {
    fontSize: typography.body,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 12,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: '600',
    fontFamily: typography.fontFamilyMedium,
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
});
