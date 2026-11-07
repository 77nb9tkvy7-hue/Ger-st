# Gerüst-Bestell-App

## Was ist das?

Eine firmeninterne Web-App für einen Gerüstbau-Betrieb. Wenn auf der Baustelle
Gerüstteile fehlen, werden sie hier bestellt. Die Bestellung geht gleichzeitig
an das Lager und an den LKW-Fahrer.

Die komplette App ist EINE Datei: `geruest-bestell-app.html`
(HTML + CSS + JavaScript, keine Frameworks, kein Build-Schritt).

## Anmeldung

Anmeldung mit **Name + eigenem Passwort**, Rollen werden vom Chef
vergeben – "wie auf einem Discord-Server" (Nutzerwunsch). Ablauf
(`loginHTML()`, Aktionen `login` / `pick-role` / `chef-pw-ok`):

1. Name aus Liste wählen + Passwort eingeben.
2. Hat die Person genau EINE Rolle, landet sie direkt darin. Hat sie
   mehrere, bekommt sie nur IHRE Rollen zur Auswahl (`state.authName`
   = Person ist authentifiziert, aber noch keine Rolle gewählt). Ohne
   zugewiesene Rolle: Hinweis "bitte beim Chef melden".
3. Rolle **Chef** verlangt ZUSÄTZLICH das Chef-Passwort (`verifyChefPw()`,
   siehe unten, ausdrücklicher Wunsch: doppelte Sicherung). Wer mehrere Rollen hat,
   sieht im Header "Rolle wechseln" (`switch-role`, ohne erneutes
   Passwort; Chef fragt trotzdem wieder das Chef-Passwort ab).

**Echte Anmeldung über Supabase Auth** (seit Sicherheits-Umbau): Jeder
Mitarbeiter hat ein Supabase-Konto `ma<ID>@mitarbeiter.sg-muc.de`
(`AUTH_DOMAIN`, wird nie angeschrieben), Passwort = `PW_PREFIX` ('sgm#') +
eigenes Passwort (Supabase verlangt mind. 6 Zeichen, so bleiben 4-stellige
PINs gültig; neue Passwörter mind. 4 Zeichen, `MIN_PW`). Passwörter liegen
NUR verschlüsselt bei Supabase, NICHT im Datensatz. Anmelden:
`supabaseClient.auth.signInWithPassword` (Aktion `login`), danach lädt die
App mit Rechten. `state.authed` = Supabase-Sitzung vorhanden (bleibt
gespeichert bis „Abmelden“, auch offline). Ohne Anmeldung: nur
`loadPublic()` über die DB-Funktion `public_info()` (Namensliste fürs
Anmelden + die frei einsehbaren Kalender; vorher Rückfall: direkt lesen),
`saveShared()` schreibt dann nichts. Abmelden (`signOutAll()`) löscht
Sitzung, Zwischenspeicher (`geruest-cache`/`-pending`) und Daten im Speicher.
Wird jemandem die aktuelle Rolle entzogen, meldet `enforceSession()` →
`dropAuthLocal()` ihn auch beim Server ab.

Die Mitarbeiterliste (ohne Passwörter) liegt im gemeinsamen Datensatz
(`state.employees`, Einträge `{id, name, roles[], uid}`, Zähler
`state.empCounter`) und wird vom Chef im Reiter **"Personal"** gepflegt
(`personalHTML()`). Anlegen/Rollen/Passwort/Entfernen laufen über die
Edge Function **`manage-users`** (`supabase/functions/manage-users/index.ts`,
`manageUsers()`/`persRun()` in der App): prüft auf dem Server, dass der
Aufrufer Chef ist (app_metadata), pflegt Konto + Datensatz, Schutz „letzter
Chef“ auch serverseitig. `app_metadata = {emp_id, name, roles}` steht im
Anmelde-Token und wird von den Tabellen-Regeln benutzt. Einmalige
Einrichtung: Aktion `bootstrap` (nur solange es noch kein Konto gibt) legt
für alle Mitarbeiter Konten mit ihren bisherigen Passwörtern an und
entfernt die Passwörter aus dem Datensatz.

**Passwort vergessen** (Nutzerwunsch, „wird bestimmt passieren“):
- Anmeldeseite: Link „Passwort vergessen?“ (`forgot-pw`, `state.forgotPw`)
  erklärt: beim Chef melden.
- Chef, Reiter Personal: pro Person „🔑 Neues Passwort erzeugen“
  (`emp-new-pin`, `randomPin()` = zufällige 4-stellige Zahl, Rückfrage) →
  `manage-users` `set-pw`; das neue Passwort steht groß in einem Kasten in
  DERSELBEN Karte (`state.newPin = {id, pin}`, bleibt bis „Erledigt –
  weitergegeben“/Reiterwechsel; auch beim manuellen „Passwort setzen“). Wird
  nirgends gespeichert.
- Jeder selbst: Menü ☰ → „🔑 Mein Passwort ändern“ (`my-pw-open`,
  `myPwCardHTML()` oben in `<main>`, `saveMyPw()` →
  `supabaseClient.auth.updateUser({password: PW_PREFIX + neu})`, zweimal
  eingeben, mind. `MIN_PW`; Meldungen für gleiches Passwort/erneute Anmeldung
  nötig/kein Netz). Während das Formular offen ist, pausiert das 4-s-Neuzeichnen.
- Notfall, wenn kein Chef mehr in die App kommt (Chef-PIN oder Chef-Passwort
  vergessen): `supabase/notfall.sql` im SQL Editor (A: neues Passwort per
  `extensions.crypt(..., gen_salt('bf'))` in `auth.users`, B: `chefPw` aus dem
  Datensatz löschen → nächstes eingegebenes gilt). Lokal gegen Postgres getestet.

**Chef-Passwort** (zusätzliche Sicherung der Chef-Rolle + Kalender-
Bearbeiten): nicht mehr im Code, sondern als `state.chefPw = {salt, hash}`
(SHA-256) im Datensatz, `verifyChefPw()`; ändern im Reiter Personal
(„🔐 Chef-Passwort“, Aktion `chef-pw-set`). Gibt es noch keins (neue
Datenbank), wird das erste eingegebene übernommen.

**Server-Schutz** (`supabase/security.sql`, im Live-Projekt ausgeführt und
von außen geprüft: ohne Anmeldung 401 auf `app_state`, nur `public_info()`
offen): RLS
auf `app_state` – ohne Anmeldung kein Zugriff (nur `public_info()`),
Angemeldete mit mind. einer Rolle (`jwt_has_role()`) lesen/ändern den
Datensatz, Standort-Zeilen: jeder Fahrer nur seine eigene, lesen nur Chef
(`jwt_is_chef()`, `jwt_name()`); Bucket `bauplaene` privat, nur für
Angemeldete (App holt zeitlich begrenzte Links, `refreshPlanUrls()`).
`send-push` nimmt nur Aufrufe angemeldeter Mitarbeiter an. In Supabase
außerdem: Authentication → „Allow new users to sign up“ AUS (Konten nur
über manage-users).

Die Anmeldung wird per `localStorage` auf dem Gerät gespeichert und gilt,
bis man sich ausdrücklich abmeldet – KEIN Ablauf am Tagesende mehr
(Nutzerwunsch; `saveSession`/`restoreSession`/`clearSession`). „Abmelden"
löscht sie.
`enforceSession()` (nach jedem `loadShared()`) wirft automatisch raus,
wenn der Chef die Person oder ihre aktuelle Rolle inzwischen entfernt hat
oder keine Supabase-Sitzung mehr besteht.

## Menü / Kalender (ohne Anmeldung erreichbar)

Oben links sitzt das SGM-Logo, oben rechts ein Menü-Knopf (☰) – beides ist
auch VOR der Anmeldung sichtbar (Funktion `topNavHTML()`). Im Menü gibt es
die Punkte „Kalender" (`state.view = 'calendar'`) und „LKW-Kalender"
(`state.view = 'lkwkalender'`, siehe eigenen Abschnitt unten). Der Kalender
zeigt, wer wann wo im Einsatz sein soll, und ist bewusst frei einsehbar
(kein Login nötig; Daten ohne Anmeldung über `public_info()`). Einträge
bearbeiten/anlegen/löschen kann nur, wer in der App angemeldet ist UND das
Chef-Passwort eingibt (`verifyChefPw()`, eigene Freischalt-Abfrage
`state.calUnlocked`, gilt nur für die aktuelle Seitenladung); ohne Anmeldung
steht dort „🔒 … erst in der App anmelden“. Die Kalender-Daten (`calendarEntries`,
`calCounter`) liegen im selben Supabase-Datensatz wie alles andere.

## Sprachen

Fünf Sprachen: Deutsch (Standard), Polnisch, Slowakisch, Kroatisch,
Englisch (`LANGS`-Array, genau diese Reihenfolge – Kundenwunsch). Ein
eigener Globus-Knopf (🌐, `langMenuBtnHTML()`) neben dem Menü-Knopf öffnet
die Auswahl; die Wahl wird pro Gerät in `localStorage`
(`geruest-lang`) gespeichert, damit sie nicht bei jedem Besuch neu
eingestellt werden muss. Alle Oberflächentexte laufen über das `T`-
Wörterbuch (ein Eintrag pro Sprache, gleiche Schlüssel) und die Funktion
`t('schluessel', {platzhalter})`; Teile-Namen/Kategorien über
`itemName()`/`catName()` (Schlüssel `item_<id>`/`cat_<id>`), Bestell-
Status/Arbeitsschritte über `statusLabel()`/`stepLabel()` (nutzen
intern `slug()` auf den – weiterhin deutschen – gespeicherten Status-
Werten wie `'In Bearbeitung'`, damit alte Bestellungen/DB-Werte gültig
bleiben und nur die ANZEIGE übersetzt wird). Bereits aufgegebene
Bestellungen speichern Teile-Name/Einheit zwar auf Deutsch im
Datensatz, werden aber beim Anzeigen live über `resolvedItem()` wieder
in die aktuell eingestellte Sprache aufgelöst. Neue Übersetzungs-Strings
immer in ALLEN fünf Sprachblöcken im `T`-Objekt ergänzen (gleicher
Schlüssel überall), sonst fällt die Anzeige auf Deutsch zurück (kein
Absturz, aber inkonsistent).

## Teile leichter finden (Suche, Häufigkeits-Sortierung, Systeme)

Da über die Zeit sehr viele Teile aus mehreren Gerüst-Systemen dazu-
kommen sollen (Kunde hat Lieferscheine für "Modul", "SL70/SL100" und
"Tribünen" geschickt, je 30-50 Teile-Arten mit oft 5-8 Längen-Varianten
– das wird schnell eine Liste mit 150-300+ Positionen), gibt es in der
Baustellen-Bestellliste (`catalogHTML()`) drei Bausteine dagegen:

- **Häufigkeits-Sortierung** (`itemOrderCounts()`): zählt firmenweit,
  wie oft jedes Teil schon bestellt wurde (Anzahl Bestellungen, nicht
  Menge, damit ein Großauftrag die Reihenfolge nicht verzerrt). Teile
  werden innerhalb ihrer Kategorie danach sortiert; ein extra Abschnitt
  "⭐ Häufig bestellt" ganz oben zeigt zusätzlich die Top 5 firmenweit
  (nur wenn schon Bestellhistorie existiert).
- **Suchfeld** (`#catalogSearch`, `state.catalogSearch`): filtert per
  Tippen auf den (übersetzten) Teile-Namen; zeigt bei Treffern eine
  flache, nach Häufigkeit sortierte Liste ohne Kategorie-Überschriften.
- **System-Reiter** (`SYSTEMS`-Array, `state.systemSel`): „Modul" und
  „Rahmen" (= Rahmen-System SL 70/SL 100, im Excel „Materialauszug
  System", interne ID `system`). Gleiche Reiter beim Bestellen, beim
  Planen (Chef) und in der Lager-Inventur. Tribünen fehlen noch (keine
  Teile-Liste vorhanden) – neuer Eintrag in `SYSTEMS` + Teile in `PARTS`.
- **Ausklappbare Kategorien** (`state.collapsedCats`, `isCatCollapsed()`,
  `catSectionHTML()`): Jede Teile-ART ist eine Kategorie, die Längen
  sind die Zeilen darin. Kategorien starten eingeklappt (nur Name +
  Anzahl Längen sichtbar, z. B. "STIEL MIT ZAPFEN (7)"), "Häufig
  bestellt" startet aufgeklappt. Eine Kategorie mit Teilen im aktuellen
  Warenkorb bleibt immer sichtbar, auch nach Zuklappen-Versuch.

## Teile-Katalog (echte Teile aus dem Kunden-Excel)

Quelle: Kunden-Datei „Projekt.xlsm", Blätter „Materialauszug Modul" und
„Materialauszug System" (68 Teile-Arten, 159 Positionen). Im Code steht
das kompakt in `PARTS` (pro Teile-Art: Typ-ID, Namens-Schlüssel, Icon,
Systeme, Varianten `[Länge | Varianten-Schlüssel | [Länge, Schlüssel] |
null, kg pro Stück | null]`) plus `CATEGORY_ORDER` (Reihenfolge je
System = Reihenfolge im Excel). Daraus wird `CATALOG` erzeugt:
- Artikel-ID = `partItemId(typ, variante)`, z. B. `stielMZ_200`,
  `rahmenSL70_200offen`, `anker` – NIE ändern, sonst passen gespeicherte
  Bestellungen/Lagerbestände nicht mehr.
- Name = `part_<key>` (in allen 5 Sprachen im `T`-Wörterbuch) + Länge
  (`fmtLen`, sprachabhängiges Zahlenformat) bzw. Zusatz `var_<key>`
  (offen, kurz, lang, ohne/mit Zapfen …). Nur die Teile-ART wird
  übersetzt, nicht jede Länge (`itemNameLang()`).
- Teile-Arten, die in beiden Blättern EXAKT gleich sind (Längen + Gewichte,
  z. B. Spindeln, Belag, Rohre, Kupplungen, Bohlen, Gitterträger), sind
  ein gemeinsamer Artikel für beide Systeme (`systems:['modul','system']`),
  damit der Lagerbestand nicht doppelt zählt. Abweichende (z. B.
  Diagonale, Konsolen, Ringschraube) sind getrennte Typen mit gleichem
  Namen.
- SL 70 und SL 100 sind getrennte Teile (Nutzerentscheidung).
- Die alten 10 Beispielteile sind entfernt; alte Bestellungen damit
  werden über den gespeicherten deutschen Namen weiter angezeigt.

## Gewicht (wichtig für den LKW)

Gewicht pro Stück steht in `PARTS`/`CATALOG[].kg` (Excel-Spalte
„Einzeln" × 100 = kg; das Excel rechnet Summe × 0,1 in Tonnen). Neue
Bestellungen/Planungen speichern `kg` pro Position zusätzlich mit.
`weightOf()`/`weightText()`/`formatKg()` (ab 1000 kg in t): angezeigt
auf Bestellkarten, geplanten Lieferungen, Bestellschein-Entwurf,
Bestätigungs-Ticket, gedrucktem Lieferschein (Spalte Gewicht +
Gesamtgewicht), in der Fußleiste beim Auswählen (Baustelle + Chef-
Planung), im Teile-Popup und klein unter der Einheit in der Tabelle;
Fahrer-Widgets „Zu laden"/„Auf dem LKW" zeigen das Gesamtgewicht.
Teile ohne Gewichtsangabe im Excel (Anker, Netze/Planen, Aufzug-Teile,
Modul-Diagonale 1,00/1,50 m) werden als „+ N Teil(e) ohne
Gewichtsangabe" ausgewiesen; ist gar kein Gewicht bekannt, entfällt die
Zeile.

## Pakete auf dem Lieferschein

Teile können ein optionales `pkg`-Feld bekommen (Stück pro Paket, z. B.
`pkg:10` bei Stahlboden). `formatPackages(qty, item)` rechnet die
bestellte Stückzahl in ganze Pakete + Rest um (z. B. 32 Stk bei
`pkg:10` -> "3 Pakete und 2 Stk" statt einer Kommazahl wie "3,2
Pakete"). Wird nur auf dem gedruckten Lieferschein verwendet (siehe
unten), nicht in den normalen Bestellkarten in der App. OFFEN: Die
echten Paketgrößen fehlen noch (nicht im Excel) – aktuell hat kein Teil
ein `pkg`-Feld, die Umrechnung greift also erst, wenn sie pro Artikel
ergänzt werden.

## Lieferschein drucken

Jede Bestellkarte hat einen Druck-Knopf (`data-action="print-order"`,
Funktion `printOrder()`). Befüllt einen eigenen, normalerweise
unsichtbaren Bereich (`<div id="printArea">`, direktes Geschwister von
`#app` im `<body>`) mit einer sauberen, auf feste Farben (nicht die
Theme-Variablen) gesetzten Lieferschein-Ansicht -- dadurch immer
weißer Hintergrund/schwarze Schrift, unabhängig vom Dunkelmodus. Ruft
danach `window.print()` auf; der Nutzer wählt im Browser-Druckdialog
"Als PDF speichern" statt eines Druckers, um eine PDF-Datei zu
bekommen (kein PDF-Code nötig). Eine `@media print`-Regel blendet den
Rest der Seite (`#app`) komplett aus, sodass nur der Lieferschein mit
den tatsächlich bestellten Teilen gedruckt wird. Mengen werden dabei
über `formatPackages()` in Pakete umgerechnet, wenn das Teil ein
`pkg`-Feld hat.

Der Lieferschein hat zusätzlich eine Gewichts-Spalte und darunter das
Gesamtgewicht (siehe „Gewicht").

## PWA / „Wie eine App" nutzbar

Die Datei bindet eine `manifest.json` sowie `icon-192.png`/`icon-512.png`
(quadratische Kacheln, generiert aus `logo.png`) und `sw.js` ein (Service
Worker: Installierbarkeit, Push-Nachrichten, Offline-Start). Dadurch bieten Handy-Browser „Zum
Startbildschirm hinzufügen" an; die App startet dann ohne Adressleiste wie
eine eigenständige App (`display: standalone` in der Manifest-Datei).

**Startet auch ohne Netz** (Keller, Land, schlechtes Netz): `sw.js` legt die
App selbst auf dem Handy ab (Caches `geruest-shell-<VERSION>` = App-Seite,
index, manifest, Logo, Icons; `geruest-runtime-<VERSION>` = supabase-js von
jsDelivr, Google-Schriften, Leaflet von cdnjs).
- App-Seite: **erst Netz** (Neuerungen kommen sofort an), nach 4 s ohne
  Antwort (`PAGE_TIMEOUT_MS`) oder ohne Netz die gespeicherte Fassung.
- Logo/Icons/Bibliotheken/Schriften: sofort aus dem Speicher, im Hintergrund
  aktualisiert.
- NIE gespeichert: Supabase-Daten, Nominatim, OSRM, Kartenkacheln.
- Ändert sich, WAS gespeichert wird: `VERSION` in `sw.js` hochzählen (alte
  Caches werden beim Aktivieren gelöscht).
- In der App: `init` zeigt den letzten Stand (`restoreOfflineState()`)
  SOFORT an und lädt danach frisch; ohne Netz kann Supabase eine abgelaufene
  Sitzung nicht verlängern → `getSession()` meldet Fehler, dann bleibt man
  angemeldet, solange die Sitzung noch auf dem Gerät liegt (`hasStoredAuth()`).
- Tests mit Playwright: Service Worker in Tests mit Supabase-Nachbau per
  `page.route` blockieren (`service_workers='block'`), sonst lädt der SW die
  echte Bibliothek an der Attrappe vorbei.

## Die 4 Rollen

1. **Baustelle** (z. B. Max): Bestellt Teile über eine kompakte Tabelle
   (nach Kategorien gruppiert, `CATEGORIES`/`CATALOG[].cat`), bewusst
   nüchtern/Formular-artig statt Shop-Kacheln (Nutzerwunsch: "fühlt sich
   an wie Amazon" sollte weg). Teile-Name antippen und **halten** (Long-
   Press, ~480ms, `data-longpress`) öffnet ein Detail-Popup mit größerer
   Bildfläche (aktuell Platzhalter "Foto folgt", später echte Teile-Fotos)
   zur Sicherheit, dass das richtige Teil bestellt wird. „Bestellung
   prüfen" öffnet vor dem echten Abschicken einen Bestellschein-Entwurf
   zum Gegenlesen (`state.orderReview`, `orderReviewHTML()`) – erst dort
   bestätigt „Bestellung verbindlich abschicken" (`submitOrderFinal()`)
   endgültig. Sieht unten seine eigenen letzten Bestellungen mit Status.
   Ort der Bestellung: Wenn der Chef Bauvorhaben angelegt hat, wählt die
   Baustelle einfach das Bauvorhaben aus einer Liste (plus Option „Andere
   Adresse"). Bei freier Adresseingabe gibt es Live-Adressvorschläge beim
   Tippen (Nominatim-Suche, bevorzugt Umgebung des letzten GPS-Punkts)
   und einen Knopf „Meinen Standort als Adresse übernehmen" (GPS +
   Adress-Auflösung); Koordinaten werden mit der Bestellung gespeichert.
   **Schneller bestellen** („Zeit ist Geld“, Nutzerwunsch): Die Menge ist
   ein antippbares Zahlenfeld (`qtyControlHTML()`, `data-qty`, Zahlen-
   Tastatur, beim Antippen alles markiert → neue Zahl ersetzt die alte;
   `setQtyFromInput()` aktualisiert nur die Fußleiste, KEIN render(), damit
   ein direkt danach angetippter Knopf nicht verschluckt wird); +/− bleiben.
   „🔁 Nochmal bestellen“ an den eigenen Bestellungen (`reorder`) legt alle
   Teile (inkl. Fehlendem) in die Bestellliste und wählt das Bauvorhaben,
   Hinweis per `showToast()`. Das gewählte Bauvorhaben merkt sich das Gerät
   (localStorage `geruest-bv`). Suche (`matchSearch()`/`normSearch()`):
   mehrere Wörter, ohne Umlaut-/Großschreib-Unterschied, Längen als „2,00“,
   „2.00“, „200“ oder „2m“ (= genau 2,00 m).
2. **Lager** (z. B. Jochen): Drei Reiter:
   - "Bestellungen": Fahrer-Status-Liste, dann eingehende Bestellungen
     mit Buttons "Bearbeitung starten" und "Bereit melden"
   - "Geplant": vom Chef geplante Lieferungen (nur lesen)
   - "Inventur": Bestand pro Teil mit +/− und "+10". Bei "Bereit melden"
     wird der Bestand automatisch abgezogen. Negativer Bestand wird rot
     als "Fehlt: X Stk" angezeigt.
   **Packliste** (`pickListHTML()`): Ist eine Bestellung „In Bearbeitung“,
   zeigt die Lager-Karte statt der einfachen Liste jede Position mit
   „✓ Eingepackt“ / „✗ Fehlt“ (+ Feld „Davon fehlen: N“, `pickMiss-<id>-<i>`,
   per `change` gespeichert); `order.pick = {[Index]: {s:'ok'|'fehlt', n}}`.
   „Bereit melden“ kürzt die Bestellung auf das Eingepackte, zieht NUR das
   vom Bestand ab, legt für Fehlendes automatisch eine **Nachlieferung**
   an (neue Bestellung `nachVon`, übernimmt Wunschtermin; alte bekommt
   `fehlt[]` + `nachId`, Kasten „⚠️ Fehlt – kommt mit Nachlieferung #X“,
   auch auf dem Lieferschein) und schickt dem Besteller eine Push-Nachricht
   (`nMissingT/B`). Fehlt alles → Warnung, Bestellung bleibt offen.
   Knopf „✓ Alles eingepackt“ (`pick-all`) hakt alle noch offenen Positionen
   auf einmal ab.
   **Dringlichkeit/Wunschtermin**: Im Bestellschein-Entwurf wählt die
   Baustelle „Normal / 🔴 Dringend / Morgen früh / 📅 Wunschtermin“
   (`wunschPickerHTML()`, `set-wunsch`, `#wunschDate`) → `order.wunsch`
   (`'dringend'|'morgen'|'datum'`) + `order.bis` (ISO). Abzeichen auf allen
   Karten (`wunschBadgeHTML()`: DRINGEND / heute / bis … / überfällig), Lager,
   Fahrer und Chef sortieren offene Bestellungen danach
   (`sortOrdersForWork()`: dringend → nach Datum → Rest; Geliefertes unten).
   Dringende Bestellungen haben einen eigenen Push-Titel (`nUrgentT`).
3. **Fahrer** (z. B. Ludwig): Oben Widgets, dann "Mein Status" (Am Lager /
   Unterwegs – bei Unterwegs „Wohin?" mit antippbaren Bauvorhaben, siehe
   Fahrer-Status), darunter vier Reiter "Lieferungen" / "Kalender" /
   "Geplant" / "Bauvorhaben". **Kalender** (`fahrerKalenderHTML()`): zeigt
   wo wann was ist – führt LKW-Termine (`lkwEntries`, mit Uhrzeit) und
   geplante Lieferungen (`plannedDeliveries`, „ganztägig", mit Teilen +
   Gewicht) je Tag zusammen (`calEventsOn()`), jede Karte mit Bauvorhaben,
   Status-Farbe als Streifen, Adresse und Maps-Link. Oben Wochenleiste
   Mo–So mit farbigen Punkten je Termin, ‹ › blättert wochenweise, „Heute"
   springt zurück (`state.fahrerCalDay`, `data-action="fk-day"`); an
   leeren Tagen ein Knopf zum nächsten Eintrag. Die Fahrer-Kachel „Nächste
   geplante Lieferung" springt in diesen Reiter. Eingetragen werden die
   Termine weiterhin im LKW-Kalender (Menü, Chef-Passwort) bzw. über
   „Planen"/Bauvorhaben beim Chef.
   Reiter **Bauvorhaben**: oben Farb-Legende und eine **Karte von München
   + Umgebung** (Leaflet + OpenStreetMap, erst beim Öffnen nachgeladen,
   `mountProjectMap()`): jedes aktive BV als Punkt in seiner Status-Farbe
   mit Beschriftung „BV 101", Antippen zeigt Name, Adresse, Status,
   Fertig-Datum und Maps-Link. Weil die App alle 4 s per innerHTML neu
   zeichnet, gibt es EIN dauerhaftes Karten-Element (`bvMapEl`), das nach
   jedem `render()` wieder in `#bvMapSlot` gehängt wird – Zoom/Ausschnitt
   bleiben so erhalten; neu eingepasst wird nur, wenn BV dazukommen oder
   wegfallen. BV ohne Koordinaten werden einmalig über die Adresse gesucht
   (Nominatim, 1 Anfrage/s, `geocodeMissing()`) und `p.coords` gespeichert –
   zuerst nur in München + Umland (`MUC_VIEWBOX`, ca. 80 km: Augsburg,
   Ingolstadt, Landshut, Mühldorf, Rosenheim, Garmisch; `bounded=1`), erst ohne Treffer
   deutschlandweit (sonst landet z. B. eine Adresse ohne Ort anderswo).
   Sieht was wohin muss und wann bestellt wurde. Kann erst handeln, wenn
   das Lager freigegeben hat.
   Buttons: "Verladen" → "Losfahren" → "Lieferung bestätigen".
   Jede Bestellkarte (bei allen Rollen) hat einen Link „In Google Maps
   öffnen": mit GPS-Koordinaten, falls vorhanden, sonst per Adress-Suche.
4. **Chef**: Vier Reiter. „Übersicht": Widgets, Statistik-Chips pro
   Status, Fahrer-Status-Liste, alle Bestellungen. Der Lagerbestand ist
   hier auf Wunsch nur AUSGEBLENDET, nicht gelöscht (Konstante
   `SHOW_CHEF_INVENTORY = false`, zum Wieder-Einblenden auf `true`).
   „Bauvorhaben": zuerst eine Liste aller Bauvorhaben mit Status-Farben
   (`projektRowHTML()`, Farb-Legende oben, darunter „Neues Bauvorhaben"
   anlegen: Name + Adresse, automatische Nummer „BV 101" aufwärts).
   Antippen öffnet die Detail-Ansicht (`state.chefProjekt`,
   `projektDetailHTML()`): Karte mit Status-Farbe, was „vor Ort" bzw.
   bestellt/unterwegs ist, als fertig markieren/reaktivieren und
   **Fertig-Datum** (`state.projects[].fertigAm`, ISO-Datum, Datumsfeld
   `fertigDate-<id>`, gespeichert per `change`-Listener): bei aktiven BV
   „Fertig geplant am", bei fertigen „Fertig am". „Als fertig markieren"
   übernimmt das gewählte Datum, setzt aber heute, wenn keins oder eins in
   der Zukunft gewählt ist; „Wieder aktivieren" löscht es. Das Datum steht
   in der BV-Liste (🏁), auf der Karte bei Lager/Fahrer (nur lesen) und als
   Eintrag „Fertigstellung" im Fahrer-Kalender (`calEventsOn()`, Art
   `fertig`); Bereich
   „Fahrer" mit „Hierher schicken"/„Zurückholen" pro Fahrer (setzt dessen
   `driverStatus` auf unterwegs → dieses BV, `by` = Chef-Name); „Lieferung
   hinzufügen" (gleiches Planungs-Formular `planFormHTML(projektId)`, ohne
   BV-Auswahl) und die geplanten Lieferungen dieses BV. Am PC stehen
   Karte/Fahrer links und das Lieferungs-Formular rechts (`.detail-grid`).
   „Planen": Lieferungen im Voraus planen. „Personal": Mitarbeiter,
   Rollen und Passwörter verwalten (siehe „Anmeldung"). Die Rolle ist
   zusätzlich zum eigenen Passwort mit dem Chef-Passwort geschützt
   (verschlüsselt im Datensatz, im Reiter Personal änderbar). Die echte
   Absicherung macht der Server (Supabase Auth + Tabellen-Regeln, siehe
   „Anmeldung“).

## Abholungen / Rücklieferungen

Material, das von einer Baustelle zurück ins Lager soll – übriges Material
(Betrieb liefert lieber etwas zu viel als zu wenig) oder der ganze Abbau.
`state.pickups = [{id, projekt, baustelle, coords, person, items[], abbau,
notiz, wunsch, bis, status, fahrer, changedBy, time}]`, Zähler
`pickupCounter` (in `RECORD_ARRAYS`). Ablauf `PU_FLOW` (Werte deutsch
gespeichert, Anzeige über `PU_KEY`): Gemeldet → Unterwegs (Fahrer „🚚 Ich
hole es ab“, setzt `fahrer`, Push an Besteller `nPuOnWayT/B`) → Abgeholt
(„✓ Aufgeladen“) → Im Lager (Fahrer oder Lager „🏭 Im Lager abgeladen“:
Teile kommen in den Bestand zurück). Neue Abholung → Push an Fahrer, Lager,
Chef (`nPuNewT/B`).
- **Editor** (`pickupEditorHTML()`, `state.puDraft`, Overlay wie der
  Bestellschein-Entwurf): Bauvorhaben oder freie Adresse; Liste vorbefüllt
  mit dem, was dort **vor Ort** ist (`deliveredAt(pid)` = geliefert minus
  schon zurück im Lager) mit eintippbaren Mengen (`data-pq`,
  `setPuQtyFromInput()` ohne render), „Alles, was vor Ort ist“ / „Alle auf
  0“, weitere Teile über Suche (`#puSearch`, `matchSearch`), Haken
  „Komplettes Gerüst abbauen“ (`abbau`), Hinweis für den Fahrer, Wann
  (Wunsch-Chips wie bei Bestellungen).
- **Bis „Im Lager“ jederzeit änderbar** (`pu-edit`): Besteller solange
  „Gemeldet“, Fahrer/Lager/Chef immer (z. B. Fahrer passt vor Ort die echte
  Menge an, `changedBy`). Löschen: Besteller (solange Gemeldet) und Chef.
- **Wo**: Baustelle – Knopf „↩ Material zurückgeben / Abholung melden“
  unter der BV-Auswahl + „Meine Abholungen“; Fahrer – oben im Reiter
  „Lieferungen“ („↩ Abholen“), Widget „Abholen“ (sonst wie früher „Zu
  räumen“), Fahrer-Kalender (Art `abholung` am Wunschtag); Lager – Reiter
  Bestellungen „↩ Kommt zurück ins Lager“; Chef – Übersicht + BV-Detail
  („↩ Abholung anlegen“). „Vor Ort“ auf der BV-Karte zieht Zurückgeholtes ab.

## Widgets (kurze Übersicht oben, Idee wie iPhone-Widgets)

`widgetsHTML(role)` zeigt bei jeder Rolle oben ein paar Info-Kacheln
(`widgetTile()`, Farbtöne `w-green/w-blue/w-sky/w-amber/w-red/w-accent/
w-grey`); antippbare Kacheln springen in den passenden Reiter
(`data-action="widget-go"`, setzt `state[role+'Tab']`).
- Baustelle (nur wenn eigene Bestellungen existieren, 3 kompakte
  Kacheln): Unterwegs zu dir / Im Lager / Geliefert.
- Fahrer: Zu laden (Bereit zur Abholung) / Auf dem LKW (Beladen +
  Unterwegs) / Zu räumen (aktive BV mit Farbe hellblau) / Nächste
  geplante Lieferung.
- Lager: Neue Bestellungen / In Bearbeitung / Fehlt im Lager (Bestand
  < 0) / Nächste geplante Lieferung.
- Chef (nur im Reiter Übersicht): Offene Bestellungen / Fahrer unterwegs
  (mit Ziel) / Aktive Bauvorhaben je Farbe / Nächste geplante Lieferung.
- **Jede Kachel ist antippbar** und springt zur passenden Liste
  (`widgetTile({tab, go, done})` → `data-tab`/`data-go`/`data-done`, Aktion
  `widget-go` → `jumpTo(id)`: scrollt unter den Header und lässt den
  Abschnitt kurz gelb aufleuchten, `.jump-flash`). Ziele: `sec-offen`
  (Offene Bestellungen Chef/Lager), `sec-lkw` (Chef-Karte „Wo sind die
  LKWs?“), `sec-geplant` (geplante Lieferungen), `sec-mine` (Baustelle
  „Meine Bestellungen“), `done-<key>` (+ Erledigt aufklappen, z. B.
  Baustelle „Geliefert“), `sec-fahrer-offen`/`sec-fahrer-pu`. Fehlt das
  Ziel, geht es nach oben.

## Layout / Bedienung (einfach für alle Rollen)

- **Reiter unten am Daumen** (Handy < 900 px): Die Reiter von Lager,
  Fahrer und Chef sind EIN Element (`roleNavHTML(action, cur, tabs)`,
  `<nav class="seg-control role-nav">`), das per CSS am Handy als feste
  Leiste unten mit Symbol + rote Zahl (`rn-badge`: Lager = neue Bestellungen
  + abgeholte Rückläufer, Fahrer = zu laden/unterwegs + offene Abholungen,
  Chef = neue Bestellungen + neue Abholungen) erscheint, am PC wie bisher
  oben. `body.has-nav` (in `render()`) schiebt Fußleisten/Hinweise darüber.
- **Erst das, was zu tun ist**: Listen zeigen offene Bestellungen
  („Offene Bestellungen N“, `sectionH()`), Geliefertes zugeklappt unter
  „✓ Erledigt (n)“ (`doneSectionHTML(key, …)`, `state.showDone`, Aktion
  `toggle-done`) – Lager, Fahrer, Chef und „Meine Bestellungen“ der Baustelle.
- **Kompakte Karten**: Karte/Lieferschein als kleine Knöpfe in einer Zeile
  (`.card-actions` / `.mini-btn`), Hauptknopf direkt sichtbar.
- **Weniger Ballast**: „Aktualisieren“ steht im ☰-Menü (App aktualisiert
  sich ohnehin alle 4 s), Fahrer-Status-Bereich nur wenn jemand einen Status
  hat (`driverStatusSectionHTML()`), Status-Kästchen beim Chef entfernt
  (doppelt zu den Kacheln), Info-Kacheln am Handy flacher, Standort-Hinweis
  beim Fahrer kurz, wenn alles in Ordnung ist (`geoOnShort`).

## PC-Ansicht (Chef im Büro)

Mobile-first bleibt: am Handy eine Spalte wie bisher. Ab 900 px wird
`main` breiter (1060 px), Kartenlisten (`.card-grid`, `.proj-list`)
zweispaltig, Widgets vierspaltig; ab 1280 px `main` 1320 px, Karten
dreispaltig und die Bauvorhaben-Detailansicht zweispaltig
(`.detail-grid`). Neue Kartenlisten immer in `<div class="card-grid">`
packen, damit sie am PC mitwachsen.

## Push-Benachrichtigungen (auch bei geschlossener App)

Nutzerentscheidung: echte Web-Push-Nachrichten („Weg 2").
- **Handy**: Karte „🔔 Benachrichtigungen" oben in `<main>`
  (`pushCardHTML()`, „Einschalten"/„Später"; „Später" merkt sich
  `geruest-push-later`, danach bleibt der Menüpunkt „Benachrichtigungen
  einschalten"). `enablePush()` fragt die Erlaubnis, abonniert über den
  Service Worker mit `VAPID_PUBLIC_KEY` und legt das Abo in
  `state.pushSubs` ab (`{endpoint, keys, name, lang, ts}`, geteilter
  Supabase-Datensatz). `syncPushSub()` (nach Login, Sprachwechsel, Start)
  hängt ein schon erlaubtes Handy still auf die aktuelle Person/Sprache um;
  `unlinkPushSub()` beim Abmelden löst die Zuordnung. iPhone: nur als
  Home-Bildschirm-App (ab iOS 16.4) – sonst zeigt die Karte einen Hinweis.
- **Service Worker** `sw.js`: `push` zeigt die Nachricht (Icon
  `icon-192.png`), `notificationclick` holt die App nach vorne/öffnet sie.
- **Versand**: `notify({roles, names}, titelKey, textKey, vars)` ruft die
  Supabase Edge Function `send-push` auf (`supabaseClient.functions.invoke`)
  und schickt die Texte gleich in allen 5 Sprachen mit (`tlv()`), die
  Funktion wählt pro Handy die passende. Absender wird ausgenommen.
  Ereignisse: neue Bestellung → Lager + Chef; „Bereit zur Abholung" →
  Fahrer; „Unterwegs"/„Geliefert" → Besteller; Chef schickt Fahrer →
  dieser Fahrer; neue geplante Lieferung → Lager + Fahrer; neuer
  LKW-Termin → Fahrer. Texte: Schlüssel `n…T`/`n…B` im `T`-Wörterbuch.
  Abgelaufene Abos meldet die Funktion als `gone`, die App löscht sie.
- **Edge Function** `supabase/functions/send-push/index.ts` (Deno,
  `npm:web-push`): liest `app_state` mit dem Service-Role-Key (stellt
  Supabase automatisch bereit), wählt Abos nach Rolle (über `employees`)
  oder Name. Einrichtung steht oben in der Datei: im Supabase-Dashboard
  als Funktion `send-push` anlegen + Secrets `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Der private VAPID-Schlüssel steht
  NUR dort, nie im Repo. Ist die Funktion nicht eingerichtet, scheitert
  der Versand still (App läuft normal weiter).
- Schutz: `send-push` nimmt nur Aufrufe angemeldeter Mitarbeiter an
  (Anmelde-Token wird geprüft; der öffentliche Anon-Key allein → 401).

## LKW-Standorte (nur für den Chef sichtbar)

Nutzerentscheidung „Variante A“: kein Store-App, sondern im Browser/PWA –
der Standort wird NUR geteilt, solange ein Fahrer in der Rolle Fahrer
angemeldet ist UND die App offen im Vordergrund hat (Browser erlauben im
Hintergrund kein GPS). Sichtbar nur für den Chef.
- **Fahrer**: `syncGeo()` (nach jedem `render()` und bei
  `visibilitychange`) startet/stoppt `navigator.geolocation.watchPosition`.
  Gesendet wird höchstens alle 30 s (`POS_EVERY_MS`, plus „noch da“-
  Meldung alle 30 s bei Stillstand) über `sendPos()`/`writePos()`. Oben in
  der Fahrer-Ansicht steht deutlich `#geoBadge` („📍 Dein Standort wird
  geteilt …“ / „wird gesucht“ / „Freigabe ist aus“ mit Knopf
  `geo-retry` / „Gerät liefert keinen Standort“) – Hinweispflicht DSGVO.
- **Speicher**: nur die LETZTE Position `{lat, lon, acc, ts}`, je Fahrer
  eigene Zeile `app_state.key = 'shopfloor-pos:<Name>'` (damit die häufigen
  Meldungen nicht mit Bestellungen im großen Datensatz kollidieren).
  Scheitert das (z. B. Tabellen-Regeln erlauben keine neue Zeile), Rückfall:
  frisch laden und in `driverPos[name]` im großen Datensatz speichern.
  Abmelden/Rollenwechsel (`stopGeo(true)`, auch beim Rauswurf durch
  `enforceSession`) überschreibt die Zeile mit `{off:true}` – kein Verlauf.
- **Chef**: `loadPositions()` (nur in der Chef-Rolle, in `loadShared()`)
  liest alle `shopfloor-pos:%`-Zeilen + `driverPos` (jeweils neuerer Wert
  gewinnt) nach `state.positions`. Reiter „Übersicht“ → Abschnitt „📍 Wo
  sind die LKWs?“ (`chefPositionsHTML()`): dieselbe Leaflet-Karte (gleicher
  `#bvMapSlot`-Mechanismus wie beim Fahrer) mit BV-Punkten plus 🚚-Markern
  (`updateTruckMarkers()`, Marker bleiben bestehen, damit offene Popups das
  Neuzeichnen überleben), Beschriftung „Ludwig · gerade eben / vor 5 Min. /
  zuletzt gesehen um 10:42“ (`posAgoText()`), ältere als 2 Min. blasser,
  älter als 12 h ausgeblendet. Darunter Chips je Fahrer (`pos-focus`
  springt auf der Karte hin und öffnet das Popup mit Ziel-BV, Genauigkeit,
  Maps-Link). Lager/Fahrer laden keine Positionen.
- **Routen** (Chef-Karte): Ist ein Fahrer „Unterwegs“ mit Ziel-BV (mit
  Koordinaten) und teilt seinen Standort, zeichnet `updateRoutes()` die
  Straßen-Route (SG-Blau) von seiner Position zum BV, mit „ca. X Min. Fahrt ·
  Y km“ in Chip und Popup (`routeCache`, `fetchRoute()`, `posChipText()`).
  Quelle: freier OSRM-Dienst (`ROUTE_URL`, router.project-osrm.org, Daten
  OpenStreetMap, kein Schlüssel; Fahrzeit ohne Verkehr). Neu berechnet nur
  bei > 150 m Bewegung (max. alle 20 s je Fahrer); ohne Antwort bleibt eine
  gestrichelte Luftlinie. Echte Google-Routen IN der Karte bräuchten ein
  kostenpflichtiges Google-Konto + API-Schlüssel – stattdessen Popup-Link
  „🧭 Route in Google Maps“ (`maps/dir/?api=1&origin=…&destination=…`).
- **Status automatisch (Am Lager / Unterwegs)**: Der Chef trägt im Reiter
  „Bauvorhaben“ unten den **Lager-Standort** ein (`lagerSettingHTML()`,
  Adresse → Nominatim mit München+Umland-Vorrang, oder „Ich bin gerade am
  Lager“ per GPS; gespeichert als `state.lager = {adresse, coords}` im
  großen Datensatz, Feld `lager`; 🏭 auf beiden Karten). Das Fahrer-Handy
  (App offen, Standort geteilt) stellt dann selbst um (`autoDriverStatus()`):
  ≤ 250 m (`LAGER_IN_M`) → „Am Lager“, ≥ 450 m (`LAGER_OUT_M`) → „Unterwegs“
  (dazwischen nichts, gegen Hin-und-Her; Standorte mit Genauigkeit > 300 m
  werden ignoriert). Nur beim WECHSEL der Zone, damit Handeinstellungen
  bleiben; beim ersten Standort nach dem Öffnen wird ein < 15 Min. alter
  Status (`ts`, wird bei jeder Handänderung gesetzt) nicht überschrieben.
  Automatische Änderungen haben `auto:true` („🔄 automatisch“ beim Fahrer).
  Ist er schon „Unterwegs“ (z. B. vom Chef geschickt), bleibt das Ziel.
- **Fahrer**: Bei „Unterwegs“ mit Ziel zeigt „Mein Status“ den gelben Knopf
  „🧭 Navigation starten (Google Maps)“ (`navButtonHTML()`), der Google Maps
  mit Navigation zum BV öffnet.
- Schutz: Tabellen-Regeln (`supabase/security.sql`, live aktiv) – lesen
  darf die Standort-Zeilen nur der Chef, schreiben jeder Fahrer nur seine
  eigene; ohne Anmeldung kein Zugriff. Fahrer sollten (DSGVO) informiert
  werden, dass ihr Standort während der Arbeit in der App geteilt wird.

## Baupläne pro Bauvorhaben

Dateien (PDF oder Fotos, max. 50 MB je Datei, `PLAN_MAX_MB`) liegen im
Supabase-Storage-Bucket `bauplaene` (`PLAN_BUCKET`) unter
`bv<ID>/<zufall>-<name>`; die Liste steht je Bauvorhaben in
`p.plaene = [{id, name, path, type, size, date, by}]` im großen Datensatz.
- **Chef** (BV-Detail, `projektCardHTML(p, true)` → `plaeneHTML(p, true)`):
  „⬆️ Plan hochladen“ (mehrere Dateien, `#planFile-<id>`, `uploadPlans()`),
  🗑 löschen (`plan-delete`, mit Rückfrage, löscht auch die Datei).
  BV-Liste zeigt „📐 N“.
- **Ansehen**: Fahrer/Lager auf der BV-Karte, Baustelle unter der
  BV-Auswahl beim Bestellen (`plaeneHTML(p, false)`); Fotos mit Vorschau,
  Antippen öffnet die Datei (`getPublicUrl`).
- Fehlermeldungen: zu groß (`planTooBig`), Bucket fehlt (`planNoBucket`),
  sonstiger Fehler/kein Netz (`planUploadFail`).
- **Erst-Einrichtung (historisch, damals öffentlich; heute überschreibt
  `supabase/security.sql` die Regeln → privat, nur Angemeldete):**
  ```sql
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('bauplaene', 'bauplaene', true, 52428800)
  on conflict (id) do update set public = true, file_size_limit = 52428800;
  drop policy if exists "bauplaene lesen" on storage.objects;
  drop policy if exists "bauplaene hochladen" on storage.objects;
  drop policy if exists "bauplaene loeschen" on storage.objects;
  create policy "bauplaene lesen" on storage.objects for select to anon using (bucket_id = 'bauplaene');
  create policy "bauplaene hochladen" on storage.objects for insert to anon with check (bucket_id = 'bauplaene');
  create policy "bauplaene loeschen" on storage.objects for delete to anon using (bucket_id = 'bauplaene');
  ```
  Seit `supabase/security.sql`: Bucket privat, nur für Angemeldete; die App
  holt zeitlich begrenzte Links (6 h, `createSignedUrls`, `refreshPlanUrls()`).

## Hell-/Dunkelmodus

Die App folgt automatisch der Handy-/Browser-Einstellung
(`@media (prefers-color-scheme: dark)`), kein manueller Umschalter. Alle
Farben laufen über CSS-Variablen im `:root` (z. B. `--bg`, `--card`,
`--ink`, `--accent`, `--line`, `--surface-2`, `--icon-tile`, `--zebra`) –
der Dunkelmodus überschreibt nur diese Grundwerte, Komponenten verwenden
nie eigene Hex-Farben direkt. Bewusst FEST (nicht vom Modus abhängig)
bleiben die Marken-Elemente: der blaue Login-Verlauf, die gelben Ränder
an Header/Login-Karte und die gelben Haupt-Knöpfe – das war ausdrücklich
so gewünscht ("dunkel mit diesem Blau, hell wie es davor war"). Für
Knöpfe mit weißer Schrift auf voller Akzentfläche (z. B. Chef-Passwort-
"Anmelden") gibt es die eigene, immer kräftige `--accent-solid` (statt
`--accent`, das im Dunkelmodus bewusst heller wird und mit weißer
Schrift sonst zu wenig Kontrast hätte).

## Status-Ablauf einer Bestellung

Neu → In Bearbeitung → Bereit zur Abholung → Beladen → Unterwegs → Geliefert
(die ersten beiden Schritte macht das Lager, den Rest der Fahrer)

## Datenspeicherung – WICHTIG

Die App nutzt Supabase als geteilten Online-Speicher (kostenlose Stufe).
Alle Bestellungen und der Lagerbestand landen in einer Tabelle `app_state`
(eine Zeile mit `key = 'shopfloor-data-v2'` und einer `jsonb`-Spalte `value`,
die `{orders, counter, inventory, projects, projektCounter, calendarEntries,
calCounter, driverStatus, driverPos, plannedDeliveries, planCounter, lkwEntries,
lkwCounter, employees, empCounter, pushSubs, lager, rev}` enthält). Ausnahme: LKW-Standorte
liegen je Fahrer in einer EIGENEN Zeile (`key = 'shopfloor-pos:<Name>'`,
siehe „LKW-Standorte“), `driverPos` im großen Datensatz ist nur der Rückfall. Dadurch sehen alle Rollen
(egal auf welchem Handy, auch über GitHub Pages) dieselben Daten.

Speichern/Laden läuft über `loadShared()`/`saveShared()`, beide rufen den
gemeinsamen Abgleich `sync()` → `doSync()` auf (Abschnitt „Speicher:
Abgleich mit Supabase“ im Code). NIE wieder den ganzen Datensatz blind
überschreiben – Prinzip:
- `syncBase` = zuletzt vom Server gelesener Stand. Beim Speichern wird der
  AKTUELLE Server-Stand geholt und nur der Unterschied `syncBase` → eigener
  Stand (`stateToValue()`) daraufgelegt (`merge3()`): Listen mit `id`
  (orders, projects, calendarEntries, plannedDeliveries, lkwEntries,
  employees) und `pushSubs` (über `endpoint`) je Eintrag und feldweise;
  `driverStatus`/`driverPos` je Name; **Lagerbestand als +/−** (zwei
  Handys buchen gleichzeitig +10 → +20); Zähler = Maximum; gleiche neue
  Nummer von zwei Geräten → eine bekommt die nächste freie.
- Geschrieben wird nur, wenn der Server noch auf derselben Version steht
  (`value.rev`, bedingtes `update … where value->>rev = …`,
  `writeIfUnchanged()`); sonst neu lesen + neu zusammenführen (bis 5×).
  Geht das bedingte Schreiben nicht (Tabellen-Regeln), Rückfall `upsert`.
- Ohne je gelesenen Server-Stand wird NICHT gespeichert (früher konnte ein
  fehlgeschlagenes Laden den Lagerbestand mit leeren Startwerten
  überschreiben).
- **Offline / schlechtes Netz:** Änderungen bleiben auf dem Handy
  (`state.syncPending`, localStorage `geruest-pending` = {base, local},
  max. 3 Tage) und werden alle 8 s bzw. beim `online`-Ereignis
  nachgesendet. Der letzte Server-Stand liegt in `geruest-cache`, damit die
  App auch ohne Netz startet (`restoreOfflineState()` in `init`). Hinweis-
  Leiste oben (`syncBannerHTML()`, Texte `syncPending`/`syncOffline`).
- Werte, die im Datensatz `null` sind, gelten wie „nicht vorhanden“
  (`stableStr()`/`same()`), z. B. `ziel:null` beim Fahrer-Status.
- Neue Felder im Datensatz: in `stateToValue()` UND `applyValue()` ergänzen
  (Listen mit `id` zusätzlich in `RECORD_ARRAYS` samt Zähler).
Zusätzlich gibt es ein 4-Sekunden-Polling per `setInterval`, das
`loadShared()` aufruft, damit alle Rollen neue Bestellungen/Status ohne
manuellen Reload sehen.

**Tägliche Sicherung:** `supabase/backup.sql` (einmalig im SQL Editor
ausgeführt) legt `app_state_backup` an (Zugriffsschutz an, keine Regeln →
nur im Dashboard sichtbar) und einen pg_cron-Job `app-state-backup`, der
jede Nacht 02:00 UTC den Datensatz kopiert und Sicherungen > 30 Tage
löscht. Wiederherstellen: SQL unten in derselben Datei (zählt `rev` hoch).

Die Zugangsdaten (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) stehen am Anfang des
`<script>`-Blocks in `geruest-bestell-app.html` und müssen pro Firma einmal
mit den eigenen Werten aus dem Supabase-Dashboard ersetzt werden.

## Geplante nächste Schritte

- Kalender-Bearbeitung: aktuell nur über das (gemeinsame) Chef-Passwort
  freischaltbar. Nutzer möchte, dass auch andere/mehrere Mitarbeiter
  Termine eintragen können, nicht nur "Chef" – noch offen, wie genau
  (eigene Berechtigung pro Person? weiteres Passwort?).
  Nur eine Idee bisher: eine Extra-Spalte "Stunden" im Kalender, die nur
  Chefin (und Chef, der sieht sowieso alles) sehen kann, andere Rollen/
  Mitarbeiter nicht – noch nicht umgesetzt, nur besprochen.
- Weitere Ideen: Realtime-Updates statt Polling (Supabase Realtime),
  Export der Bestellungen als PDF/CSV.
- **Idee (nur gemerkt, noch nicht besprochen/gebaut): Einchecken auf der
  Baustelle + Regieberichte.** Mitarbeiter checken auf der Baustelle ein/aus
  → man sieht, wann sie da waren und wie lange sie gearbeitet haben.
  Einchecken nur VOR ORT möglich (nicht „von irgendwo“, z. B. GPS-Abstand
  zum Bauvorhaben wie `autoDriverStatus()` beim Lager). **Kolonnen**:
  mehrere arbeiten als Team (z. B. Kolonnenführer checkt die ganze Kolonne
  ein). Die Stunden sollen pro **Bauvorhaben** gesammelt werden und in
  **Regieberichte** (Stundenlohnarbeiten für den Kunden) einfließen. Hängt
  mit der Stunden-Spalte im Kalender zusammen (nur Chef sieht sie).
  Rechtlich beachten: Arbeitszeit-/Ortserfassung von Mitarbeitern →
  Datenschutzhinweis, ggf. Betriebsrat (§ 87 BetrVG), Speicherdauer; die
  Stunden dürfen NICHT im für alle Angemeldeten lesbaren Datensatz liegen
  (siehe Sicherheits-Umbau).
- **Sicherheits-Umbau (in Planung):** Heute kann jeder Angemeldete (egal
  welche Rolle) den ganzen Datensatz lesen und ändern; ohne Anmeldung sind
  Namensliste, beide Kalender und BV-Adressen über `public_info()` offen.
  Geplante Stücke: 1) nichts Persönliches ohne Anmeldung, 2) Server prüft
  Rollen beim Ändern, 3) nur nötige Daten lesen (Stunden/Personal/
  Standorte nur Chef), 4) Schriften/Bibliotheken selbst ausliefern statt
  Google Fonts/CDN.

## Große Erweiterung Chef/Lager/Fahrer (umgesetzt)

Nutzer hatte mehrere größere Funktionen auf einmal angefragt; wurde
Stück für Stück umgesetzt (jedes Stück eigener Commit/PR): ausklappbare
Kategorien, Paket-Umrechnung + druckbarer Lieferschein, Projekt-Farben,
Fahrer-Status, Geplante Lieferungen, LKW-Logistik-Kalender (Details zu
den letzten vier siehe unten).

### Projekt-Farben (umgesetzt)

Jedes Bauvorhaben (`state.projects[].farbe`, Werte `'gruen'`,
`'hellblau'`, `'schwarz'` oder `null`/unbenannt) hat einen Status-Punkt
und einen farbigen Streifen an Karte/Listenzeile. Die angezeigten Töne
wurden ans SG-Design angepasst (Grün #1E9E5A, Blau #3AA0E6, „nichts zu
tun" = Grau #7A8896 statt Schwarz, das im Dunkelmodus unsichtbar war) –
die gespeicherten Werte (`'schwarz'` usw.) bleiben unverändert
("Status-Farbe") auf seiner Karte: Grün = "da muss was hin" (Lieferung
nötig), Hellblau = "da muss was geräumt/abgeholt werden" (Abbau),
Schwarz = nichts zu tun, kein Punkt = noch nicht gesetzt. Bewusst eine
einfache Farbliste (Konstante `PROJECT_COLORS`, Meta-Infos inkl.
Übersetzungs-Schlüssel in `projektColorMeta()`), keine echte Karte.

Nur der Chef kann die Farbe ändern: In der Chef-Bauvorhaben-Ansicht
(`projekteHTML()`, ruft `projektCardHTML(p, true)` auf) erscheinen
anklickbare Farb-Kacheln (`data-action="set-projekt-color"`); Lager und
Fahrer sehen nur den Status-Punkt (`projektCardHTML(p, false)` blendet
Farb-Kacheln UND den "Als fertig markieren"-Knopf aus, da auch das eine
Chef-Entscheidung ist).

Damit die Fahrer die Farben überhaupt sehen können, hat die
Fahrer-Ansicht (`fahrerHTML()`) jetzt zwei Reiter (`state.fahrerTab`,
analog zum bestehenden Lager-/Chef-Reiter-Muster): "Lieferungen" (bisheriger
Inhalt, unverändert) und "Bauvorhaben" (neu, `fahrerProjekteHTML()` –
nur aktive Bauvorhaben, rein lesend).

### Fahrer-Status (umgesetzt)

Jeder Fahrer stellt für sich selbst ein, wo er gerade ist – nicht ein
gemeinsamer LKW-Status, da mehrere Fahrer gleichzeitig unterwegs sein
können. Gespeichert in `state.driverStatus` (geteilter Supabase-
Datensatz, Feld `driverStatus`), ein Objekt keyed nach Mitarbeitername:
`{status:'lager'|'unterwegs', ziel: BV-ID|null, by: Chef-Name|null,
time:'...'}`. Bei „Unterwegs" tippt der Fahrer unter „Wohin?" ein
aktives Bauvorhaben an (`set-driver-ziel`); schickt der Chef ihn aus
der Bauvorhaben-Detailansicht hin, steht `by` drin und der Fahrer sieht
„Vom Chef geschickt". Wechsel auf „Am Lager" löscht das Ziel (Konstante
`DRIVER_STATUSES`, Meta-Infos/Übersetzungs-Schlüssel in
`driverStatusMeta()`).

Jeder Fahrer sieht oben auf seiner eigenen Ansicht (`fahrerHTML()`,
`myStatusWidgetHTML()`) zwei Knöpfe ("Am Lager – nichts zu tun" /
"Unterwegs", Klick setzt `data-action="set-driver-status"`) sowie den
Zeitpunkt der letzten Änderung. Chef (Reiter "Übersicht") und Lager
(Reiter "Bestellungen") sehen eine Liste aller gesetzten Fahrer-Status
(`driverStatusListHTML()`), damit erkennbar ist, welcher Fahrer gerade
verfügbar ist.

### Geplante Lieferungen (umgesetzt)

Der Chef kann Lieferungen im Voraus planen, getrennt von den
dringenden/laufenden Bestellungen: eigener 3. Reiter "Planen" beim Chef
(`chefHTML()`, Funktion `planenHTML()`) – Bauvorhaben wählen (nur
aktive), Lieferdatum wählen, danach Teile auswählen über dieselbe
Katalog-Tabelle wie beim normalen Bestellen (wiederverwendet
`catSectionHTML()`/`catalogRowHTML()`/`qtyControlHTML()` und damit auch
Suche + Häufigkeits-Sortierung + Systeme-Reiter, falls vorhanden; läuft
über den gemeinsamen `state.cart`, da Chef und Baustelle nie gleich-
zeitig eingeloggt sind). "Lieferung einplanen" legt einen Eintrag in
`state.plannedDeliveries` an (`{id, projekt, date, items, person}`,
eigener Zähler `state.planCounter`, im selben Supabase-Datensatz wie
alles andere) und leert Formular + Warenkorb wieder.

Lager (eigener 3. Reiter "Geplant") und Fahrer (eigener 3. Reiter
"Geplant", neben "Lieferungen" und "Bauvorhaben") sehen dieselbe Liste
rein lesend (`geplantListHTML(false)`), nach Datum sortiert
(`geplantListHTML()`/`plannedDeliveryCardHTML()`). Nur der Chef sieht
zusätzlich einen "Löschen"-Knopf pro Eintrag
(`geplantListHTML(true)`, `data-action="delete-planned"`) direkt unter
dem Planungs-Formular.

### LKW-Logistik-Kalender (umgesetzt)

Eigener, neuer Kalender nur für Lieferungen/Abholungen mit Datum UND
Uhrzeit, verknüpft mit einem Bauvorhaben ("wann kann was geräumt
werden") – komplett getrennt vom bestehenden Mitarbeiter-Kalender
(eigener Datensatz `state.lkwEntries`/`state.lkwCounter`, eigene
Funktion `lkwKalenderPageHTML()`), der unverändert bleibt.

Erreichbar wie der Mitarbeiter-Kalender über einen eigenen Menüpunkt
("🚚 LKW-Kalender", `topNavHTML()`/`menuDropdownHTML()`,
`state.view='lkwkalender'`) – frei einsehbar auch ohne Anmeldung. Das
Menü zeigt je nach aktueller Seite die jeweils anderen Ansichten an
(z. B. auf dem Mitarbeiter-Kalender erscheinen "Zurück zur App" UND
"LKW-Kalender", damit man direkt zwischen beiden wechseln kann).

Bearbeiten (Termin mit Datum, Uhrzeit, Bauvorhaben-Auswahl und
optionaler Notiz anlegen/bearbeiten/löschen) ist wie beim Mitarbeiter-
Kalender nur mit dem Chef-Passwort freigeschaltet – beide Kalender
teilen sich dieselbe Freischalt-Variable (`state.calUnlocked`/
`calAskPw`), damit man das Passwort nicht zweimal eingeben muss, auch
wenn die Termine selbst (`state.lkwEntries`) ein komplett eigener
Datensatz sind. Ohne mindestens ein angelegtes Bauvorhaben zeigt das
Formular einen Hinweis statt der leeren Auswahl.

## Stil-Vorgaben

- Sprache der Oberfläche: Deutsch, einfache Handwerker-taugliche Wörter
- Design: Firmenfarben der Stahlrohrgerüstbau München GmbH (sg-muc.de):
  SG-Blau #0069B3 und Gelb #FFEE00 etwa 50/50 verteilt (blauer
  Login-Verlauf, gelbe Haupt-Knöpfe, gelbe Akzente in Header und Icons).
  Hell- und Dunkelmodus (siehe oben): helle Variante mit weißen runden
  Karten wie ursprünglich, Dunkelmodus in dunklem Marine-/Navy-Blau statt
  reinem Schwarz. Schriften: Space Grotesk (Überschriften) + Inter
  (Text). Firmenlogo `logo.png` (SGM, blau auf gelb) im Header und auf
  dem Login-Screen.
- Mobile-first: wird hauptsächlich am Handy benutzt (meta viewport!);
  am PC breiter und mehrspaltig (siehe „PC-Ansicht")
- Kein Amazon-/Shop-Feeling: Bestellschein-Charakter statt Warenkorb
- **Symbole statt Emojis** (Nutzerwunsch „seriöser“, gewählt: kräftige
  Linien, wichtige Symbole in kleinen farbigen Kacheln): Lucide-Icons
  (ISC-Lizenz), die benötigten Formen stehen direkt in der Datei
  (`SYM_ICONS`, nichts wird nachgeladen), `ic('truck')` liefert das SVG
  (Strichstärke 2.4, läuft in der Textfarbe mit). Emojis im Wörterbuch `T`
  und in Vorlagen bleiben im Code stehen; `render()` ruft danach
  `iconize(#app)` auf, das in allen Textstellen Emojis über die Tabelle
  `EMO` durch Symbole ersetzt (Attribute unberührt, in `<option>` werden sie
  entfernt). Neues Emoji → in `EMO` eintragen (+ Form in `SYM_ICONS`), sonst
  bleibt es als Emoji stehen. Push-Texte ohne Emojis (`stripEmo()` in
  `tlv()`). Reiter unten: `ico` = Symbol-Name. Info-Kacheln: `widgetTile({icon})`
  → farbige Kachel `.w-ico` in der Kachel-Farbe. Karten-Marker/Popups nutzen
  `ic()` direkt. Sprach-Flaggen bleiben.

## Projekt-Skills und Prüf-Skript

- `.claude/skills/teile-einpflegen/` – Ablauf für neue Teile/Systeme (Excel →
  `PARTS`/`SYSTEMS`/`CATEGORY_ORDER`), Artikel-IDs nie ändern.
- `.claude/skills/texte-uebersetzen/` – jeder sichtbare Text in allen 5
  Sprachen, Datum/Uhrzeit über `LOCALES[state.lang]`, Emojis in `EMO`.
- `node scripts/check-katalog.js` – prüft Wörterbuch (alle Sprachen,
  Platzhalter, benutzte `t()`-Schlüssel), Teile, `CATEGORY_ORDER`, doppelte
  Artikel-IDs, Symbole. Mit `--ids-speichern DATEI` / `--ids-vorher DATEI`
  meldet es verschwundene Artikel-IDs. Nur Node, keine Installation.

## Offen

- Reiter „Tribüne": keine Teile-Liste vorhanden (im Kunden-Excel nur
  Modul + System) – sobald sie kommt, als drittes System ergänzen.
- Echte Paketgrößen pro Teil (`pkg`) für die Lieferschein-Umrechnung.
