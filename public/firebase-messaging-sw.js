// Scripts de Firebase compat para Service Worker (FCM)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');
} catch (importErr) {
  console.warn('[firebase-messaging-sw.js] Fallo al cargar scripts externos de Firebase:', importErr);
}

const firebaseConfig = {
  apiKey: "AIzaSyBbxbElROcFiJ4LoBnFEpOjjlzeHX2KejE",
  authDomain: "sincrolist.firebaseapp.com",
  projectId: "sincrolist",
  storageBucket: "sincrolist.firebasestorage.app",
  messagingSenderId: "972307779368",
  appId: "1:972307779368:web:50cb39daf8649c0643ca1d"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano:', payload);
    const title = payload.notification?.title || payload.data?.title || 'SincroLista 🛒';
    const options = {
      body: payload.notification?.body || payload.data?.body || 'Actualización en tu lista compartida',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [200, 100, 200],
      tag: payload.data?.tag || 'sincrolista-notification',
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Error inicializando Firebase Messaging compat:', e);
}

// Fallback para eventos de Push nativos
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || data.notification?.title || 'SincroLista 🛒';
      const body = data.body || data.notification?.body || 'Un producto fue agregado o marcado';
      const options = {
        body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'sincrolista-push',
        data: data.data || data,
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch {
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('SincroLista 🛒', {
          body: text || 'Tu pareja actualizó la lista de compras.',
          icon: '/icon-192.png',
        })
      );
    }
  }
});

// Manejo del click en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
