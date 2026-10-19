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

async function hasVisibleAppWindow() {
  const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clientsList.some((client) => client.visibilityState === 'visible');
}

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    // Si la app está abierta, el flujo en vivo muestra el aviso dentro de la interfaz.
    if (await hasVisibleAppWindow()) return;

    const title = payload.notification?.title || payload.data?.title || 'SincroLista 🛒';
    const options = {
      body: payload.notification?.body || payload.data?.body || 'Tu lista compartida se actualizó. Abre SincroLista para ver los cambios.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [200, 100, 200],
      tag: 'sincrolista-list-update',
      renotify: false,
      data: payload.data || {},
    };
    await self.registration.showNotification(title, options);
  });
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Error inicializando Firebase Messaging compat:', e);
}

// Fallback para eventos de Push nativos
self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    // Evita duplicar el aviso si la app visible ya notificó el cambio en pantalla.
    if (await hasVisibleAppWindow()) return;

    try {
      const data = event.data.json();
      const title = data.title || data.notification?.title || 'SincroLista 🛒';
      const body = data.body || data.notification?.body || 'Tu lista compartida se actualizó. Abre SincroLista para ver los cambios.';
      const options = {
        body,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        tag: 'sincrolista-list-update',
        renotify: false,
        data: data.data || data,
      };
      await self.registration.showNotification(title, options);
    } catch {
      const text = event.data.text();
      await self.registration.showNotification('SincroLista 🛒', {
        body: text || 'Tu lista compartida se actualizó. Abre SincroLista para ver los cambios.',
        icon: '/icon-192.png',
        tag: 'sincrolista-list-update',
        renotify: false,
      });
    }
  })());
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
