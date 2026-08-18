import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

/* "Drop a pin where I'm standing."
 *
 * The web app has no geolocation at all — spots are placed by tapping a map,
 * which is fine at a desk and useless in a marsh. This is the native capability
 * that earns the app its place on a phone, so its failure modes get real
 * handling rather than a swallowed catch.
 *
 * Three distinct outcomes the caller must be able to tell apart:
 *   - denied once     → ask again next time, explain why
 *   - denied forever  → only Settings can undo it, so offer to open Settings
 *   - no fix          → permission is fine, the sky isn't; retrying may work
 */
export type PositionError = 'denied' | 'blocked' | 'unavailable' | null;

export function useCurrentPosition() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<PositionError>(null);

  const locate = useCallback(async (): Promise<Coords | null> => {
    setLocating(true);
    setError(null);
    try {
      const existing = await Location.getForegroundPermissionsAsync();

      let granted = existing.granted;
      if (!granted) {
        // canAskAgain false means the user has turned it off for good; asking
        // again silently no-ops and would leave the button looking broken.
        if (!existing.canAskAgain) {
          setError('blocked');
          return null;
        }
        const asked = await Location.requestForegroundPermissionsAsync();
        granted = asked.granted;
        if (!granted) {
          setError(asked.canAskAgain ? 'denied' : 'blocked');
          return null;
        }
      }

      /* Balanced accuracy, not Highest. Highest keeps the GPS radio hunting for
       * sub-metre precision that a hunting spot does not need, which costs
       * seconds and battery in exactly the place where both matter. */
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return { lat: fix.coords.latitude, lng: fix.coords.longitude };
    } catch {
      setError('unavailable');
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return { locate, locating, error, openSettings, clearError: () => setError(null) };
}

export const positionErrorMessage = (error: PositionError): string => {
  switch (error) {
    case 'denied':
      return 'Location is off, so we can’t place a pin where you’re standing. Tap the map to set it by hand instead.';
    case 'blocked':
      return 'Location access is turned off for Blind Guide. Turn it on in Settings, or tap the map to set the spot by hand.';
    case 'unavailable':
      return 'Couldn’t get a fix — that usually means poor sky view. Try again, or tap the map to set the spot by hand.';
    default:
      return '';
  }
};
