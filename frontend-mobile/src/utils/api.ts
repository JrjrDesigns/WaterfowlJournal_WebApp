import { secureGet, secureDelete, cacheDelete, TOKEN_KEY, USER_KEY } from './storage';

/* Ported from frontend-web/src/utils/api.ts. Keep the two in step — the error
 * copy, the timeouts and the register-retry behaviour below were all arrived at
 * deliberately on web and are not worth re-deriving differently here.
 *
 * The one structural difference: the web reads its token from localStorage
 * synchronously. Secure storage on device is async, so every call awaits the
 * token before it can build its headers. */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.blindguideapp.com';

// Generous by default: hunts can carry a photo and get logged from places with
// poor signal. Short-running calls pass their own lower timeout.
const DEFAULT_TIMEOUT_MS = 45000;

/* A fetch that never gets a response rejects with a TypeError whose message is
 * raw platform jargon. Shown as-is it reads like an app bug, so a hunter with
 * one bar blames the app instead of their signal. Translate it. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

const isNetworkFailure = (err: unknown): boolean =>
  err instanceof TypeError || err instanceof NetworkError || isAbort(err);

const isAbort = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';

/* Session expiry is a global event — any screen can be the one holding a stale
 * token when it lapses. Rather than thread a callback through every call site,
 * the auth layer subscribes once here and handles the redirect in one place. */
type ExpiryListener = () => void;
const expiryListeners = new Set<ExpiryListener>();

export const onSessionExpired = (fn: ExpiryListener): (() => void) => {
  expiryListeners.add(fn);
  return () => expiryListeners.delete(fn);
};

const handleUnauthorized = async () => {
  await Promise.all([secureDelete(TOKEN_KEY), cacheDelete(USER_KEY)]);
  expiryListeners.forEach(fn => fn());
};

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) => {
  const token = await secureGet(TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  // Without this a stalled request never settles, leaving buttons stuck on
  // their loading label with no error and no way back.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbort(err)) {
      throw new NetworkError('That took too long to respond. Check your connection and try again.');
    }
    if (err instanceof TypeError) {
      throw new NetworkError("Couldn't reach Blind Guide. Check your signal and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    await handleUnauthorized();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  /* A proxy or cold-start page can return 200 with an HTML body; parsing that
   * as JSON throws a syntax error that reads like a crash. It's a transport
   * problem, so report it as one. */
  try {
    return await response.json();
  } catch {
    throw new NetworkError('Got an unexpected response from the server. Try again in a moment.');
  }
};

// Auth. Both are quick round-trips with the user watching a spinner, so they
// fail fast rather than riding the 45s default.
const AUTH_TIMEOUT_MS = 20000;

export const loginRequest = (email: string, password: string) =>
  apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, AUTH_TIMEOUT_MS);

export const registerRequest = async (email: string, password: string, name: string) => {
  const submit = () =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }, AUTH_TIMEOUT_MS);

  try {
    return await submit();
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;

    /* The request may have reached the server with only the response lost on
     * the way back — from here that's indistinguishable from never sending it.
     * Retrying settles it: either this one creates the account, or the server
     * says the email is taken, which means the first attempt did land. In that
     * case it's this user's own account and the password they just typed
     * proves it, so finish the job by signing them in rather than stranding
     * them at a form insisting their brand-new email is already in use. */
    try {
      return await submit();
    } catch (retryErr) {
      const message = retryErr instanceof Error ? retryErr.message : '';
      if (/already registered/i.test(message)) {
        try {
          return await loginRequest(email, password);
        } catch {
          throw new Error('That email already has an account. Try signing in instead.');
        }
      }
      throw retryErr;
    }
  }
};

export const requestPasswordReset = (email: string) =>
  apiRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, AUTH_TIMEOUT_MS);

export const resetPassword = (token: string, password: string) =>
  apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }, AUTH_TIMEOUT_MS);

/* Scheduling a deletion cancels billing at Stripe first, so allow for that
 * round trip rather than timing out mid-way and leaving the user unsure what
 * happened. Apple guideline 5.1.1(v) requires this path exist in-app. */
export const requestAccountDeletion = (password: string, email: string) =>
  apiRequest('/api/account/delete', {
    method: 'POST',
    body: JSON.stringify({ password, email }),
  }, 30000);

export const restoreAccount = () =>
  apiRequest('/api/account/restore', { method: 'POST' }, 20000);

// Locations
export const fetchLocations = () => apiRequest('/api/locations');

export const createLocation = (data: unknown) =>
  apiRequest('/api/locations', { method: 'POST', body: JSON.stringify(data) });

export const deleteLocation = (id: string) =>
  apiRequest(`/api/locations/${id}`, { method: 'DELETE' });

// Blinds. Note these hang off a location — a blind cannot exist without one.
export const fetchBlindsForLocation = (locationId: string) =>
  apiRequest(`/api/locations/${locationId}/blinds`);

export const fetchAllBlinds = () => apiRequest('/api/blinds');

export const createBlind = (locationId: string, data: unknown) =>
  apiRequest(`/api/locations/${locationId}/blinds`, { method: 'POST', body: JSON.stringify(data) });

export const updateBlind = (id: string, data: unknown) =>
  apiRequest(`/api/blinds/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteBlind = (id: string) =>
  apiRequest(`/api/blinds/${id}`, { method: 'DELETE' });

// Hunts
//
// Everything is filtered by season, not calendar year — a season runs from
// July 1 through June 30, so the hunts either side of New Year's stay together.
// `season` is the year the season opened in: 2025 is the one labelled "25/26".
export const fetchHunts = (season?: number) =>
  apiRequest(season ? `/api/hunts?season=${season}` : '/api/hunts');

export const fetchHunt = (id: string) => apiRequest(`/api/hunts/${id}`);

export interface Season {
  start: number;
  label: string;
}

/* The label ("25/26") comes from the server so this app and the web app can't
 * drift on what a season is called. */
export const fetchHuntSeasons = (): Promise<{ seasons: Season[] }> =>
  apiRequest('/api/hunts/seasons');

export const createHunt = (data: unknown) =>
  apiRequest('/api/hunts', { method: 'POST', body: JSON.stringify(data) });

export const updateHunt = (id: string, data: unknown) =>
  apiRequest(`/api/hunts/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteHunt = (id: string) =>
  apiRequest(`/api/hunts/${id}`, { method: 'DELETE' });

// Statistics. Two endpoints, deliberately — see fetchSeasonSummary.
export const fetchStatistics = (season?: number) =>
  apiRequest(season ? `/api/statistics?season=${season}` : '/api/statistics');

/* The free Season Card. Its own endpoint, not a trimmed /api/statistics — the
 * Pro payload is never sent to a free client in the first place, so there is
 * nothing to uncover by reading the response. */
export const fetchSeasonSummary = (season?: number) =>
  apiRequest(season ? `/api/statistics/summary?season=${season}` : '/api/statistics/summary');

/* locationId only does anything on free accounts, which see one location at a
 * time; Pro always gets every location back. */
export const fetchForecast = (locationId?: string) =>
  apiRequest(locationId ? `/api/forecast?location_id=${locationId}` : '/api/forecast');

export const fetchSpecies = () => apiRequest('/api/species');

// Billing
export const fetchSubscriptionStatus = () => apiRequest('/api/subscription/status');

// Quick round-trips to Stripe; if one stalls the customer is staring at a
// spinner mid-payment, so fail fast enough to show a retry.
const BILLING_TIMEOUT_MS = 20000;

/* Sends the plan the customer picked, not a price. The server owns the mapping
 * from plan to Stripe price — a client that could name its own price could name
 * a cheaper one. */
export const createCheckoutSession = (plan: 'monthly' | 'annual') =>
  apiRequest('/api/subscription/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  }, BILLING_TIMEOUT_MS);

export const createCustomerPortalSession = () =>
  apiRequest('/api/subscription/customer-portal', { method: 'POST' }, BILLING_TIMEOUT_MS);

export const pauseSubscription = (months: number) =>
  apiRequest('/api/subscription/pause', {
    method: 'POST',
    body: JSON.stringify({ months }),
  }, BILLING_TIMEOUT_MS);

export const resumeSubscription = () =>
  apiRequest('/api/subscription/resume', { method: 'POST' }, BILLING_TIMEOUT_MS);

/* Hand Apple's signed transaction to the server, which verifies the signature
 * against Apple's certificate chain and sets subscription_status itself.
 *
 * The client never asserts that someone is Pro — it forwards a receipt it cannot
 * forge and lets the server decide. Anything else would make Pro a one-line
 * patch away for anyone with a debugger. */
export const verifyApplePurchase = (jws: string) =>
  apiRequest('/api/subscription/apple/verify', {
    method: 'POST',
    body: JSON.stringify({ jws }),
  }, BILLING_TIMEOUT_MS);

export { API_URL };
