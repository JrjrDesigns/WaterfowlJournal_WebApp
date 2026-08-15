/* Blind Guide service worker.
 *
 * Deliberately conservative: the job here is to make the app installable and to
 * survive a dead signal in the marsh — NOT to serve stale code. Nothing is
 * precached, HTML is always network-first, and API traffic is never touched.
 * Bump CACHE_VERSION to force every client to drop its cache on next load.
 */

// v2 also purges caches poisoned by the bug fixed in isUsable() below.
const CACHE_VERSION = 'v2'
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

/* A 200 is not proof the response is the thing that was asked for.
 *
 * Cloudflare Pages answers a request for a missing file with the SPA fallback:
 * index.html, served as text/html, with a 200. During the seconds between a new
 * index.html going live and its hashed assets propagating, a request for
 * /assets/index-ABC.js can therefore come back as an HTML page that looks
 * perfectly successful.
 *
 * cacheFirst used to store that, and because the entry is keyed by the asset
 * URL and served cache-first, the browser then loaded an HTML document as
 * JavaScript on every subsequent visit. It dies on the first `<`, renders
 * nothing, and reloading cannot fix it — the poison is in the cache, not on the
 * server. That is a white screen that outlives the deploy that caused it.
 *
 * So: never store a response whose type contradicts what was requested. A miss
 * costs one network round trip; a poisoned cache costs the whole app.
 */
function isUsable(request, response) {
  if (!response || !response.ok) return false
  const type = response.headers.get('content-type') || ''
  if (request.destination === 'script') return type.includes('javascript')
  if (request.destination === 'style') return type.includes('css')
  // Anything else (images, fonts, manifests) is only ever wrong if it came back
  // as the fallback page.
  return !type.includes('text/html')
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (isUsable(request, response)) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const network = fetch(request)
    .then(async response => {
      // Same guard as cacheFirst: these filenames are stable across deploys, so
      // a fallback page cached here would persist just as stubbornly.
      if (isUsable(request, response)) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)
  return cached || network
}
