import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/auth';

/* The entry route. `/` is where a cold launch lands, and without something
 * here expo-router renders its "page could not be found" screen — the guard in
 * _layout.tsx redirects only after mount, which is a frame too late.
 *
 * Rendering null while `loading` keeps the splash-to-app transition clean:
 * the session is read from secure storage before this decides anything, so a
 * returning user never sees the login screen flash past. */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return <Redirect href={user ? '/(tabs)/hunts' : '/(auth)/login'} />;
}
