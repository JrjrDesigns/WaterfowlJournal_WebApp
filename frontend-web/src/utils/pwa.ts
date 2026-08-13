import { useEffect, useState } from 'react'

/**
 * "Add to Home Screen" plumbing.
 *
 * Two very different worlds:
 *  - Chrome / Edge / Samsung (Android + desktop) fire `beforeinstallprompt`,
 *    which we stash and replay from a button. One real tap, app installed.
 *  - iOS Safari has no such API at all. The only route is Share → Add to Home
 *    Screen, so all we can do is show the user where to tap.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'bg_install_banner_dismissed_at'
// Asking again a month later is a nudge; asking every session is nagging.
const DISMISS_DAYS = 30

// The event fires early — often before React has mounted — so we listen at
// module load and hold the last one for whoever asks.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    try {
      window.localStorage.removeItem(DISMISS_KEY)
    } catch {
      /* private mode */
    }
    notify()
  })
}

/** True when the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac, so check for touch as well.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** iOS can only install from Safari — Chrome/Firefox on iOS have no Add to Home Screen. */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false
  return !isIOSOtherBrowser()
}

/** On iOS outside Safari there is no install path at all; the user has to switch browsers. */
export function isIOSOtherBrowser(): boolean {
  if (!isIOS()) return false
  return /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(navigator.userAgent)
}

export function markBannerDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* private mode */
  }
}

export function bannerRecentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const age = Date.now() - Number(raw)
    return Number.isFinite(age) && age < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export interface InstallState {
  /** Already installed / launched from the home screen. */
  standalone: boolean
  /** Browser handed us a real install prompt we can fire. */
  canPrompt: boolean
  /** No prompt API, but the user can still do it by hand (iOS Safari). */
  needsManualSteps: boolean
  /** Fires the native install dialog. Resolves true if the user accepted. */
  promptInstall: () => Promise<boolean>
}

export function useInstallPrompt(): InstallState {
  const [, setTick] = useState(0)
  const [standalone, setStandalone] = useState(isStandalone)

  useEffect(() => {
    const rerender = () => setTick(n => n + 1)
    listeners.add(rerender)

    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayChange = () => setStandalone(isStandalone())
    media.addEventListener('change', onDisplayChange)

    return () => {
      listeners.delete(rerender)
      media.removeEventListener('change', onDisplayChange)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return false
    const event = deferredPrompt
    // A prompt event can only be used once.
    deferredPrompt = null
    notify()
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  }

  return {
    standalone,
    canPrompt: !standalone && deferredPrompt !== null,
    needsManualSteps: !standalone && deferredPrompt === null && isIOSSafari(),
    promptInstall,
  }
}

/** Registers the service worker. Without one, Chrome will not offer to install. */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      // Never fatal — the app works fine uninstalled.
      console.warn('Service worker registration failed:', err)
    })
  })
}
