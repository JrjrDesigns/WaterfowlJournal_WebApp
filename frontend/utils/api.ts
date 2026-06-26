import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = await AsyncStorage.getItem('token');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Request failed');
  }

  return response.json();
};

export const fetchBlinds = () => apiRequest('/api/blinds');

export const createBlind = (data: any) => 
  apiRequest('/api/blinds', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateBlind = (id: string, data: any) => 
  apiRequest(`/api/blinds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteBlind = (id: string) => 
  apiRequest(`/api/blinds/${id}`, { method: 'DELETE' });

export const fetchHunts = (year?: number) => {
  const url = year ? `/api/hunts?year=${year}` : '/api/hunts';
  return apiRequest(url);
};

export const fetchHuntYears = () => apiRequest('/api/hunts/years');

export const createHunt = (data: any) => 
  apiRequest('/api/hunts', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const fetchStatistics = (year?: number) => {
  const url = year ? `/api/statistics?year=${year}` : '/api/statistics';
  return apiRequest(url);
};

export const fetchSpecies = () => apiRequest('/api/species');
