import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, StyleSheet } from 'react-native';

import type { Coords } from '@/hooks/use-current-position';
import { colors, type, space, radius } from '@/constants/theme';

/* The place search from frontend-web/src/pages/Locations.tsx — one field, a Go
 * button, and an error line. Always visible, never behind a disclosure.
 *
 * One difference from web, by the owner's instruction: this single field also
 * accepts a raw coordinate pair. If what you typed parses as two numbers it is
 * used directly; otherwise it goes to the geocoder. No mode toggle — the field
 * works out which you meant.
 */

// Nominatim's usage policy wants an identifying User-Agent. A browser sets one
// for you; a native app must send it or risk being blocked.
const NOMINATIM_UA = 'BlindGuide/1.0 (https://blindguideapp.com)';

/* "41.50619, -83.19827" — also tolerant of a space or semicolon separator,
 * because coordinates arrive pasted from a text message or another map app. */
const parseCoords = (raw: string): Coords | null => {
  const parts = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

export function PlaceSearch({ onPick }: { onPick: (coords: Coords) => void }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    setError('');

    // Coordinates need no round trip.
    const typed = parseCoords(q);
    if (typed) {
      onPick(typed);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': NOMINATIM_UA } },
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError('No results found');
        return;
      }
      onPick({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
    } catch {
      setError('Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a town, lake, or landmark…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={submit}
          // A "place" field, never "address" — iOS reads an address label as a
          // contact field and offers to autofill it from Contacts.
          textContentType="none"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={submit}
          disabled={searching}
          style={({ pressed }) => [styles.go, pressed && { opacity: 0.7 }]}
        >
          {searching ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.goText}>Go</Text>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  input: {
    ...type.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 48,
  },
  go: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { ...type.button, color: colors.textInverse },
  error: { ...type.bodySmall, color: colors.danger },
});
