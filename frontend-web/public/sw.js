/* Blind Guide service worker.
 *
 * Deliberately conservative: the job here is to make the app installable and to
 * survive a dead signal in the marsh — NOT to serve stale code. Nothing is
 * precached, HTML is always network-first, and API traffic is never touched.
 * Bump CACHE_VERSION to force every client to drop its cache on next load.
 */

const CACHE_VERSION = 'v1'
const CACHE_NAME = `blindguide-${CACHE_VERSION}`
const SHELL_URL = '/index.html'

self.addEventListener('install', () => {
  // Take over immediately — a half-updated app is worse than a fast swap.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

// Vite emits content-hashed filenames under /assets, so those are immutable.
const IMMUTABLE = /^\/assets\//
// Brand art, icons, tiles: same file name across deploys, so revalidate in background.
const STATIC = /\.(?:png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/i

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never intercept the API, map tiles, Google Fonts, R2 photos, Stripe, etc.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (STATIC.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(SHELL_URL, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(SHELL_URL)
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const network = fetch(request)
    .then(async response => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)
  return cached || network
}
