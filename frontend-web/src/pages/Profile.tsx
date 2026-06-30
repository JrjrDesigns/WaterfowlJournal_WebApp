import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PaywallModal from '../components/PaywallModal'
import { exportHuntsCSV } from '../utils/api'

export default function Profile() {
  const { user, isPro, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showPaywall, setShowPaywall] = useState(false)
  const [showUpgradePanel, setShowUpgradePanel] = useState(false)

  useEffect(() => {
    if (searchParams.get('upgrade') === '1') {
      setShowUpgradePanel(true)
    }
    refreshUser()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const handleExport = () => {
    if (!isPro) {
      setShowPaywall(true)
      return
    }
    exportHuntsCSV()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="export" />}

      <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-6">Profile</h1>

      {/* User card */}
      <div className="bg-navy-800 border border-gray-700 rounded-2xl p-6 text-center mb-6">
        <div className="w-20 h-20 bg-orange-500/20 border border-orange-500/40 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-3xl font-extrabold text-orange-500">
            {user?.name?.charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 className="text-xl font-extrabold text-white">{user?.name}</h2>
        <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full mt-3 text-sm font-bold ${
          isPro ? 'bg-orange-500/20 border border-orange-500/50 text-orange-500' : 'bg-navy-700 border border-gray-600 text-gray-400'
        }`}>
          {isPro ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Pro
            </>
          ) : (
            'Free Plan'
          )}
        </div>
      </div>

      {/* Upgrade panel */}
      {!isPro && (
        <div className={`mb-6 ${showUpgradePanel ? '' : ''}`}>
          {showUpgradePanel ? (
            <div className="bg-navy-800 border border-orange-500/40 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-1">Upgrade to Pro</h3>
              <p className="text-gray-400 text-sm mb-4">Unlock unlimited hunts, advanced analytics, weather data, and CSV export.</p>

              <div className="space-y-2 mb-6">
                {[
                  'Unlimited hunt logs',
                  'Advanced analytics & charts',
                  'Weather data on all hunts',
                  'CSV data export',
                ].map(f => (
                  <div key={f} className="flex items-center gap-3 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>

              <div className="bg-navy-900 border border-gray-700 rounded-xl p-4 mb-4 text-center">
                <p className="text-3xl font-extrabold text-white">$4.99<span className="text-sm text-gray-400 font-normal">/month</span></p>
                <p className="text-xs text-gray-500 mt-1">Cancel anytime</p>
              </div>

              <button
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
                onClick={() => {
                  // Stripe checkout would be wired here once backend endpoint is live
                  alert('Stripe checkout — wire up VITE_STRIPE_PRICE_ID and backend /api/subscription/create-checkout-session')
                }}
              >
                Subscribe — $4.99/month
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowUpgradePanel(true)}
              className="w-full bg-navy-800 border border-orange-500/40 hover:border-orange-500 rounded-xl p-4 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Upgrade to Pro</p>
                  <p className="text-xs text-gray-400">Unlock all features for $4.99/mo</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-orange-500 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Pro subscription management */}
      {isPro && (
        <div className="bg-navy-800 border border-green-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Pro Subscription Active</p>
            <p className="text-xs text-gray-400 mt-0.5">All features unlocked</p>
          </div>
          <button
            onClick={() => alert('Stripe customer portal — wire up backend /api/subscription/customer-portal')}
            className="text-xs text-orange-500 hover:text-orange-400 font-semibold"
          >
            Manage →
          </button>
        </div>
      )}

      {/* Menu */}
      <div className="bg-navy-800 border border-gray-700 rounded-2xl divide-y divide-gray-800 mb-6 overflow-hidden">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-navy-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-navy-700 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Export Data</p>
              <p className="text-xs text-gray-500">Download CSV of hunt history</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isPro && (
              <span className="text-xs bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full font-semibold">Pro</span>
            )}
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-400 font-bold py-3 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign Out
      </button>

      <p className="text-center text-gray-700 text-xs mt-6">Version 1.0.0 · Waterfowl Journal</p>
    </div>
  )
}
