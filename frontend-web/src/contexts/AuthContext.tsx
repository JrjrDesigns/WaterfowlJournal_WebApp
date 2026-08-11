import React, { createContext, useState, useContext, useEffect } from 'react'
import { loginRequest, registerRequest } from '../utils/api'

interface User {
  id: string
  email: string
  name: string
  subscription_status: string
  subscription_paused?: boolean
  subscription_resumes_at?: number | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  isPro: boolean
  isPaused: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const handleExpired = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [])

  const refreshUser = async () => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) return
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
      if (res.ok) {
        const userData = await res.json()
        const user = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          subscription_status: userData.subscription_status,
          subscription_paused: userData.subscription_paused ?? false,
          subscription_resumes_at: userData.subscription_resumes_at ?? null,
        }
        setUser(user)
        localStorage.setItem('user', JSON.stringify(user))
      }
    } catch {
      // silently ignore
    }
  }

  // Both auth calls go through apiRequest so they inherit its timeout, abort
  // handling and network-error wording. Hand-rolled fetches here used to hang
  // forever on a stalled connection and surface raw browser text like
  // "Load failed" straight into the form.
  const adoptSession = (data: { access_token: string; user: User }) => {
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
  }

  const login = async (email: string, password: string) => {
    adoptSession(await loginRequest(email, password))
  }

  const register = async (email: string, password: string, name: string) => {
    adoptSession(await registerRequest(email, password, name))
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  const isPro =
    user?.subscription_status === 'pro' ||
    user?.subscription_status === 'premium'

  // A paused subscriber is not Pro — they keep their data but lose the features
  // until billing resumes.
  const isPaused = user?.subscription_paused === true

  return (
    <AuthContext.Provider value={{ user, token, loading, isPro, isPaused, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
