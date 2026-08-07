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
      throw new Error('That took too long to respond. Check your connection and try again.')
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

  return response.json()
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
