// Service Worker der Gerüst-Bestell-App.
// - Macht die Seite "zum Homescreen hinzufügen"-fähig (kein Offline-Cache,
//   die App braucht ohnehin eine Internetverbindung zu Supabase).
// - Empfängt Push-Nachrichten (verschickt von der Supabase Edge Function
//   "send-push") und zeigt sie an -- auch wenn die App geschlossen ist.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

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
