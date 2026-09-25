/* ============================================================
   Pastoral Juvenil LuqueÃ±a â€” Service Worker
   ------------------------------------------------------------
   Permite instalar la web como APP en el celular
   (cachea la shell para arranque rÃ¡pido/offline).
   sirve iconos PWA personalizados desde Cache API
   cuando el admin cambia el logo desde el panel.
   ============================================================ */

const VERSION = 'pjl-v5';
/* Cache con sufijo de versiÃ³n: al cambiar, la antigua 'pjl-shell'
   se borra durante activate. AsÃ­ nunca queda servido un manifest
   o shell obsoleto que rompa la instalaciÃ³n PWA. */
const SHELL_CACHE = 'pjl-shell-v5';
const CUSTOM_ICONS_CACHE = 'pjl-custom-icons';

const CORE_ASSETS = [
  '/',
  '/apple-touch-icon.png',
  '/favicon-192.png',
  '/favicon-32.png',
  '/maskable-512.png',
];

/* Los assets crÃ­ticos para la instalaciÃ³n PWA SIEMPRE se resuelven
   yendo a la red primero. Si un manifest/Ã­cono quedÃ³ cacheado en una
   versiÃ³n vieja (apuntando a rutas eliminadas como /api/manifest),
   servirlo desde cache romperÃ­a la "installability". */
const NETWORK_FIRST_ASSETS = [
  '/manifest.json',
  '/android-chrome-192.png',
  '/android-chrome-512.png',
  '/maskable-512.png',
];

const ICON_URLS = ['/android-chrome-192.png', '/android-chrome-512.png', '/maskable-512.png'];

/* InstalaciÃ³n: cachea la shell y avisa de la actualizaciÃ³n.
   NO se llama a self.skipWaiting() aquÃ­ a propÃ³sito: cuando ya existe un
   service worker activo, el nuevo queda en estado "waiting" y el
   componente UpdatePrompt muestra el aviso "nueva actualizaciÃ³n".
   Solo cuando el usuario confirma (mensaje SKIP_WAITING) el nuevo SW toma
   el control y recarga la pÃ¡gina con la versiÃ³n actualizada. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => console.warn('[SW] Shell cache incomplete', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pjl-') && k !== SHELL_CACHE && k !== CUSTOM_ICONS_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'UPDATE_PWA_ICONS') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        if (client.url && !client.url.includes('chrome-extension://')) {
          client.postMessage({ type: 'PWA_ICONS_UPDATED' });
        }
      });
    });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
    return;
  }

  const pathname = new URL(request.url).pathname;

  if (pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  /* Network-first para manifest e Ã­conos: nunca servir versiones viejas
     cacheadas. Si hay un Ã­cono custom generado por el panel (Cache API),
     ese tiene prioridad y sÃ­ se sirve desde CUSTOM_ICONS_CACHE. */
  if (NETWORK_FIRST_ASSETS.includes(pathname)) {
    event.respondWith(
      (ICON_URLS.includes(pathname)
        ? caches.open(CUSTOM_ICONS_CACHE).then((c) => c.match(request))
        : Promise.resolve(undefined)
      ).then((custom) => {
        if (custom) return custom;
        return fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() =>
            caches
              .match(request)
              .then((cached) => cached || (request.mode !== 'navigate' ? new Response('', { status: 504 }) : undefined))
          );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});

/* ============================================================
   WEB PUSH â€” Notificaciones push habilitadas
   ============================================================ */
self.addEventListener('push', (event) => {
  let data = { title: 'Pastoral Juvenil LuqueÃ±a', body: 'TenÃ©s una nueva notificaciÃ³n', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    /* payload no-JSON: usar valores por defecto */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/android-chrome-192.png',
      badge: '/favicon-192.png',
      ...(data.image ? { image: data.image } : {}),
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const wasFocused = windowClients.some((client) => {
        if ('navigate' in client) {
          client.navigate(target);
          return client.focused;
        }
        return false;
      });
      if (!wasFocused && self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })
  );
});