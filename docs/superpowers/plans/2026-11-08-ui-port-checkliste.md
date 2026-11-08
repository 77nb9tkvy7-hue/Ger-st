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
