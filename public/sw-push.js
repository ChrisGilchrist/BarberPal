/**
 * BarberPal Push Service Worker
 * Handles push notifications and click routing
 * Simplified for iOS Safari PWA compatibility
 */

const CACHE_NAME = 'barberpal-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

// Install event - cache app shell
self.addEventListener('install', function(event) {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching app shell');
      return cache.addAll(SHELL_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache for navigation
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls and auth requests - let them go to network
  const url = new URL(event.request.url);
  if (url.pathname.includes('/rest/') ||
      url.pathname.includes('/auth/') ||
      url.pathname.includes('/functions/') ||
      url.hostname.includes('supabase')) {
    return;
  }

  // For navigation requests, try network first, fall back to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});

// Push notification handler - simplified for iOS compatibility
self.addEventListener('push', function(event) {
  console.log('[SW] Push received');

  if (!event.data) {
    console.log('[SW] No push data');
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log('[SW] Push data:', data);
  } catch (e) {
    console.log('[SW] Could not parse push data as JSON, using text');
    data = { title: 'BarberPal', message: event.data.text() };
  }

  // iOS-compatible notification options (no requireInteraction, no actions)
  const options = {
    body: data.message || data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      notificationId: data.notificationId,
      type: data.type
    },
    tag: data.tag || data.type, // Prevent duplicate notifications of same type
    renotify: true
  };

  console.log('[SW] Showing notification:', data.title);
  event.waitUntil(
    self.registration.showNotification(data.title || 'BarberPal', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';

  // Route based on notification type if no explicit URL
  if (!data.url && data.type) {
    switch (data.type) {
      case 'appointment_scheduled':
      case 'appointment_confirmed':
      case 'appointment_cancelled':
      case 'appointment_updated':
      case 'appointment_reminder':
      case 'reschedule_requested':
      case 'reschedule_approved':
      case 'reschedule_declined':
        targetUrl = '/client/dashboard';
        break;
      case 'booking_requested':
        targetUrl = '/barber/calendar';
        break;
      case 'booking_approved':
      case 'booking_declined':
        targetUrl = '/client/dashboard';
        break;
      case 'new_message':
        targetUrl = '/client/messages';
        break;
      case 'announcement':
        targetUrl = '/';
        break;
      default:
        targetUrl = '/';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Try to focus an existing window
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open a new window if none exist
        return clients.openWindow(targetUrl);
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification closed:', event.notification.tag);
});
