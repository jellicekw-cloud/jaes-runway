// Runway Budget (tablet): keeps a copy of the page and its files so it opens with no internet.
// Always tries the internet first (so you get the newest version), and falls back to the copy.
// Only page files are kept here; your budget itself lives in the tablet's storage, and Supabase calls are never cached.

const CACHE = 'runway-tablet-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/tablet/', '/tablet/manifest.webmanifest', '/icon-192.png', '/favicon-32.png'])).catch(() => {}))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameSite = url.origin === self.location.origin
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameSite && !fonts) return   // Supabase and everything else: straight to the internet
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch(req)
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req.mode === 'navigate' ? '/tablet/' : req, res.clone())
      return res
    } catch {
      const hit = await cache.match(req.mode === 'navigate' ? '/tablet/' : req)
      if (hit) return hit
      throw new Error('offline and not saved yet')
    }
  })())
})
