/**
 * BarberPal Push Service Worker
 * Handles push notifications and click routing
 */

const CACHE_NAME = 'barberpal-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first with cache fallback for navigation
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
  }
});

// Push event - display notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'BarberPal',
    message: 'You have a new notification',
    type: 'default',
    url: '/client/dashboard',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }

  const options = {
    body: data.message,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    tag: data.type,
    renotify: true,
    requireInteraction: shouldRequireInteraction(data.type),
    data: {
      url: data.url,
      notificationId: data.notificationId,
      appointmentId: data.appointmentId,
      type: data.type,
    },
    actions: getNotificationActions(data.type),
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Determine if notification should require interaction
function shouldRequireInteraction(type) {
  const requireInteraction = [
    'appointment_reminder',
    'booking_requested',
    'reschedule_requested',
  ];
  return requireInteraction.includes(type);
}

// Get actions based on notification type
function getNotificationActions(type) {
  switch (type) {
    case 'appointment_reminder':
      return [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'booking_requested':
    case 'reschedule_requested':
      return [
        { action: 'view', title: 'Review' },
      ];
    default:
      return [];
  }
}

// Notification click event - route to appropriate page
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Handle action buttons
  if (action === 'dismiss') {
    return;
  }

  // Determine URL to open
  let url = data.url || '/';

  // Override URL based on notification type for specific routing
  if (data.type) {
    url = getRouteForNotificationType(data.type, data);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: url,
            notificationId: data.notificationId,
          });
          return;
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});

// Get route based on notification type
function getRouteForNotificationType(type, data) {
  // Most routes will be determined by the edge function based on user role
  // This is a fallback/override for specific cases
  switch (type) {
    case 'appointment_scheduled':
    case 'appointment_confirmed':
    case 'appointment_cancelled':
    case 'appointment_updated':
    case 'appointment_reminder':
    case 'reschedule_requested':
    case 'reschedule_approved':
    case 'reschedule_declined':
    case 'booking_requested':
    case 'booking_approved':
    case 'booking_declined':
      return data.url || '/client/dashboard';

    case 'new_message':
      return data.url || '/client/messages';

    case 'announcement':
      return data.url || '/client/dashboard';

    default:
      return data.url || '/';
  }
}

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
