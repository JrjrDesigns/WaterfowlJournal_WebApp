import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import HuntList from './pages/hunts/HuntList'
import HuntCreate from './pages/hunts/HuntCreate'
import HuntDetail from './pages/hunts/HuntDetail'
import HuntEdit from './pages/hunts/HuntEdit'
import Locations from './pages/Locations'
import Stats from './pages/Stats'
import Profile from './pages/Profile'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-ink" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth/login" replace />
  return <>{children}</>
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/hunts" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/auth/register" element={<AuthRoute><Register /></AuthRoute>} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/hunts" element={<HuntList />} />
        <Route path="/hunts/create" element={<HuntCreate />} />
        <Route path="/hunts/:id" element={<HuntDetail />} />
        <Route path="/hunts/:id/edit" element={<HuntEdit />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="/" element={<Navigate to="/hunts" replace />} />
      <Route path="*" element={<Navigate to="/hunts" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
