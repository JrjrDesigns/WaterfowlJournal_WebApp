import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PaywallModal from '../components/PaywallModal'
import { exportHuntsCSV, createCheckoutSession, createCustomerPortalSession, pauseSubscription, resumeSubscription } from '../utils/api'

const STRIPE_PRICE_ID_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY as string | undefined
const STRIPE_PRICE_ID_ANNUAL = import.meta.env.VITE_STRIPE_PRICE_ID_ANNUAL as string | undefined

// Mirrors add_months() in backend/server.py — whole calendar months with the
// day clamped to the target month's length, so the date previewed here matches
// the resumes_at the server actually sends to Stripe.
function addMonths(start: Date, months: number): Date {
  const d = new Date(start)
  const targetDay = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(targetDay, lastDay))
  return d
}

function formatResumeDate(unixSeconds?: number | null): string | null {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Profile() {
  const { user, isPro, isPaused, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showPaywall, setShowPaywall] = useState(false)
  const [showUpgradePanel, setShowUpgradePanel] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual')
  const [isManaging, setIsManaging] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [showPausePanel, setShowPausePanel] = useState(false)
  const [pauseMonths, setPauseMonths] = useState(3)
  const [isPausing, setIsPausing] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  const resumeDate = formatResumeDate(user?.subscription_resumes_at)

  useEffect(() => {
    if (searchParams.get('upgrade') === '1') setShowUpgradePanel(true)
    refreshUser()
  }, [])

  useEffect(() => {
    if (searchParams.get('success') !== '1') return

    setSearchParams(params => {
      params.delete('success')
      params.delete('session_id')
      return params
    }, { replace: true })

    // Stripe's webhook may take a moment to land, so poll briefly for the
    // subscription flip instead of assuming refreshUser() catches it on the first try.
    setActivating(true)
    let attempts = 0
    const interval = setInterval(async () => {
      attempts += 1
      await refreshUser()
      if (attempts >= 5) {
        clearInterval(interval)
        setActivating(false)
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isPro) setActivating(false)
  }, [isPro])

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const handleExport = () => {
    if (!isPro) { setShowPaywall(true); return }
    exportHuntsCSV()
  }

  const handleSubscribe = async () => {
    setCheckoutError(null)
    setIsSubscribing(true)
    try {
      const priceId = selectedPlan === 'annual' ? STRIPE_PRICE_ID_ANNUAL : STRIPE_PRICE_ID_MONTHLY
      const { url } = await createCheckoutSession(priceId)
      if (!url) throw new Error('Stripe did not return a checkout link. Please try again.')
      window.location.href = url
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not start checkout')
      setIsSubscribing(false)
    }
  }

  const handlePause = async () => {
    setCheckoutError(null)
    setIsPausing(true)
    try {
      await pauseSubscription(pauseMonths)
      await refreshUser()
      setShowPausePanel(false)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not pause your subscription')
    } finally {
      setIsPausing(false)
    }
  }

  const handleResume = async () => {
    setCheckoutError(null)
    setIsResuming(true)
    try {
      await resumeSubscription()
      await refreshUser()
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not resume your subscription')
    } finally {
      setIsResuming(false)
    }
  }

  const handleManageSubscription = async () => {
    setCheckoutError(null)
    setIsManaging(true)
    try {
      const { url } = await createCustomerPortalSession()
      if (!url) throw new Error('Stripe did not return a billing link. Please try again.')
      window.location.href = url
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not open subscription management')
      setIsManaging(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} reason="export" />}

      {activating && (
        <div className="mb-4 bg-green/5 border border-green/30 text-green text-sm font-semibold rounded-xl p-3 text-center">
          Payment received — activating your Pro access…
        </div>
      )}

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
              : isPaused
                ? 'text-amber-600 border-amber-500/30 bg-amber-500/5'
                : 'text-muted border-hairline bg-bg'
          }`}>
            {isPro ? 'Pro' : isPaused ? 'Paused' : 'Free'}
          </span>
        </div>
      </div>

      {/* Paused subscription — resuming is one tap; pausing lives in the Stripe portal */}
      {isPaused && (
        <div className="bg-surface border border-amber-500/30 rounded-xl p-5 mb-4">
          <p className="text-sm font-semibold text-ink">Pro is paused</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {resumeDate
              ? `Billing restarts on ${resumeDate} and Pro turns back on automatically. Every hunt you've logged is safe.`
              : `You won't be billed while paused. Every hunt you've logged is safe — resume any time to get Pro back.`}
          </p>

          {checkoutError && (
            <p className="text-red-600 text-xs font-semibold mt-3">{checkoutError}</p>
          )}

          <button
            onClick={handleResume}
            disabled={isResuming}
            className="w-full mt-4 bg-ink hover:bg-black text-white font-semibold py-3 rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isResuming ? 'Resuming…' : 'Resume Pro now'}
          </button>
          <button
            onClick={handleManageSubscription}
            disabled={isManaging}
            className="w-full mt-2 text-muted hover:text-ink text-xs py-2 transition-colors disabled:opacity-60"
          >
            {isManaging ? 'Opening…' : 'Manage billing'}
          </button>
        </div>
      )}

      {/* Upgrade panel */}
      {!isPro && !isPaused && (
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

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSelectedPlan('monthly')}
                  className={`relative border rounded-lg p-3 text-center transition-colors ${
                    selectedPlan === 'monthly' ? 'border-ink bg-bg' : 'border-hairline'
                  }`}
                >
                  <p className="font-display text-2xl text-ink tracking-wider leading-none">$4.99</p>
                  <p className="text-xs text-muted mt-1">per month</p>
                </button>
                <button
                  onClick={() => setSelectedPlan('annual')}
                  className={`relative border rounded-lg p-3 text-center transition-colors ${
                    selectedPlan === 'annual' ? 'border-ink bg-bg' : 'border-hairline'
                  }`}
                >
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white bg-green px-2 py-0.5 rounded-full whitespace-nowrap">
                    Best Value
                  </span>
                  <p className="font-display text-2xl text-ink tracking-wider leading-none">$39.99</p>
                  <p className="text-xs text-muted mt-1">per year <span className="text-green font-semibold">($3.33/mo)</span></p>
                </button>
              </div>
              <p className="text-xs text-muted text-center mb-4">Cancel anytime</p>

              {checkoutError && (
                <p className="text-red-600 text-xs font-semibold mb-3 text-center">{checkoutError}</p>
              )}

              <button
                className="w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleSubscribe}
                disabled={isSubscribing}
              >
                {isSubscribing
                  ? 'Redirecting to checkout…'
                  : selectedPlan === 'annual'
                    ? 'Subscribe — $39.99/year'
                    : 'Subscribe — $4.99/month'}
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
                  <p className="text-xs text-muted">Forecasts, analytics & more — from $3.33/mo</p>
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
        <div className="bg-surface border border-hairline rounded-xl mb-4">
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Pro — Active</p>
              <p className="text-xs text-muted mt-0.5">All features unlocked</p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={isManaging}
              className="text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-60"
            >
              {isManaging ? 'Opening…' : 'Manage'}
            </button>
          </div>

          {/* Off-season pause. Kept deliberately quiet — it's a retention valve,
              not something to advertise. */}
          {!showPausePanel ? (
            <button
              onClick={() => setShowPausePanel(true)}
              className="w-full text-xs text-muted hover:text-ink py-3 border-t border-hairline transition-colors"
            >
              Hunting season over? Pause your subscription
            </button>
          ) : (
            <div className="border-t border-hairline p-4">
              <p className="text-sm font-semibold text-ink">Pause for the off-season</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                You won't be billed while paused, and Pro features turn off until it ends.
                Your hunts, locations and photos all stay exactly as they are.
              </p>

              <div className="grid grid-cols-3 gap-2 mt-4">
                {[1, 3, 6].map(m => (
                  <button
                    key={m}
                    onClick={() => setPauseMonths(m)}
                    className={`border rounded-lg py-2 text-center transition-colors ${
                      pauseMonths === m ? 'border-ink bg-bg' : 'border-hairline'
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink">{m} mo</p>
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted mt-3">
                Billing restarts automatically on{' '}
                <span className="font-semibold text-ink">
                  {formatResumeDate(Math.floor(addMonths(new Date(), pauseMonths).getTime() / 1000))}
                </span>
                . You can resume sooner any time.
              </p>

              {checkoutError && (
                <p className="text-red-600 text-xs font-semibold mt-3">{checkoutError}</p>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => { setShowPausePanel(false); setCheckoutError(null) }}
                  className="flex-1 border border-hairline text-muted hover:text-ink font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  Never mind
                </button>
                <button
                  onClick={handlePause}
                  disabled={isPausing}
                  className="flex-1 bg-ink hover:bg-black text-white font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPausing ? 'Pausing…' : `Pause ${pauseMonths} mo`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {isPro && checkoutError && (
        <p className="text-red-600 text-xs font-semibold mb-4 text-center">{checkoutError}</p>
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

      <p className="text-center text-xs mt-6 space-x-3">
        <a href="https://blindguideapp.com/terms" target="_blank" rel="noopener noreferrer"
          className="text-muted hover:text-ink transition-colors">Terms of Service</a>
        <span className="text-muted/40">·</span>
        <a href="https://blindguideapp.com/privacy" target="_blank" rel="noopener noreferrer"
          className="text-muted hover:text-ink transition-colors">Privacy Policy</a>
      </p>
      <p className="text-center text-muted/50 text-xs mt-2">Blind Guide v1.0</p>
    </div>
  )
}
