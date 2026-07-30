// Minimaler Service Worker – wird nur benötigt, damit Browser (v. a. Android/Chrome)
// die Seite als "zum Homescreen hinzufügen" anbieten. Kein Offline-Cache,
// da die App ohnehin eine Internetverbindung zu Supabase braucht.
self.addEventListener('fetch', ()=>{});
