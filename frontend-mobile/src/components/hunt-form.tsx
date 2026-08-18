import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SymbolView } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parse } from 'date-fns';

import { Button, ErrorBanner, Field, SectionLabel } from '@/components/ui';
import { OptionField, OptionSheet, type Option } from '@/components/option-sheet';
import { HarvestEntryCard, type Harvest } from '@/components/harvest-entry-card';
import {
  fetchLocations,
  fetchBlindsForLocation,
  fetchAllBlinds,
  fetchSpecies,
  fetchHunt,
  createHunt,
  updateHunt,
} from '@/utils/api';
import { colors, type, space, radius } from '@/constants/theme';

interface LocationData { id: string; name: string; location_type: string }
interface BlindData { id: string; name: string; location_id: string; lat: number; lng: number }

/* The web app compresses to 800px wide at quality 0.7 before upload. Same
 * numbers here: photos travel as base64 in the hunt payload and the server
 * pushes them to R2, so an uncompressed phone photo would be a multi-megabyte
 * request logged from a marsh with one bar. */
const PHOTO_MAX_WIDTH = 800;
const PHOTO_QUALITY = 0.7;

export interface HuntFormProps {
  mode: 'create' | 'edit';
  /** Required in edit mode — the hunt whose values are loaded and saved back. */
  huntId?: string;
  /** Called after a successful save; the screen decides where to go. */
  onSaved: () => void;
  onCancel: () => void;
}

export function HuntForm({ mode, huntId, onSaved, onCancel }: HuntFormProps) {
  const [initialLoading, setInitialLoading] = useState(mode === 'edit');

  const [locations, setLocations] = useState<LocationData[]>([]);
  const [blinds, setBlinds] = useState<BlindData[]>([]);
  const [allSpecies, setAllSpecies] = useState<string[]>([]);

  const [huntName, setHuntName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [blindId, setBlindId] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isMorning, setIsMorning] = useState(false);
  const [isEvening, setIsEvening] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [party, setParty] = useState<string[]>([]);
  const [partyInput, setPartyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [sheet, setSheet] = useState<'location' | 'blind' | null>(null);
  const [speciesSheetFor, setSpeciesSheetFor] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [locs, species] = await Promise.all([fetchLocations(), fetchSpecies()]);
        setLocations(locs);
        setAllSpecies([...species.ducks, ...species.geese, ...species.others]);

        if (mode !== 'edit' || !huntId) return;

        const hunt = await fetchHunt(huntId);
        setHuntName(hunt.name);
        setDate(parse(hunt.date, 'yyyy-MM-dd', new Date()));
        setCoords(hunt.location);
        setIsMorning(hunt.is_morning ?? false);
        setIsEvening(hunt.is_evening ?? false);
        setNotes(hunt.notes ?? '');
        setPhotos(hunt.photos ?? []);
        setParty(hunt.party ?? []);
        // Existing entries arrive collapsed — a five-species bag should not
        // reopen as five editable forms.
        setHarvests(
          (hunt.harvests ?? []).map((h: {
            species_name: string; count: number; mine?: number;
            missed: number; shot_not_recovered: number; seen?: number;
          }) => ({
            species: h.species_name,
            harvested: h.count,
            missed: h.missed,
            shot_not_recovered: h.shot_not_recovered,
            seen: h.seen ?? 0,
            mine: h.mine ?? h.count,
            confirmed: true,
          })),
        );

        /* Restore the location → blind pair. The web app fetches the blinds of
         * every location to find which one holds this blind — N requests. One
         * call to /api/blinds returns them all with their location_id, which is
         * the same answer for one request. That matters on a cellular
         * connection, and the API is shared with a rate-limited weather quota. */
        if (hunt.blind_id) {
          setBlindId(hunt.blind_id);
          const all = await fetchAllBlinds();
          const match = (all as BlindData[]).find(b => b.id === hunt.blind_id);
          if (match) {
            setLocationId(match.location_id);
            setBlinds(await fetchBlindsForLocation(match.location_id));
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load this hunt.');
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [mode, huntId]);

  const chooseLocation = async (id: string) => {
    setLocationId(id);
    setBlindId('');
    setCoords(null);
    setBlinds([]);
    if (!id) return;
    try {
      setBlinds(await fetchBlindsForLocation(id));
    } catch { /* picker shows its empty message */ }
  };

  const chooseBlind = (id: string) => {
    setBlindId(id);
    const blind = blinds.find(b => b.id === id);
    setCoords(blind ? { lat: blind.lat, lng: blind.lng } : null);
  };

  const addPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo access is off. Turn it on in Settings to attach pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1, // Compression happens below, at the web app's exact settings.
    });
    if (result.canceled) return;

    const encoded = await Promise.all(
      result.assets.map(async asset => {
        const context = ImageManipulator.manipulate(asset.uri).resize({ width: PHOTO_MAX_WIDTH });
        const image = await context.renderAsync();
        const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
        return `data:image/jpeg;base64,${out.base64}`;
      }),
    );
    setPhotos(prev => [...prev, ...encoded]);
  };

  const addPartyMember = () => {
    const name = partyInput.trim();
    if (!name || party.includes(name)) return;
    setParty(prev => [...prev, name]);
    setPartyInput('');
  };

  const updateHarvest = (i: number, field: keyof Harvest, value: string | number | boolean) => {
    setHarvests(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const submit = async () => {
    setError('');
    if (!huntName.trim()) { setError('Give this hunt a title'); return; }
    if (!blindId) { setError('Select a blind'); return; }
    if (!coords) { setError('Selected blind has no coordinates'); return; }

    setSaving(true);
    try {
      const payload = {
        name: huntName.trim(),
        blind_id: blindId,
        date: format(date, 'yyyy-MM-dd'),
        location: coords,
        notes,
        photos,
        is_morning: isMorning,
        is_evening: isEvening,
        party,
        harvests: harvests.map(h => ({
          species_name: h.species,
          count: h.harvested,
          // `mine` only means anything when you hunted with someone.
          mine: party.length > 0 ? h.mine : undefined,
          missed: h.missed,
          shot_not_recovered: h.shot_not_recovered,
          seen: h.seen,
        })),
      };
      if (mode === 'edit' && huntId) await updateHunt(huntId, payload);
      else await createHunt(payload);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === 'edit' ? 'save' : 'create'} hunt`);
    } finally {
      setSaving(false);
    }
  };

  const windHint = [isMorning && 'sunrise→noon', isEvening && '~4 hrs pre-sunset→sunset']
    .filter(Boolean)
    .join(' and ');

  const locationOptions: Option[] = locations.map(l => ({ value: l.id, label: l.name }));
  const blindOptions: Option[] = blinds.map(b => ({ value: b.id, label: b.name }));
  const speciesOptions: Option[] = allSpecies.map(s => ({ value: s, label: s }));

  if (initialLoading) {
    return <ActivityIndicator style={styles.loader} color={colors.textMuted} />;
  }

  return (
    <>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ErrorBanner message={error} />

          <Field
            label="Hunt Title"
            value={huntName}
            onChangeText={setHuntName}
            placeholder="Morning Duck Hunt"
            autoCorrect={false}
            returnKeyType="done"
          />

          <View style={styles.block}>
            <SectionLabel>Date</SectionLabel>
            {Platform.OS === 'ios' ? (
              <View style={styles.dateWrap}>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="compact"
                  onChange={(_, d) => d && setDate(d)}
                />
              </View>
            ) : (
              <>
                <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateBtn}>
                  <Text style={styles.dateText}>{format(date, 'MM-dd-yyyy')}</Text>
                </Pressable>
                {showDatePicker ? (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.block}>
            <SectionLabel>Hunt Time</SectionLabel>
            <View style={styles.timeRow}>
              {([
                ['Morning', isMorning, setIsMorning],
                ['Evening', isEvening, setIsEvening],
              ] as const).map(([label, on, set]) => (
                <Pressable
                  key={label}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => set(!on)}
                  style={({ pressed }) => [styles.timeBtn, on && styles.timeBtnOn, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? (
                      Platform.OS === 'ios' ? (
                        <SymbolView name="checkmark" tintColor={colors.text} size={11} />
                      ) : (
                        <Ionicons name="checkmark" size={12} color={colors.text} />
                      )
                    ) : null}
                  </View>
                  <Text style={[styles.timeText, on && styles.timeTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {windHint ? (
              <Text style={styles.hint}>Wind data will be logged for {windHint}.</Text>
            ) : null}
          </View>

          <View style={styles.block}>
            <SectionLabel>Hunting With</SectionLabel>
            <Text style={styles.hint}>
              Add your hunting partners here, so you can identify who shot what
            </Text>
            <View style={styles.partyRow}>
              <View style={styles.grow}>
                <Field
                  label=""
                  value={partyInput}
                  onChangeText={setPartyInput}
                  placeholder="Add a hunting partner…"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={addPartyMember}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={addPartyMember}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
            {party.length > 0 ? (
              <View style={styles.chipWrap}>
                {party.map(name => (
                  <View key={name} style={styles.partyChip}>
                    <Text style={styles.partyChipText}>{name}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${name}`}
                      hitSlop={8}
                      onPress={() => setParty(prev => prev.filter(p => p !== name))}
                    >
                      {Platform.OS === 'ios' ? (
                        <SymbolView name="xmark" tintColor={colors.textMuted} size={11} />
                      ) : (
                        <Ionicons name="close" size={13} color={colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.block}>
            <OptionField
              label="Location"
              value={locations.find(l => l.id === locationId)?.name}
              placeholder="Select a location…"
              onPress={() => setSheet('location')}
              hint={locations.length === 0 ? 'No locations yet — add one in the Locations tab first.' : undefined}
            />
            {locationId ? (
              <OptionField
                label="Blind"
                value={blinds.find(b => b.id === blindId)?.name}
                placeholder="Select a blind…"
                onPress={() => setSheet('blind')}
                hint={blinds.length === 0 ? 'No blinds at this location — add one in the Locations tab.' : undefined}
              />
            ) : null}
            <Text style={styles.hint}>
              Hunting a new spot?{' '}
              <Text style={styles.link} onPress={onCancel}>
                Add it in Locations first →
              </Text>
            </Text>
          </View>

          {/* Read-only map, shown once a blind is picked — it confirms the spot
              rather than inviting an edit, so it takes no gestures. */}
          {coords ? (
            <View style={styles.mapWrap} pointerEvents="none">
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: coords.lat,
                  longitude: coords.lng,
                  latitudeDelta: 0.004,
                  longitudeDelta: 0.004,
                }}
                mapType="hybrid"
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }} pinColor={colors.accent} />
              </MapView>
            </View>
          ) : null}

          <View style={styles.harvestBox}>
            <View style={styles.harvestHead}>
              <View style={styles.grow}>
                <Text style={styles.harvestTitle}>HARVEST</Text>
                <Text style={styles.hint}>What did you bring home?</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setHarvests(prev => [
                    ...prev,
                    { species: allSpecies[0] ?? '', harvested: 0, missed: 0, shot_not_recovered: 0, seen: 0, mine: 0, confirmed: false },
                  ])
                }
                style={({ pressed }) => [styles.addSpecies, pressed && { opacity: 0.8 }]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView name="plus" tintColor={colors.textInverse} size={13} />
                ) : (
                  <Ionicons name="add" size={14} color={colors.textInverse} />
                )}
                <Text style={styles.addSpeciesText}>Add Species</Text>
              </Pressable>
            </View>

            {harvests.length === 0 ? (
              <View style={styles.harvestEmpty}>
                <Text style={styles.harvestEmptyTitle}>No harvest entries yet.</Text>
                <Text style={styles.hint}>Tap “Add Species” to log your bag.</Text>
              </View>
            ) : (
              <View style={styles.harvestList}>
                {harvests.map((harvest, i) => (
                  <HarvestEntryCard
                    key={i}
                    harvest={harvest}
                    index={i}
                    allSpecies={allSpecies}
                    hasParty={party.length > 0}
                    onUpdate={(field, value) => updateHarvest(i, field, value)}
                    onRemove={() => setHarvests(prev => prev.filter((_, j) => j !== i))}
                    onPickSpecies={() => setSpeciesSheetFor(i)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.block}>
            <SectionLabel>Photos</SectionLabel>
            <Pressable
              accessibilityRole="button"
              onPress={addPhotos}
              style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.7 }]}
            >
              {Platform.OS === 'ios' ? (
                <SymbolView name="camera" tintColor={colors.textMuted} size={19} />
              ) : (
                <Ionicons name="camera-outline" size={20} color={colors.textMuted} />
              )}
              <Text style={styles.photoBtnText}>Add Photos</Text>
            </Pressable>
            {photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {photos.map((photo, i) => (
                  <View key={i} style={styles.photoCell}>
                    <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      hitSlop={8}
                      onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      style={styles.photoRemove}
                    >
                      {Platform.OS === 'ios' ? (
                        <SymbolView name="xmark" tintColor={colors.textInverse} size={11} />
                      ) : (
                        <Ionicons name="close" size={13} color={colors.textInverse} />
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes about this hunt…"
            multiline
            numberOfLines={3}
            style={styles.notes}
          />

          <Button
            label={saving ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Record Hunt'}
            onPress={submit}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'location'}
        title="Location"
        options={locationOptions}
        selected={locationId}
        onSelect={chooseLocation}
        onClose={() => setSheet(null)}
        emptyMessage="No locations yet — add one in the Locations tab first."
      />
      <OptionSheet
        visible={sheet === 'blind'}
        title="Blind"
        options={blindOptions}
        selected={blindId}
        onSelect={chooseBlind}
        onClose={() => setSheet(null)}
        emptyMessage="No blinds at this location — add one in the Locations tab."
      />
      <OptionSheet
        visible={speciesSheetFor !== null}
        title="Species"
        options={speciesOptions}
        selected={speciesSheetFor !== null ? harvests[speciesSheetFor]?.species : undefined}
        onSelect={value => {
          if (speciesSheetFor !== null) updateHarvest(speciesSheetFor, 'species', value);
        }}
        onClose={() => setSpeciesSheetFor(null)}
        showSpeciesIcons
      />
    </>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: space.xxl },
  flex: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.xl },
  block: { gap: space.sm },
  hint: { ...type.bodySmall, fontSize: 12, color: colors.textMuted },
  link: { fontFamily: 'WorkSans_600SemiBold', color: colors.text, textDecorationLine: 'underline' },

  dateWrap: { alignSelf: 'flex-start' },
  dateBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  dateText: { ...type.body, color: colors.text },

  timeRow: { flexDirection: 'row', gap: space.md },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  timeBtnOn: { backgroundColor: colors.text, borderColor: colors.text },
  checkbox: {
    width: 16, height: 16, borderRadius: 3,
    borderWidth: 1, borderColor: colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.textInverse, borderColor: colors.textInverse },
  timeText: { ...type.button, fontSize: 15, color: colors.textMuted },
  timeTextOn: { color: colors.textInverse },

  partyRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  addBtn: {
    minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.sm,
    backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { ...type.button, fontSize: 15, color: colors.textInverse },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  partyChip: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
    borderRadius: radius.pill, paddingLeft: space.md, paddingRight: space.sm,
    minHeight: 34,
  },
  partyChipText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.text },

  mapWrap: {
    height: 192, borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.hairline,
  },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // Green-tinted, as on web — the one place the accent carries a surface, since
  // harvest is the data the whole screen exists to collect.
  harvestBox: {
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(27, 94, 69, 0.20)',
    backgroundColor: 'rgba(27, 94, 69, 0.05)',
  },
  harvestHead: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.md,
    paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(27, 94, 69, 0.15)',
  },
  harvestTitle: { ...type.label, color: colors.accent },
  addSpecies: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs + 2,
    backgroundColor: colors.accent, borderRadius: radius.sm,
    paddingHorizontal: space.md, minHeight: 40,
  },
  addSpeciesText: { ...type.bodySmall, fontFamily: 'WorkSans_600SemiBold', color: colors.textInverse },
  harvestEmpty: { paddingVertical: space.xl, paddingHorizontal: space.lg, alignItems: 'center', gap: 2 },
  harvestEmptyTitle: { ...type.bodySmall, color: colors.textMuted },
  harvestList: { padding: space.lg, gap: space.md },

  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.hairline,
    borderRadius: radius.md, paddingVertical: space.lg,
  },
  photoBtnText: { ...type.button, fontSize: 15, color: colors.textMuted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  photoCell: { width: '31.5%', aspectRatio: 1, position: 'relative' },
  photo: { width: '100%', height: '100%', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center',
  },

  notes: { minHeight: 90, textAlignVertical: 'top' },
});
