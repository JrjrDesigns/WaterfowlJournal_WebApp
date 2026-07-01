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
    if (searchParams.get('upgrade') === '1') setShowUpgradePanel(true)
    refreshUser()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const handleExport = () => {
    if (!isPro) { setShowPaywall(true); return }
    exportHuntsCSV()
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="export" />}

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
          <span className="inline-block w-5 h-px bg-muted/50" />
          Account
        </p>
        <h1 className="font-display text-4xl text-ink tracking-wider leading-none">PROFILE</h1>
      </div>

      {/* User card */}
      <div className="bg-surface border border-hairline rounded-xl p-6 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-ink rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink truncate">{user?.name}</p>
            <p className="text-muted text-sm truncate">{user?.email}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
            isPro
              ? 'text-green border-green/30 bg-green/5'
              : 'text-muted border-hairline bg-bg'
          }`}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>
      </div>

      {/* Upgrade panel */}
      {!isPro && (
        <div className="mb-4">
          {showUpgradePanel ? (
            <div className="bg-surface border border-hairline rounded-xl p-6">
              <h3 className="font-display text-2xl text-ink tracking-wider leading-none mb-1">GO PRO</h3>
              <p className="text-muted text-sm mb-5">Unlock the forecast, advanced analytics, automatic weather, and unlimited hunts.</p>

              <ul className="space-y-2 mb-6">
                {[
                  'Unlimited hunt logs',
                  'Flight forecasts & movement scores',
                  'Advanced season analytics',
                  'Automatic weather on all hunts',
                  'CSV data export',
                ].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-ink">
                    <svg className="w-4 h-4 text-green flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="border border-hairline rounded-lg p-4 mb-4 text-center">
                <p className="font-display text-4xl text-ink tracking-wider leading-none">$4.99<span className="text-base font-sans font-normal text-muted">/mo</span></p>
                <p className="text-xs text-muted mt-1">Cancel anytime</p>
              </div>

              <button
                className="w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                onClick={() => {
                  alert('Stripe checkout — wire up VITE_STRIPE_PRICE_ID and backend /api/subscription/create-checkout-session')
                }}
              >
                Subscribe — $4.99/month
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowUpgradePanel(true)}
              className="w-full bg-surface border border-hairline hover:border-ink rounded-xl p-4 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-green" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-ink">Upgrade to Pro</p>
                  <p className="text-xs text-muted">Forecasts, analytics & more — $4.99/mo</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-muted group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Pro subscription management */}
      {isPro && (
        <div className="bg-surface border border-hairline rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Pro — Active</p>
            <p className="text-xs text-muted mt-0.5">All features unlocked</p>
          </div>
          <button
            onClick={() => alert('Stripe customer portal — wire up backend /api/subscription/customer-portal')}
            className="text-xs font-semibold text-ink underline underline-offset-2"
          >
            Manage
          </button>
        </div>
      )}

      {/* Menu items */}
      <div className="bg-surface border border-hairline rounded-xl overflow-hidden divide-y divide-hairline mb-4">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg transition-colors"
        >
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <div className="text-left">
              <p className="text-sm font-semibold text-ink">Export Data</p>
              <p className="text-xs text-muted">Download CSV of hunt history</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isPro && (
              <span className="text-xs text-green border border-green/30 bg-green/5 px-2 py-0.5 rounded-full font-semibold">Pro</span>
            )}
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Sign out */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 border border-hairline hover:border-red-200 hover:text-red-600 text-muted font-semibold py-3 rounded-xl transition-colors text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign Out
      </button>

      <p className="text-center text-muted/50 text-xs mt-6">Blind Guide v1.0</p>
    </div>
  )
}
