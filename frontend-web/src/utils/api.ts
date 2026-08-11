const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'

const handleUnauthorized = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.setItem('sessionExpired', '1')
  window.dispatchEvent(new Event('auth:expired'))
}

// Generous by default: hunts can carry a compressed photo and get logged from
// places with poor signal. Short-running calls pass their own lower timeout.
const DEFAULT_TIMEOUT_MS = 45000

// A fetch that never gets a response rejects with a TypeError whose message is
// raw browser jargon — "Load failed" on Safari, "Failed to fetch" on Chrome,
// "NetworkError when attempting to fetch resource" on Firefox. Shown as-is it
// reads like an app bug, so a tester with one bar of service blames the signup
// form instead of their signal. Translate it into something actionable.
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

const isNetworkFailure = (err: unknown): boolean =>
  err instanceof TypeError ||
  (err instanceof DOMException && err.name === 'AbortError') ||
  err instanceof NetworkError

const networkErrorMessage = (): string =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? "You're offline. Reconnect and try again — nothing was saved."
    : "Couldn't reach Blind Guide. Check your signal and try again."

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) => {
  const token = localStorage.getItem('token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  // Without this a stalled request never settles, leaving buttons stuck on
  // their loading label with no error and no way back.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NetworkError('That took too long to respond. Check your connection and try again.')
    }
    // fetch only rejects for network-level failures; anything else is a bug.
    if (err instanceof TypeError) {
      throw new NetworkError(networkErrorMessage())
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401) {
    handleUnauthorized()
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || 'Request failed')
  }

  // A proxy or cold-start page can return 200 with an HTML body; parsing that
  // as JSON throws a syntax error that reads like a crash. It's a transport
  // problem, so report it as one.
  try {
    return await response.json()
  } catch {
    throw new NetworkError("Got an unexpected response from the server. Try again in a moment.")
  }
}

// Auth — sign in / sign up. Both are quick round-trips with the user watching a
// spinner, so they fail fast rather than riding the 45s default.
const AUTH_TIMEOUT_MS = 20000

export const loginRequest = (email: string, password: string) =>
  apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, AUTH_TIMEOUT_MS)

export const registerRequest = async (email: string, password: string, name: string) => {
  const submit = () =>
    apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }, AUTH_TIMEOUT_MS)

  try {
    return await submit()
  } catch (err) {
    if (!isNetworkFailure(err)) throw err

    // The request may have reached the server with only the response lost on
    // the way back — from here that's indistinguishable from never sending it.
    // Retrying settles it: either this one creates the account, or the server
    // says the email is taken, which means the first attempt did land. In that
    // case it's this user's own account and the password they just typed
    // proves it, so finish the job by signing them in instead of stranding
    // them at a form that insists their brand-new email is already in use.
    try {
      return await submit()
    } catch (retryErr) {
      const message = retryErr instanceof Error ? retryErr.message : ''
      if (/already registered/i.test(message)) {
        try {
          return await loginRequest(email, password)
        } catch {
          throw new Error('That email already has an account. Try signing in instead.')
        }
      }
      throw retryErr
    }
  }
}

// Auth — password reset
export const requestPasswordReset = (email: string) =>
  apiRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, 20000)

export const resetPassword = (token: string, password: string) =>
  apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  }, 20000)

// Locations
export const fetchLocations = () => apiRequest('/api/locations')

export const createLocation = (data: unknown) =>
  apiRequest('/api/locations', { method: 'POST', body: JSON.stringify(data) })

export const deleteLocation = (id: string) =>
  apiRequest(`/api/locations/${id}`, { method: 'DELETE' })

// Blinds
export const fetchBlindsForLocation = (locationId: string) =>
  apiRequest(`/api/locations/${locationId}/blinds`)

export const fetchAllBlinds = () => apiRequest('/api/blinds')

export const createBlind = (locationId: string, data: unknown) =>
  apiRequest(`/api/locations/${locationId}/blinds`, { method: 'POST', body: JSON.stringify(data) })

export const updateBlind = (id: string, data: unknown) =>
  apiRequest(`/api/blinds/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteBlind = (id: string) =>
  apiRequest(`/api/blinds/${id}`, { method: 'DELETE' })

// Hunts
export const fetchHunts = (year?: number) => {
  const url = year ? `/api/hunts?year=${year}` : '/api/hunts'
  return apiRequest(url)
}

export const fetchHunt = (id: string) => apiRequest(`/api/hunts/${id}`)

export const fetchHuntYears = () => apiRequest('/api/hunts/years')

export const createHunt = (data: unknown) =>
  apiRequest('/api/hunts', { method: 'POST', body: JSON.stringify(data) })

export const updateHunt = (id: string, data: unknown) =>
  apiRequest(`/api/hunts/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteHunt = (id: string) =>
  apiRequest(`/api/hunts/${id}`, { method: 'DELETE' })

export const fetchStatistics = (year?: number) => {
  const url = year ? `/api/statistics?year=${year}` : '/api/statistics'
  return apiRequest(url)
}

export const fetchForecast = () => apiRequest('/api/forecast')

export const fetchSpecies = () => apiRequest('/api/species')

export const fetchSubscriptionStatus = () => apiRequest('/api/subscription/status')

// Billing calls are quick round-trips to Stripe; if one stalls the customer is
// staring at a spinner mid-payment, so fail fast enough to show a retry.
const BILLING_TIMEOUT_MS = 20000

export const createCheckoutSession = (priceId?: string) =>
  apiRequest('/api/subscription/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify(priceId ? { price_id: priceId } : {}),
  }, BILLING_TIMEOUT_MS)

export const createCustomerPortalSession = () =>
  apiRequest('/api/subscription/customer-portal', { method: 'POST' }, BILLING_TIMEOUT_MS)

export const pauseSubscription = (months: number) =>
  apiRequest('/api/subscription/pause', {
    method: 'POST',
    body: JSON.stringify({ months }),
  }, BILLING_TIMEOUT_MS)

export const resumeSubscription = () =>
  apiRequest('/api/subscription/resume', { method: 'POST' }, BILLING_TIMEOUT_MS)

export const exportHuntsCSV = () => {
  const token = localStorage.getItem('token')
  const url = `${API_URL}/api/hunts/export/csv`
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'hunts.csv')
  const headers = token ? `Bearer ${token}` : ''
  fetch(url, { headers: { Authorization: headers } })
    .then(res => res.blob())
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob)
      link.href = objectUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
    })
}
