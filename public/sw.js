// Jae's Runway service worker: shows phone notifications and opens the app when you tap one.
// It doesn't cache anything, so the app is always the latest version.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let msg = { title: "Jae's Runway", body: '', url: '/', tag: undefined }
  try { msg = { ...msg, ...event.data.json() } } catch { if (event.data) msg.body = event.data.text() }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    tag: msg.tag,
    renotify: Boolean(msg.tag),
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { url: msg.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of open) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus()
        c.postMessage({ type: 'open', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
