# Port-Checkliste: UI-Überarbeitung aus `demo.html` in `geruest-bestell-app.html`

`demo.html` = echte App + Demo-Teile. Beim Übernehmen in die echte App
genau diese Stellen entfernen bzw. zurückstellen (Rest 1:1 übernehmen).
Suchbegriffe in `demo.html` stehen jeweils dabei.

## Entfernen

1. **Demo-Block im Skript** – von `// ---- DEMO ----` bis einschließlich
   `const supabaseClient = createDemoClient();`:
   `window.DEMO_MODE = true`, `DEMO_STORE_KEY`, `DEMO_VERSION`, `DEMO_DATA`,
   `demoLoad`/`demoSave`, `createDemoClient()`.
2. **Rollen-Umschalter am Ende** – Block `// ---- DEMO: Rollen-Umschalter ----`:
   `DEMO_PERSON`, `demoSwitchRole()`, `demoBarUpdate()` und die
   **render-Hülle** (`const _render = render; render = function(){ … }`)
   samt Klick-Behandlung der Demo-Leiste (Zurücksetzen).
3. **Erzwungene Anmeldung in `init`** – die Zeile
   `if(!state.loggedIn){ state.name = DEMO_PERSON.baustelle; … }` direkt nach
   `restoreSession();` löschen (echte App: Anmeldeseite).
4. **Demo-Leiste HTML** – `<div id="demoBar">…</div>` am Anfang von `<body>`.
5. **Demo-Leiste CSS** – Block `/* DEMO-Leiste */` am Ende von `<style>`:
   `--demo-h`, `#demoBar …` und **`header.chrome{top:var(--demo-h);}`**
   (sonst klebt der Header 44 px zu tief).

## Zurückstellen

6. **Titel** – `<title>Gerüst-Bestellung – DEMO</title>` →
   `<title>Gerüst-Bestellung</title>`.
7. **Supabase-Bibliothek** – im `<head>` wieder einfügen:
   `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>`
   und den echten Client statt `createDemoClient()`:
   `const supabaseClient = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;`
8. **Service Worker + Push** – sind in der Demo über `window.DEMO_MODE`
   abgeschaltet (`enablePush`, `syncPushSub`, `pushCardHTML`,
   `navigator.serviceWorker.register('sw.js')`). In der echten App ist
   `window.DEMO_MODE` undefiniert → alles läuft wieder normal.
   Prüfen: Push-Karte erscheint, `sw.js` wird registriert.

## Darf bleiben (harmlos in der echten App)

9. **`window.DEMO_MODE`-Abfragen im Kern-Code** – ohne Demo-Block ist der Wert
   `undefined`, die Abfragen sind dann wirkungslos (kein ReferenceError mehr,
   früher `const DEMO`). Wer aufräumen will, kann sie entfernen.
10. **Speicher-Vorsilbe `skey()`** – hängt nur bei `window.DEMO_MODE===true`
    `demo-` vor die Schlüssel (`geruest-session`, `-cache`, `-pending`,
    `-bv`, `-lang`, `-push-*`); in der echten App bleiben die Schlüssel
    unverändert, gespeicherte Anmeldungen/Zwischenstände gelten weiter.
    Kann bleiben oder durch die direkten Schlüssel ersetzt werden.

## Nach dem Port prüfen

- `sw.js`: `VERSION` hochzählen, falls sich zwischengespeicherte Dateien
  ändern.
- Anmelden mit echter Supabase-Sitzung, alle 4 Rollen, Polling, Offline-Start.
- CLAUDE.md um die neuen Bedienteile ergänzen (Packliste per Zeilen-Tipp,
  Ziffernblock, Zahlen-Leiste, Reiter „LKWs“, Tour-Modus, Status-Zeiten).

## Zusätzlich: neue Funktionen (Branch features-demo, Plan docs/plan-neue-funktionen.md)

Je Punkt ein eigener Commit beim Übernehmen.

- **SQL**: `supabase/neue-funktionen.sql` einmal im SQL Editor ausführen (nach
  `security.sql`): `login_lookup`, `public_info` leer, Bucket `fotos` + Regeln
  (Löschen nur 5 Min. durch Hochlader), geschützte Zeilen (`prot_read`,
  `prot_upsert`, `prot_team`, `kolonne_get/set`), `zeit_cleanup` (+ pg_cron-Zeile
  im Kommentar), `freigabe_info`. Lokal getestet: `supabase/test-neue-funktionen.sql`.
- **Demo-Teile NICHT übernehmen**: `demoSeedExtras`, `demoSeedFotos`,
  `demoIdb`, `demoAgeFoto`, `demoUserName`, `demoRoleNow`, die `rpc`-/`storage`-
  Nachbauten im Demo-Client, Beispieldaten.
- **vendor/**: Schriften (`vendor/fonts/fonts.css` statt Google-Fonts-Link),
  Leaflet (`vendor/leaflet/`), QR (`vendor/qrcode/qrcode.js`), supabase-js
  (`vendor/supabase/supabase.js` statt jsDelivr). Lizenzdateien mitnehmen.
- **sw.js**: Cacheliste auf die `vendor/`-Dateien + `freigabe.html` umstellen,
  Google/jsDelivr/cdnjs aus `CDN_HOSTS`/Liste nehmen, `VERSION` hochzählen.
  Kartenkacheln (OpenStreetMap) und OSRM bleiben extern.
- **freigabe.html** mit übernehmen (öffentliche QR-Seite). Sie nutzt die
  öffentlichen `SUPABASE_URL`/`SUPABASE_ANON_KEY` – bei anderem Projekt anpassen.
- **Anmeldung**: Namensliste entfällt; Name wird eingetippt (`login_lookup`).
  Erst nach dem SQL ausrollen, sonst kann sich niemand anmelden.
- **Datenschutz/Recht** (vom Chef mit Fachmann zu klären, App liefert nur die
  Technik): Text des Einchecken-Hinweises (Reiter Personal), Speicherdauer
  (Standard 12 Monate nach „Abgerechnet am“), Betriebsrat, Datenschutzhinweis.
- **Nicht in dieser Runde**: Kundenansicht, Tribünen, Paketgrößen, Realtime,
  vollständige Aufteilung von Bestellungen/Bestand auf eigene Server-Zeilen
  (Foto-/Mängel-Einträge liegen bis dahin im gemeinsamen Datensatz).
- CLAUDE.md um die neuen Funktionen ergänzen.
