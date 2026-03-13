const CACHE_NAME = 'garden-keeper-v1';

// Files to cache for offline use
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Google Fonts — cache on first visit
];

// Install: pre-cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network, cache new responses
self.addEventListener('fetch', event => {
  // Skip non-GET and cross-origin requests (except Google Fonts)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isGoogleFonts = url.hostname.includes('fonts.googleapis.com') ||
                        url.hostname.includes('fonts.gstatic.com');
  const isSameOrigin  = url.origin === self.location.origin;

  if (!isSameOrigin && !isGoogleFonts) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;

        // Cache fonts and same-origin assets
        if (isGoogleFonts || isSameOrigin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Push notifications (from existing push system)
self.addEventListener('push', event => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(d.title || '🌿 Garden Keeper', {
      body: d.body || 'Your plants need attention!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag || 'garden',
      data: d.data || {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow('/');
    })
  );
});

// Daily plant check message from app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_PLANTS') {
    const plants = event.data.plants || [];
    const now = Date.now();
    const alerts = [];
    plants.forEach(p => {
      const wNext = new Date(p.lastWatered).getTime() + p.waterDays * 86400000;
      const fNext = new Date(p.lastFertilized).getTime() + p.fertilizeDays * 86400000;
      if (wNext <= now) alerts.push(`${p.emoji} ${p.name} needs watering`);
      else if (fNext <= now) alerts.push(`${p.emoji} ${p.name} needs fertilizing`);
    });
    if (alerts.length) {
      self.registration.showNotification('🌿 Garden Keeper', {
        body: alerts.slice(0, 3).join('\n') + (alerts.length > 3 ? `\n+${alerts.length - 3} more` : ''),
        icon: '/icons/icon-192.png',
        tag: 'garden-daily'
      });
    }
  }
});
