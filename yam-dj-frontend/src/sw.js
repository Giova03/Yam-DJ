/**
 * YAM DJ — Service Worker v2 (PWA + Web Push + MODE HORS LIGNE).
 *
 * STRATEGIE OFFLINE (solution mobile sans connexion) :
 *  1. APP SHELL : l'index.html est precache a l'installation → l'app
 *     s'ouvre meme sans reseau. Les chunks JS/CSS visites en ligne sont
 *     caches a la volee (cache-first ensuite) → chaque page vue
 *     une fois reste disponible hors ligne.
 *  2. PISTES TELECHARGEES : OfflineService demande la mise en cache du
 *     playlist HLS Data-Lite (48 kbps) + des segments + de la pochette
 *     via postMessage {type: 'CACHE_TRACK', urls}. La lecture hors ligne
 *     est TRANSPARENTE : hls.js redemande les memes URLs, le SW les sert
 *     depuis le cache (cache-first sur le cache 'yamdj-audio').
 *  3. API PUBLIQUES : network-first avec repli sur le dernier cache connu
 *     (feed, charts, tendances) → l'accueil reste informatif hors ligne.
 *  4. Push : messages SANS payload (RFC 8030, fiabilite maximale) →
 *     notification generique + centre in-app.
 *
 * Enregistre depuis app.component (racine) et NotificationsService.
 */

const VERSION = 'v6';
const SHELL_CACHE = `yamdj-shell-${VERSION}`;
const AUDIO_CACHE = 'yamdj-audio';
const API_CACHE = 'yamdj-api';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      // App shell minimal : index.html (fallback de navigation offline)
      await cache.add(new Request('/', { cache: 'reload' }));
      await cache.add(new Request('/index.html', { cache: 'reload' }));
      await cache.add(new Request('/manifest.webmanifest', { cache: 'reload' }));
      await cache.add(new Request('/assets/icons/icon-192.png', { cache: 'reload' }));
      await cache.add(new Request('/assets/icons/icon-512.png', { cache: 'reload' }));
      await cache.add(new Request('/assets/audio/ad-jingle.mp3', { cache: 'reload' }));
    } catch (e) {
      // Installation non bloquante si un asset manque
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Purge des anciennes versions du cache shell
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('yamdj-shell-') && k !== SHELL_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ============ CANAL DE CONTROLE (OfflineService) ============

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'CACHE_TRACK' && Array.isArray(msg.urls)) {
    // Telechargement d'une piste : playlist m3u8 + segments + pochette
    event.waitUntil((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      const results = await Promise.allSettled(
        msg.urls.map(async (url) => {
          const req = new Request(url, { mode: 'cors' });
          const fresh = await fetch(req);
          if (!fresh.ok) throw new Error(`HTTP ${fresh.status}`);
          await cache.put(req, fresh);
          return (await fresh.clone().arrayBuffer()).byteLength;
        })
      );
      const total = results.reduce((s, r) => s + (r.status === 'fulfilled' ? (r.value || 0) : 0), 0);
      event.source?.postMessage({ type: 'CACHE_TRACK_DONE', trackId: msg.trackId, ok: results.every(r => r.status === 'fulfilled'), bytes: total });
    })());
  }

  if (msg.type === 'UNCACHE_TRACK' && Array.isArray(msg.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      await Promise.allSettled(msg.urls.map(u => cache.delete(u)));
      event.source?.postMessage({ type: 'UNCACHE_TRACK_DONE', trackId: msg.trackId });
    })());
  }

  if (msg.type === 'PURGE_AUDIO') {
    event.waitUntil((async () => {
      await caches.delete(AUDIO_CACHE);
      event.source?.postMessage({ type: 'PURGE_DONE' });
    })());
  }

  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============ STRATEGIES DE RESEAU ============

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';

  // 1. NAVIGATION (pages) : network-first → cache shell → page offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (offline) {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('/index.html')
          || await cache.match('/');
        if (cached) return cached;
        return new Response(
          '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>YAM DJ — Hors ligne</title>' +
          '<style>body{background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;' +
          'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}' +
          'h1{color:#FFD166;font-size:24px}p{color:#bbb;max-width:320px}</style></head>' +
          '<body><div><h1>🎧 Tu es hors ligne</h1>' +
          '<p>Ouvre YAM DJ une fois connecte pour precharger l\'application, ' +
          'puis tes telechargements resteront disponibles sans reseau.</p></div></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  if (!isHttp) return;

  // 2. API PUBLIQUES GET : network-first, repli cache (donnees fraiches
  //    quand en ligne, derniere version connue hors ligne)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    const isPublicGet = /^\/api\/(tracks\/(feed|trending)|charts|seo|ads\/config|mixtapes\/public|playlists\/public|tracks\/[0-9a-f-]+$|artists\/[0-9a-f-]+$)/.test(url.pathname);
    if (isPublicGet) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(API_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch (offline) {
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
      })());
    }
    return; // autres appels API : reseau direct (auth, POST...)
  }

  // 3. AUDIO TELECHARGE (Supabase Storage, cross-origin) : cache-first
  //    STRICT — uniquement ce qui a ete telecharge explicitement.
  //    Un miss reseau normale = on laisse passer (pas de cache surprise,
  //    economie de forfait data respectee).
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts')
      || url.pathname.includes('/storage/v1/object/')) {
    event.respondWith((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      const cached = await cache.match(req, { ignoreVary: true });
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 4. ASSETS STATIQUES same-origin (js, css, images, polices, jingle) :
  //    stale-while-revalidate — chaque page visitee devient hors ligne.
  if (url.origin === self.location.origin) {
    const isStatic = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|mp3|webmanifest|txt|json)$/.test(url.pathname)
      || url.pathname.startsWith('/assets/');
    if (isStatic) {
      event.respondWith((async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req, { ignoreVary: true });
        const revalidate = fetch(req).then((fresh) => {
          if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        }).catch(() => null);
        if (cached) {
          event.waitUntil(revalidate);
          return cached;
        }
        const fresh = await revalidate;
        if (fresh) return fresh;
        return new Response('', { status: 504 });
      })());
    }
  }
});

// ============ WEB PUSH (notifications) ============

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
