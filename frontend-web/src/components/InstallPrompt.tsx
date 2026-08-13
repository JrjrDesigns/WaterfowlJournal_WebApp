import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogoIcon } from './Logo'
import {
  bannerRecentlyDismissed,
  isIOSOtherBrowser,
  isIOSSafari,
  markBannerDismissed,
  useInstallPrompt,
} from '../utils/pwa'

function ShareIcon({ className = 'w-4 h-4' }: { className?: string }) {
  // iOS share glyph: box with an arrow coming out the top
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4 4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )
}

function PlusSquareIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  )
}

function PhoneIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path strokeLinecap="round" d="M10.5 18.5h3" />
    </svg>
  )
}

/**
 * The manual walkthrough for iOS Safari, which gives us no install API.
 * Also used as the fallback explanation anywhere the native prompt is missing.
 */
export function InstallInstructionsSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  let steps: { icon: React.ReactNode; text: string }[]
  if (isIOSSafari()) {
    steps = [
      { icon: <ShareIcon className="w-5 h-5" />, text: 'Tap the Share button in Safari’s toolbar' },
      { icon: <PlusSquareIcon className="w-5 h-5" />, text: 'Scroll down and tap "Add to Home Screen"' },
      { icon: <PhoneIcon className="w-5 h-5" />, text: 'Tap "Add" — Blind Guide lands on your home screen' },
    ]
  } else if (isIOSOtherBrowser()) {
    // Only Safari can install on iOS, so step one is switching browsers.
    steps = [
      { icon: <PhoneIcon className="w-5 h-5" />, text: 'Open this page in Safari — only Safari can install on iPhone' },
      { icon: <ShareIcon className="w-5 h-5" />, text: 'Tap the Share button in Safari’s toolbar' },
      { icon: <PlusSquareIcon className="w-5 h-5" />, text: 'Tap "Add to Home Screen", then "Add"' },
    ]
  } else {
    steps = [
      { icon: <PlusSquareIcon className="w-5 h-5" />, text: 'Open your browser’s menu (⋮ or ⋯)' },
      { icon: <PhoneIcon className="w-5 h-5" />, text: 'Choose "Install app" or "Add to Home screen"' },
      { icon: <ShareIcon className="w-5 h-5" />, text: 'Confirm — it opens full screen, with no address bar' },
    ]
  }

  // Portalled to body: it is rendered from inside a `divide-y` menu list and a
  // fixed layout, neither of which should get a say in how the overlay stacks.
  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-hairline safe-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
          <LogoIcon className="w-9 h-9 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg tracking-wide text-ink leading-none">ADD TO HOME SCREEN</p>
            <p className="text-xs text-muted mt-1">Opens full screen, just like an app</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink flex-shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ol className="px-5 py-4 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-bg border border-hairline flex items-center justify-center text-ink flex-shrink-0">
                {step.icon}
              </span>
              <span className="text-sm text-ink leading-snug">
                <span className="text-muted font-semibold mr-1.5">{i + 1}.</span>
                {step.text}
              </span>
            </li>
          ))}
        </ol>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-ink text-white font-semibold py-3 rounded-xl text-sm hover:bg-ink/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Dismissible banner shown once the browser tells us the app is installable
 * (or on iOS Safari, where it never will). Sits above the mobile tab bar.
 */
export default function InstallPrompt() {
  const { standalone, canPrompt, needsManualSteps, promptInstall } = useInstallPrompt()
  const [showSheet, setShowSheet] = useState(false)
  const [dismissed, setDismissed] = useState(bannerRecentlyDismissed)

  const eligible = !standalone && (canPrompt || needsManualSteps)
  if (!eligible) return null

  const dismiss = () => {
    markBannerDismissed()
    setDismissed(true)
  }

  const handleInstall = async () => {
    if (canPrompt) {
      const accepted = await promptInstall()
      if (!accepted) dismiss()
      return
    }
    setShowSheet(true)
  }

  return (
    <>
      {!dismissed && (
        <div className="fixed left-0 right-0 md:left-auto md:right-4 z-40 px-3 md:px-0 safe-x above-tab-bar">
          <div className="bg-surface border border-hairline rounded-xl shadow-lg shadow-ink/10 p-3 flex items-center gap-3 md:w-80">
            <LogoIcon className="w-9 h-9 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink leading-tight">Install Blind Guide</p>
              <p className="text-xs text-muted leading-tight mt-0.5">
                Add it to your home screen for one-tap access
              </p>
            </div>
            <button
              onClick={handleInstall}
              className="bg-ink text-white text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded-lg hover:bg-ink/90 transition-colors flex-shrink-0"
            >
              Add
            </button>
            <button
              onClick={dismiss}
              className="text-muted hover:text-ink flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showSheet && <InstallInstructionsSheet onClose={() => setShowSheet(false)} />}
    </>
  )
}

/**
 * Always-available entry point in Profile, so someone who dismissed the banner
 * (or never saw it) can still find this.
 */
export function InstallAppRow() {
  const { standalone, canPrompt, promptInstall } = useInstallPrompt()
  const [showSheet, setShowSheet] = useState(false)

  if (standalone) return null

  const handleClick = async () => {
    if (canPrompt) {
      await promptInstall()
      return
    }
    setShowSheet(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg transition-colors"
      >
        <div className="flex items-center gap-3">
          <PhoneIcon className="w-4 h-4 text-muted" />
          <div className="text-left">
            <p className="text-sm font-semibold text-ink">Add to Home Screen</p>
            <p className="text-xs text-muted">Open Blind Guide like a real app</p>
          </div>
        </div>
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showSheet && <InstallInstructionsSheet onClose={() => setShowSheet(false)} />}
    </>
  )
}
