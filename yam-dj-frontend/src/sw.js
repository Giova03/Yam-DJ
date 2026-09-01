/**
 * YAM DJ — Service Worker (PWA + Web Push).
 *
 * Enregistre depuis NotificationsService (opt-in utilisateur) et par
 * app.component au chargement. Portee "/" (sert depuis la racine).
 *
 * Push : le backend envoie des messages SANS payload (fiabilite
 * maximale, RFC 8030) -> notification generique "des nouveautes".
 * Le contenu riche vit dans le centre de notifications in-app
 * (cloche navbar). Le clic ouvre l'application sur la racine.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let title = 'YAM DJ 🎧';
  let body = 'Des nouveautes t\'attendent : nouveaux sons, tips ou charts !';
  let url = '/';

  // Payload optionnel (JSON) si le backend passe au chiffrement aes128gcm
  try {
    if (event.data) {
      const data = event.data.json();
      if (data && data.title) title = data.title;
      if (data && data.body) body = data.body;
      if (data && data.linkUrl) url = data.linkUrl;
    }
  } catch (e) { /* payload illisible : notification generique */ }

  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-96.png',
    tag: 'yamdj-' + Date.now(),
    data: { url: url },
    vibrate: [100, 50, 100]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus d'une fenetre existante si possible
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (client.navigate && target !== '/') {
            try { client.navigate(target); } catch (e) { /* deja sur place */ }
          }
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
