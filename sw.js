// Service Worker der Gerüst-Bestell-App.
// - Macht die Seite "zum Homescreen hinzufügen"-fähig.
// - Offline-Start: Die App selbst (diese Seite, Logo, Symbole, Schriften und
//   die Supabase-Bibliothek) liegt zusätzlich auf dem Handy. So geht die App
//   auch im Keller oder bei schlechtem Netz auf; die Daten kommen dann aus dem
//   Zwischenspeicher der App (geruest-cache / geruest-pending).
//   * App-Seite: erst Netz (damit Neuerungen sofort ankommen), nach 4 s ohne
//     Antwort oder ohne Netz die gespeicherte Fassung.
//   * Logo/Symbole/Schriften/Bibliotheken: sofort aus dem Speicher, im
//     Hintergrund aktualisiert. Schriften, Supabase, Leaflet und QR liegen
//     seit v2 selbst im Ordner vendor/ (keine Google-/CDN-Server mehr);
//     die Schrift-Dateien (woff2) und Leaflet kommen beim ersten Gebrauch dazu.
//   * Daten (Supabase), Adresssuche, Routen, Kartenkacheln: NIE gespeichert,
//     gehen immer direkt ins Netz.
// - Empfängt Push-Nachrichten (verschickt von der Supabase Edge Function
//   "send-push") und zeigt sie an -- auch wenn die App geschlossen ist.
const VERSION = 'v2';
const SHELL = 'geruest-shell-' + VERSION;
const RUNTIME = 'geruest-runtime-' + VERSION;
const APP_PAGE = './geruest-bestell-app.html';
const SHELL_FILES = [APP_PAGE, './index.html', './manifest.json', './logo.png', './icon-192.png', './icon-512.png',
  './vendor/fonts/fonts.css', './vendor/supabase/supabase.js', './vendor/supabase/591.supabase.js'];
const CDN_FILES = [];
// Fremde Server, deren Dateien gespeichert werden dürfen (seit v2 keine mehr)
const CDN_HOSTS = [];
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((u) =>
      fetch(new Request(u, { cache: 'reload' })).then((r) => r.ok && shell.put(u, r)).catch(() => {})));
    const rt = await caches.open(RUNTIME);
    await Promise.all(CDN_FILES.map((u) =>
      fetch(new Request(u, { mode: 'no-cors' })).then((r) => rt.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, RUNTIME];
    for (const k of await caches.keys()) if (k.startsWith('geruest-') && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
      event.respondWith(pageNetworkFirst(event, req));
    } else {
      event.respondWith(cacheFirst(event, req, SHELL));
    }
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(event, req, RUNTIME));
  // alles andere (Supabase-Daten, Nominatim, OSRM, Kartenkacheln): normal ins Netz
});

// App-Seite: Netz zuerst, nach PAGE_TIMEOUT_MS oder ohne Netz die gespeicherte Fassung
async function pageNetworkFirst(event, req) {
  const cache = await caches.open(SHELL);
  const cached = async () => (await cache.match(req, { ignoreSearch: true })) || (await cache.match(APP_PAGE));
  const net = fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      event.waitUntil(cache.put(new URL(req.url).pathname.endsWith('/') ? req.url : stripSearch(req.url), copy).catch(() => {}));
    }
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([net, timeout]);
    if (first) return first;
    const c = await cached();
    return c || await net;        // langsam, aber nichts gespeichert: weiter warten
  } catch (e) {
    const c = await cached();
    if (c) return c;
    throw e;
  }
}
function stripSearch(u) { const x = new URL(u); x.search = ''; return x.href; }

// Dateien: sofort aus dem Speicher, im Hintergrund aktualisieren
async function cacheFirst(event, req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (hit) { event.waitUntil(update.catch(() => {})); return hit; }
  return update;
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Gerüst-Bestellung', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || './geruest-bestell-app.html' },
  }));
});

// Antippen der Nachricht: offene App nach vorne holen, sonst öffnen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './geruest-bestell-app.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(target);
  }));
});
