import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  apiRequest,
  loginRequest,
  registerRequest,
  onSessionExpired,
} from '@/utils/api';
import {
  secureGet, secureSet, secureDelete,
  cacheGet, cacheSet, cacheDelete,
  TOKEN_KEY, USER_KEY,
} from '@/utils/storage';

export interface User {
  id: string;
  email: string;
  name: string;
  subscription_status: string;
  subscription_paused?: boolean;
  subscription_resumes_at?: number | null;
  deletion_scheduled_for?: number | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isPro: boolean;
  isPaused: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* Restore the session before the first paint of any real screen. `loading`
   * gates the router, so a returning user goes straight to their hunts instead
   * of flashing the login screen for a frame on every cold start. */
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          secureGet(TOKEN_KEY),
          cacheGet(USER_KEY),
        ]);
        if (storedToken && storedUser) setUser(JSON.parse(storedUser) as User);
      } catch {
        // A corrupt cached user is not worth stranding anyone over — drop the
        // session and let them sign in again.
        await Promise.all([secureDelete(TOKEN_KEY), cacheDelete(USER_KEY)]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The API layer clears storage on a 401; this just catches up the UI.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const adoptSession = useCallback(async (data: { access_token: string; user: User }) => {
    await Promise.all([
      secureSet(TOKEN_KEY, data.access_token),
      cacheSet(USER_KEY, JSON.stringify(data.user)),
    ]);
    setUser(data.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await adoptSession(await loginRequest(email, password));
  }, [adoptSession]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    await adoptSession(await registerRequest(email, password, name));
  }, [adoptSession]);

  const logout = useCallback(async () => {
    await Promise.all([secureDelete(TOKEN_KEY), cacheDelete(USER_KEY)]);
    setUser(null);
  }, []);

  /* Subscription state changes outside the app — a Stripe renewal, a card
   * failure, a cancellation from the billing portal — so the cached user goes
   * stale. Screens that gate on Pro call this on focus. Failure is silent by
   * design: a refresh that can't reach the server should leave the last known
   * state alone rather than downgrade someone to Free on a dropped signal. */
  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/me', {}, 15000);
      const next: User = {
        id: data.id,
        email: data.email,
        name: data.name,
        subscription_status: data.subscription_status,
        subscription_paused: data.subscription_paused ?? false,
        subscription_resumes_at: data.subscription_resumes_at ?? null,
        deletion_scheduled_for: data.deletion_scheduled_for ?? null,
      };
      setUser(next);
      await cacheSet(USER_KEY, JSON.stringify(next));
    } catch {
      // Deliberately silent — see above.
    }
  }, []);

  /* The backend writes 'pro'. 'premium' is accepted too because the web client
   * accepts it; dropping it here would make the two apps disagree about who is
   * paying, which is the worst possible disagreement to have. */
  const isPro =
    user?.subscription_status === 'pro' || user?.subscription_status === 'premium';

  // A paused subscriber is not Pro — they keep their data but lose the features
  // until billing resumes.
  const isPaused = user?.subscription_paused === true;

  const value = useMemo(
    () => ({ user, loading, isPro, isPaused, login, register, logout, refreshUser }),
    [user, loading, isPro, isPaused, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
