# UI-Überarbeitung (Demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `demo.html` = die echte App mit Beispieldaten und überarbeiteter Bedienung für alle 4 Rollen, ohne `geruest-bestell-app.html` zu ändern.

**Architecture:** `demo.html` ist eine Kopie von `geruest-bestell-app.html`. Ein Demo-Block ersetzt Supabase durch einen Speicher im Browser und setzt eine Rollen-Leiste darüber. Alle Bedien-Änderungen passieren direkt in der Kopie, so dass sie nach Freigabe 1:1 (ohne Demo-Block) ins Original übertragen werden können. Geprüft wird mit einem Playwright-Skript auf 390 × 844.

**Tech Stack:** Vanilla HTML/CSS/JS (eine Datei), Playwright (vorinstalliert, `require('playwright')`) nur für die Prüfung.

**Spec:** `docs/superpowers/specs/2026-11-08-ui-ueberarbeitung-design.md`

## Global Constraints

- Branch `ui-demo`. `geruest-bestell-app.html` wird in KEINEM Task geändert (`git diff --quiet 82ee6a1 -- geruest-bestell-app.html` muss Exit 0 liefern; 82ee6a1 = Ausgangs-Commit von ui-demo).
- Eine Datei, keine Frameworks, kein Build, keine neuen externen Skripte.
- Nichts entfernen: 6 Status-Stufen, Lagerabzug, „Fehlt: X Stk“, Nachlieferung, 4-s-Polling, Bestellschein-Entwurf vor dem Abschicken, Abholungen, Push, Standorte, Baupläne, Kalender.
- Artikel-IDs (`partItemId`) und gespeicherte Status-Werte (deutsch) bleiben unverändert.
- Neue Texte: in ALLEN 5 Sprachblöcken des `T`-Objekts (de, pl, sk, hr, en) mit gleichem Schlüssel.
- Farben nur über `:root`-Variablen (+ Dunkelmodus-Block); Marken-Gelb/-Blau bleiben fest.
- Animationen nur `transform`/`opacity`/`clip-path`, 150–250 ms, Kurven `--ease-out` / `--ease-drawer`; keine Einblend-Animation auf Karten/Listen; Fenster über `animateOverlayOnOpen()`.
- Touch-Ziele im Arbeitsbereich ≥ 48 px hoch (Prüfgrenze 44 px), Text ≥ 13 px, `--muted`-Kontrast ≥ 4,5 : 1.
- Schnellwahl-Mengen: `QUICK_QTY = [5, 10, 20, 50]`.

## Review Focus

1. **Neuzeichnen alle 4 s während Ziffernblock / Tour-Auswahl offen** – Eingabe darf nicht verloren gehen. Erwartung: Ziffernblock pausiert das Polling wie die anderen Fenster; Tour-Auswahl liegt in `state.tourSel`, nicht im DOM. Test in Task 6 und Task 7.
2. **Zwei Geräte gleichzeitig**: Lager hakt eine „Neu“-Bestellung ab, während ein anderes Lager-Handy schon gestartet hat. Erwartung: `setOrderStatus` setzt „In Bearbeitung“ nur, wenn der Status noch „Neu“ ist; nie rückwärts. Test in Task 8.
3. **Lange Übersetzungen** (pl/hr) in 48-px-Knöpfen und 5 Chef-Reitern bei 390 px. Erwartung: kein waagrechtes Scrollen, Beschriftung kürzt mit „…“. Test in Task 9 (Sprache pl).
4. **Dunkelmodus**: neue Abzeichen, Zahlen-Leiste, Ziffernblock lesbar. Test in Task 10.
5. **Alte Bestellungen** ohne `steps`, mit altem `pick`, mit Teilen außerhalb des Katalogs. Erwartung: werden normal angezeigt, Status-Knöpfe gehen. Beispieldaten enthalten solche Fälle (Task 1), geprüft in Task 7/8.

---

### Task 1: Demo-Gerüst mit Beispieldaten und Prüf-Skript

**Files:**
- Create: `demo.html` (Kopie von `geruest-bestell-app.html`)
- Create: `tools/demo-check.js`

**Interfaces:**
- Produces: `const DEMO = true;` · `createDemoClient()` → Objekt mit derselben Form wie der Supabase-Client, soweit die App ihn nutzt (`auth.getSession/onAuthStateChange/signOut/signInWithPassword/updateUser`, `from(tbl)` Kette mit `select/eq/like/update/upsert/filter/maybeSingle/single/select`, `rpc`, `functions.invoke`, `storage.from().createSignedUrls/upload/remove`) · `DEMO_DATA` (Startwert des Datensatzes) · `demoSwitchRole(role)` · Aktion `demo-role` / `demo-reset`.
- Produces: `node tools/demo-check.js <check> [--role=…] [--width=…] [--dark] [--lang=…]` – druckt je Prüfung `PASS <name>` oder `FAIL <name>: <Grund>`, Exit-Code 1 bei FAIL, Screenshots nach `tools/shots/<check>-<role>-<width>.png` (Ordner in `.gitignore`).

- [ ] **Step 1:** `cp geruest-bestell-app.html demo.html`; `<title>` → „Gerüst-Bestellung – DEMO“; Supabase-`<script src>`-Zeile entfernen.
- [ ] **Step 2:** Demo-Block direkt nach den Zugangsdaten: `DEMO = true`, `supabaseClient = createDemoClient()`. Speicher: `localStorage['demo-state']` (Datensatz), Start = `DEMO_DATA`. Ketten-Aufrufe sammeln Methode + Argumente; beim `then`: `maybeSingle/single` → `{data:{value}}`; `like('key','shopfloor-pos:%')` → `[]`; `update/upsert` → Wert speichern (bei `value.rev` hochzählen wie der Server), `{data:[{value}], error:null}`. `getSession` → Sitzung vorhanden; `functions.invoke` → `{data:null,error:null}`.
- [ ] **Step 3:** `DEMO_DATA` anlegen: Mitarbeiter Max (baustelle), Jochen (lager), Ludwig + Kemal (fahrer), Chefin (chef); 3 aktive BV mit `coords` und Farben grün/hellblau/schwarz; Bestellungen in ALLEN 6 Status (mind. 2× „Bereit zur Abholung“ für die Tour, 1× dringend, 1× mit `fehlt`/`nachId`, 1× altes Teil ohne Katalog-ID, 1× ohne `steps`); Inventur mit einem negativen Bestand; 1 geplante Lieferung (morgen), 1 Abholung „Gemeldet“, 1 LKW-Termin; `driverStatus` Ludwig unterwegs → BV; `lager` mit Koordinaten.
- [ ] **Step 4:** Demo-Leiste ganz oben (fest, über dem Header, gelb-schwarz gestreifter Rand, Text „DEMO – Beispieldaten“), Knöpfe Baustelle / Lager / Fahrer / Chef + „Zurücksetzen“. `demoSwitchRole(role)` setzt `state.name` auf den passenden Mitarbeiter, `state.role`, `state.loggedIn = true`, `saveSession()`, `render()` – ohne Passwort/Chef-Passwort. „Zurücksetzen“ löscht `demo-state` und lädt neu. `init` startet ohne gespeicherte Sitzung in der Rolle Baustelle. Service-Worker-Registrierung und `enablePush`/Push-Karte bei `DEMO` überspringen.
- [ ] **Step 5:** `tools/demo-check.js` mit Prüfung `baseline`: öffnet `demo.html` per `file://`, 390 × 844, `serviceWorkers:'block'`, Netz zu Kacheln/Nominatim/OSRM/Fonts abbrechen, schaltet nacheinander alle 4 Rollen über die Demo-Leiste, je Screenshot (ganze Seite), sammelt `pageerror`. PASS wenn jede Rolle ihre Ansicht zeigt (`.order-table` bzw. `.order-card`) und 0 Fehler. Zusätzlich gibt das Skript bei jeder Prüfung die Messwerte aus: `under44` (sichtbare `button,a,select,input,[data-action]` in `main`/`.overlay`/`.role-nav` mit Höhe < 44), `textUnder13`, `firstPrimaryY` (oberer Rand des ersten `.advance-btn`/Hauptknopfs), `scrollW > innerWidth`.
- [ ] **Step 6:** Run `node tools/demo-check.js baseline` → Expected: `PASS baseline`, 4 Screenshots. Messwerte als „Vorher“ notieren (für Task 10).
- [ ] **Step 7:** Commit `demo.html`, `tools/demo-check.js`, `.gitignore` – „Demo: Kopie der App mit Beispieldaten und Rollen-Umschalter“.

### Task 2: Lesbarkeit und Touch-Grundlagen

**Files:** Modify: `demo.html` (CSS `:root`, Dunkelmodus-Block, Feinschliff-Block, `.status-badge`, Knopf-Klassen)

**Interfaces:**
- Produces: CSS-Variablen `--tap: 48px`, `--fs-body: 15px`, `--fs-small: 13px`; Klasse `.btn-row-secondary` (für Task 4).

- [ ] **Step 1:** `body` 15 px; alle Schriftgrößen < 13 px in Arbeitsbereich-Regeln auf ≥ 13 px (Ausnahme: `#printArea`, Karten-Beschriftungen in Leaflet). `--muted` hell `#4B5B6B`, dunkel `#A9B8C4` (beide ≥ 4,5 : 1 auf `--bg` und `--card` prüfen und Wert im Kommentar notieren).
- [ ] **Step 2:** Mindesthöhe `var(--tap)` für alle Knopf-Klassen aus dem Feinschliff-Block plus `.pick-btn`, `.cat-row td`, `.ziel-chip`, `.mini-btn`, `.done-toggle`, `.wunsch-row` Chips, `.geo-retry`; `.qty-ctl button` 48 × 48, Zahlfeld 56 breit.
- [ ] **Step 3:** `.status-badge.st-*`: volle Status-Farbe als Hintergrund, Schrift weiß (gelb-nahe Töne: `#0B2A42`), 13 px, fett – je Status Kontrast ≥ 4,5 : 1.
- [ ] **Step 4:** Run `node tools/demo-check.js baseline` für alle Rollen → Expected: `PASS`, `textUnder13` = 0 in `main`, `under44` deutlich kleiner als in Task 1 (Rest wird in Task 4–9 erledigt).
- [ ] **Step 5:** Commit „Demo: größere Schrift, mehr Kontrast, 48-px-Knöpfe“.

### Task 3: Zahlen-Leiste statt Kacheln am Handy

**Files:** Modify: `demo.html` (`widgetsHTML`, neue `statStripHTML`, CSS)

**Interfaces:**
- Consumes: Kachel-Daten aus `widgetsHTML(role)` (gleiche Zahlen, gleiche Sprungziele `data-tab`/`data-go`/`data-done`).
- Produces: `statStripHTML(role) → string` (`<nav class="stat-strip">` mit `button.stat-chip-btn[data-action="widget-go"]`).

- [ ] **Step 1:** Kachel-Daten in eine Funktion `widgetData(role) → [{label, value, tone, tab, go, done}]` ziehen; `widgetsHTML` baut daraus die Kacheln (unverändert sichtbar ≥ 900 px), `statStripHTML` die Chips („Neu 2“, Ton als farbiger Punkt).
- [ ] **Step 2:** CSS: < 900 px Kacheln `display:none`, Leiste sichtbar (eine Zeile, waagrecht wischbar in eigenem `overflow-x:auto`, Chips 44–48 px hoch); ≥ 900 px umgekehrt.
- [ ] **Step 3:** Fahrer: `myStatusWidgetHTML()` am Handy einzeilig – zwei Knöpfe „Am Lager“ / „Unterwegs“ nebeneinander, Ziel-Chips nur bei „Unterwegs“ in derselben Karte, Navigation-Knopf bleibt; Standort-Hinweis bei Fehler einzeilig mit „Nochmal“.
- [ ] **Step 4:** Prüfung `strip` im Skript: je Rolle (390 px) `.widget` nicht sichtbar, `.stat-strip` sichtbar, Tipp auf ersten Chip scrollt/springt ohne Fehler; bei 1280 px umgekehrt. Run `node tools/demo-check.js strip` → `PASS strip`.
- [ ] **Step 5:** Commit „Demo: Zahlen-Leiste am Handy, Kacheln nur am PC“.

### Task 4: Bestellkarten – Hauptknopf zuerst

**Files:** Modify: `demo.html` (`orderCardHTML`, Abhol-Karte, CSS `.card-actions`)

**Interfaces:**
- Consumes: `.btn-row-secondary` (Task 2).

- [ ] **Step 1:** Karte: Kopf (Nr., Abzeichen, Wunsch-Abzeichen) → BV/Ort → Teile → **Hauptknopf** (nächster Schritt, volle Breite, gelb) → `.btn-row-secondary` mit „Karte“ und „Lieferschein“ (je halbe Breite, 48 px, ruhig umrandet). Besteller/Zeit/Gewicht als eine graue Zeile.
- [ ] **Step 2:** Lager- und Fahrer-Liste: offene Bestellungen ohne vorherige Abschnitte (Fahrer-Status-Liste beim Lager unter die Bestellungen).
- [ ] **Step 3:** Run `node tools/demo-check.js baseline --role=lager` und `--role=fahrer` → Expected: `firstPrimaryY` < 700, `under44` in Karten = 0.
- [ ] **Step 4:** Commit „Demo: Bestellkarten mit Hauptknopf zuerst“.

### Task 5: Baustelle – Suche oben, Teile-Arten, Varianten

**Files:** Modify: `demo.html` (`catalogHTML`, `catSectionHTML`, `catalogRowHTML`, neue Konstante `PART_GROUPS`, CSS)

**Interfaces:**
- Produces: `PART_GROUPS = { konsole: ['konsole30','konsole70','konsole100'] }` (Schlüssel = Anzeige-Gruppe, Werte = `part_<key>`-Namensschlüssel; nur Anzeige, Artikel-IDs unverändert; Gruppen-Name `T.group_konsole` in 5 Sprachen) · `state.openArt` (offene Teile-Art/Gruppe, `null` = alle zu).

- [ ] **Step 1:** Reihenfolge: Bauvorhaben (kompakte Auswahl, eine Zeile) → **Suchfeld** (56 px, groß) → System-Reiter → „Häufig bestellt“ (aufgeklappt) → Teile-Arten. Kacheln/Leiste und „Material zurückgeben“ als ruhige Zeile UNTER der Teile-Liste vor „Meine Bestellungen“. „Nochmal bestellen“ bleibt an den Bestellkarten; zusätzlich Chip „Letzte Bestellung nochmal“ unter dem Suchfeld, wenn es eigene Bestellungen gibt.
- [ ] **Step 2:** Teile-Art-Zeile (≥ 52 px): Symbol, Name, rechts „N Längen/Varianten“ bzw. „X im Auftrag“ (fett, wenn > 0), Pfeil. Antippen öffnet genau diese Art (`state.openArt`), eine andere schließt die vorige. Gruppen aus `PART_GROUPS` erscheinen als EINE Zeile „Konsole“; geöffnet zeigt sie Unterüberschriften „Konsole 30 / 70 / 100“ mit deren Varianten.
- [ ] **Step 3:** Varianten-Zeile: Name (Länge/Variante groß), Gewicht klein darunter, rechts Mengen-Steuerung (Task 6). Langes Drücken für Popup bleibt.
- [ ] **Step 4:** Prüfung `order-flow` im Skript (Rolle Baustelle): Suchfeld-Oberkante < 300; Ablauf ohne Tastatur: Tipp „Konsole“ → Tipp Schnellwahl „20“ bei „Konsole 70“ → Tipp „Bestellung prüfen“ → Bestellschein zeigt 20 × Konsole 70; gezählte Tipps ≤ 4 (Schnellwahl kommt in Task 6, bis dahin erwartet die Prüfung FAIL nur am Schnellwahl-Schritt).
- [ ] **Step 5:** Commit „Demo: Bestellen – Suche oben, Teile-Arten mit Varianten“.

### Task 6: Menge – Schnellwahl und Ziffernblock

**Files:** Modify: `demo.html` (`qtyControlHTML`, neue `numpadHTML`, Aktionen, Polling-Pause, CSS)

**Interfaces:**
- Consumes: `QUICK_QTY` (Global Constraints), Variant-Zeilen aus Task 5.
- Produces: Aktionen `qty-quick` (`data-id`, `data-q` → Menge = q), `numpad-open` (`data-id`), `numpad-key` (`data-k` = '0'–'9' | 'del'), `numpad-ok`, `numpad-cancel`; `state.numpad = {id, val}` (val als String, max. 4 Stellen).

- [ ] **Step 1:** `qtyControlHTML(it)`: − (48×48) · Zahl als Knopf (öffnet Ziffernblock, zeigt Menge oder „0“) · + (48×48); darunter Schnellwahl-Chips aus `QUICK_QTY` (nur in Varianten-Zeilen und im Teile-Popup), aktiver Chip markiert, wenn Menge = Wert. Chef-Planung nutzt dieselbe Steuerung.
- [ ] **Step 2:** `numpadHTML()`: Fenster unten (`.overlay` mit `data-action="numpad-cancel"`), oben Teile-Name + große Zahl, Tasten 3×4 (1–9, ⌫, 0, OK) je ≥ 64 px. OK übernimmt (0 = entfernen), Hintergrund-Tipp bricht ab. Läuft über `animateOverlayOnOpen()`.
- [ ] **Step 3:** Polling-Pause um `state.numpad` erweitern (gleiche Bedingung wie `state.itemPopup`).
- [ ] **Step 4:** Prüfung `numpad`: Ziffernblock öffnen, „1“ „2“ tippen, `loadShared()`-Polling 5 s abwarten, „OK“ → Menge 12 im Warenkorb. Run `node tools/demo-check.js numpad` und `order-flow` → beide `PASS`, `order-flow` meldet ≤ 4 Tipps.
- [ ] **Step 5:** Commit „Demo: Menge per Schnellwahl und großem Ziffernblock“.

### Task 7: Status-Zeiten und Fahrer (Verladen & losfahren, Tour)

**Files:** Modify: `demo.html` (`NEXT_STEP`-Nutzung, Aktion `advance`, neue Aktionen, `fahrerHTML`, `orderCardHTML`)

**Interfaces:**
- Produces: `setOrderStatus(order, status)` – setzt `order.status = status` und `order.steps = {...order.steps, [status]: new Date().toISOString()}`; ALLE Status-Wechsel im Code laufen darüber. Aktionen: `load-go` (`data-order`: Bereit → Beladen → Unterwegs in einem Schritt, Push wie bei Unterwegs), `tour-toggle` (`data-order`), `tour-load` (alle in `state.tourSel` mit Status „Bereit zur Abholung“ → Beladen), `tour-go` (alle in `state.tourSel` mit Status „Beladen“ → Unterwegs, je ein Push). `state.tourSel`: Array von Bestell-IDs, wird nach Sammel-Aktion geleert und um IDs bereinigt, die nicht mehr passen.

- [ ] **Step 1:** `setOrderStatus` einführen und alle direkten `order.status = …` darauf umstellen (Grep `\.status *=` auf Bestellungen; Abholungen haben eigenen Ablauf und bleiben).
- [ ] **Step 2:** Fahrer-Karte „Bereit zur Abholung“: Hauptknopf „Verladen & losfahren“ (`load-go`), daneben schmal „Nur verladen“ (bisheriges `advance`). „Beladen“: „Losfahren“. „Unterwegs“: „Lieferung bestätigen“.
- [ ] **Step 3:** Tour: Karten „Bereit“/„Beladen“ haben links ein großes Ankreuz-Feld (48 px, `tour-toggle`). Sind ≥ 1 angehakt, erscheint über der Reiterleiste eine feste Leiste „N ausgewählt · Alle verladen · Alle losfahren“ (Knöpfe nur aktiv, wenn passende Status dabei sind).
- [ ] **Step 4:** Prüfung `fahrer`: (a) 1 Tipp `load-go` → Status „Unterwegs“, `steps` enthält „Beladen“ und „Unterwegs“; (b) 2 Bestellungen anhaken → `tour-load` → beide „Beladen“ → `tour-go` → beide „Unterwegs“; (c) zwischen Anhaken und `tour-load` 5 s Polling abwarten, Auswahl bleibt; (d) Bestellung ohne `steps` aus den Beispieldaten lässt sich normal weiterschalten. Run `node tools/demo-check.js fahrer` → `PASS fahrer`.
- [ ] **Step 5:** Commit „Demo: Status-Zeiten, Verladen & losfahren, Tour-Modus“.

### Task 8: Lager – Zeile antippen = eingepackt

**Files:** Modify: `demo.html` (`pickListHTML`, Aktion `pick`, `orderCardHTML` Lager-Zweig, CSS `.pick-row`)

**Interfaces:**
- Consumes: `setOrderStatus` (Task 7).
- Produces: Aktion `pick-row` (`data-order`, `data-idx`: ok ↔ leer umschalten). Bestehende Aktionen `pick` (fehlt), `pick-all`, `advance` bleiben.

- [ ] **Step 1:** Packliste auch bei „Neu“ zeigen; der Knopf „Bearbeitung starten“ entfällt in der Karte (Status-Stufe bleibt). Erster gesetzter Haken (`pick-row` oder `pick-all` oder „Fehlt“) ruft `setOrderStatus(order,'In Bearbeitung')` NUR wenn `order.status==='Neu'`.
- [ ] **Step 2:** Zeile = großer Knopf (≥ 56 px, ganze Breite links) mit Kreis/Haken; rechts „Fehlt“ (≥ 48 px, deutlich getrennt, rot umrandet). „Davon fehlen: N“ unverändert.
- [ ] **Step 3:** „Bereit melden“ erscheint erst, wenn jede Zeile ok/fehlt ist, groß und gelb in der Karte; vorher Hinweis „Noch N offen“.
- [ ] **Step 4:** Prüfung `lager`: (a) „Neu“-Bestellung: Tipp auf Zeile → Status „In Bearbeitung“; (b) Zeile erneut tippen → Haken weg, Status bleibt „In Bearbeitung“; (c) Status per Daten auf „Bereit zur Abholung“ setzen (zweites Gerät), dann Zeile tippen → Status bleibt „Bereit zur Abholung“; (d) eine Zeile „Fehlt“ 2 → „Bereit melden“ → Bestand um Eingepacktes gesunken, Nachlieferung angelegt, „Fehlt: X Stk“ in Inventur sichtbar. Run `node tools/demo-check.js lager` → `PASS lager`.
- [ ] **Step 5:** Commit „Demo: Packliste – Zeile antippen, Bereit melden wenn fertig“.

### Task 9: Chef – eigener Reiter „LKWs“

**Files:** Modify: `demo.html` (`chefHTML`, Reiter-Liste, `chefPositionsHTML`-Aufruf, `mountProjectMap`, `T` neuer Schlüssel `tabLkws` in 5 Sprachen)

**Interfaces:**
- Produces: `state.chefTab = 'lkws'`; Reiter-Symbol `truck`.

- [ ] **Step 1:** Reiter-Reihenfolge: Übersicht · LKWs · Bauvorhaben · Planen · Personal. „LKWs“ zeigt `chefPositionsHTML()` (Karte, Chips) + `driverStatusListHTML()`; Erklärtext auf einen Satz. „Übersicht“ = Zahlen-Leiste + offene Bestellungen + Abholungen + Erledigt. Kachel/Chip „Fahrer unterwegs“ springt auf Reiter „LKWs“.
- [ ] **Step 2:** Reiterleiste 5 Einträge bei 390 px: Beschriftung 12–13 px mit Kürzung, Symbol 22 px, kein waagrechtes Scrollen.
- [ ] **Step 3:** Prüfung `chef`: 390 px, Sprachen de und pl: 5 Reiter sichtbar, `scrollW <= innerWidth`, Reiter „LKWs“ zeigt `#bvMapSlot` ohne Fehler, Übersicht zeigt erste Bestellkarte oberhalb 700 px. Run `node tools/demo-check.js chef` und `node tools/demo-check.js chef --lang=pl` → `PASS`.
- [ ] **Step 4:** Commit „Demo: Chef-Reiter LKWs“.

### Task 10: Gesamtprüfung und Vorher/Nachher

**Files:** Modify: `tools/demo-check.js` (Prüfung `all`), keine App-Änderung außer gefundenen Fehlern.

- [ ] **Step 1:** Prüfung `all` = `baseline` + `strip` + `order-flow` + `numpad` + `fahrer` + `lager` + `chef` für 390 × 844, dazu `baseline` bei 1280 × 900 und `--dark`; zusätzlich je Rolle Kontrast-Stichprobe (`--muted` auf `--card`, Status-Abzeichen) ≥ 4,5 : 1 berechnet aus den berechneten Farben.
- [ ] **Step 2:** Run `node tools/demo-check.js all` → alle `PASS`, 0 Konsolenfehler, `git diff --quiet 82ee6a1 -- geruest-bestell-app.html` → Exit 0.
- [ ] **Step 3:** Screenshots selbst ansehen (Handy hell + dunkel je Rolle, PC Chef); Auffälliges beheben, Prüfung erneut.
- [ ] **Step 4:** Vorher/Nachher/Warum-Tabelle aller Änderungen mit Messwerten aus Task 1 vs. jetzt (Touch-Ziele < 44, Text < 13, Position Hauptknopf, Tipps pro Bestellung) für den Nutzer schreiben.
- [ ] **Step 5:** Commit + Push `ui-demo`; Demo dem Nutzer zeigen (Datei + Screenshots). Übernahme ins Original erst nach ausdrücklicher Freigabe (eigener Plan).
