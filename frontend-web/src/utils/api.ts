const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'

export const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || 'Request failed')
  }

  return response.json()
}

export const fetchBlinds = () => apiRequest('/api/blinds')

export const createBlind = (data: unknown) =>
  apiRequest('/api/blinds', { method: 'POST', body: JSON.stringify(data) })

export const updateBlind = (id: string, data: unknown) =>
  apiRequest(`/api/blinds/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteBlind = (id: string) =>
  apiRequest(`/api/blinds/${id}`, { method: 'DELETE' })

export const fetchHunts = (year?: number) => {
  const url = year ? `/api/hunts?year=${year}` : '/api/hunts'
  return apiRequest(url)
}

export const fetchHunt = (id: string) => apiRequest(`/api/hunts/${id}`)

export const fetchHuntYears = () => apiRequest('/api/hunts/years')

export const createHunt = (data: unknown) =>
  apiRequest('/api/hunts', { method: 'POST', body: JSON.stringify(data) })

export const deleteHunt = (id: string) =>
  apiRequest(`/api/hunts/${id}`, { method: 'DELETE' })

export const fetchStatistics = (year?: number) => {
  const url = year ? `/api/statistics?year=${year}` : '/api/statistics'
  return apiRequest(url)
}

export const fetchSpecies = () => apiRequest('/api/species')

export const fetchSubscriptionStatus = () => apiRequest('/api/subscription/status')

export const createCheckoutSession = (priceId: string) =>
  apiRequest('/api/subscription/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ price_id: priceId }),
  })

export const createCustomerPortalSession = () =>
  apiRequest('/api/subscription/customer-portal', { method: 'POST' })

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
