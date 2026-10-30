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
3. Rolle **Chef** verlangt ZUSÄTZLICH das Chef-Passwort (`CHEF_PASSWORD`,
   ausdrücklicher Wunsch: doppelte Sicherung). Wer mehrere Rollen hat,
   sieht im Header "Rolle wechseln" (`switch-role`, ohne erneutes
   Passwort; Chef fragt trotzdem wieder das Chef-Passwort ab).

Die Mitarbeiterliste liegt NICHT mehr im Code, sondern im gemeinsamen
Supabase-Datensatz (`state.employees`, Einträge `{id, name, pw, roles[]}`,
Zähler `state.empCounter`) und wird vom Chef im Reiter **"Personal"**
gepflegt (`personalHTML()`: Mitarbeiter anlegen/entfernen, Rollen per
Chip an-/abwählen – mehrere pro Person möglich –, Passwort neu setzen).
Schutz: der letzte Chef kann weder entfernt noch seine Chef-Rolle
abgewählt werden (`persWarnLastChef`). `DEFAULT_EMPLOYEES` ist nur die
Start-Befüllung beim allerersten Laden (alte PINs als Start-Passwörter);
`ROLES`/`ROLE_META` definieren die vier Rollen. Hinweis: Passwörter liegen
im Klartext im Datensatz – gleiches Schutzniveau wie `CHEF_PASSWORD`,
kein echter Sicherheitsmechanismus (Repo + Anon-Key sind öffentlich).

Die Anmeldung wird per `localStorage` auf dem Gerät gespeichert und gilt,
bis man sich ausdrücklich abmeldet – KEIN Ablauf am Tagesende mehr
(Nutzerwunsch; `saveSession`/`restoreSession`/`clearSession`). „Abmelden"
löscht sie.
`enforceSession()` (nach jedem `loadShared()`) wirft automatisch raus,
wenn der Chef die Person oder ihre aktuelle Rolle inzwischen entfernt hat.

## Menü / Kalender (ohne Anmeldung erreichbar)

Oben links sitzt das SGM-Logo, oben rechts ein Menü-Knopf (☰) – beides ist
auch VOR der Anmeldung sichtbar (Funktion `topNavHTML()`). Im Menü gibt es
die Punkte „Kalender" (`state.view = 'calendar'`) und „LKW-Kalender"
(`state.view = 'lkwkalender'`, siehe eigenen Abschnitt unten). Der Kalender
zeigt, wer wann wo im Einsatz sein soll, und ist bewusst frei einsehbar
(kein Login nötig). Einträge bearbeiten/anlegen/löschen kann nur, wer das
Chef-Passwort eingibt (gleiche Konstante `CHEF_PASSWORD`, eigene Freischalt-
Abfrage `state.calUnlocked`, gilt nur für die aktuelle Seitenladung, nicht
dauerhaft gespeichert). Die Kalender-Daten (`calendarEntries`,
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
(quadratische Kacheln, generiert aus `logo.png`) und einen minimalen
`sw.js` (Service Worker, nur zur Erfüllung der Browser-Installierbarkeits-
Kriterien, kein Offline-Cache) ein. Dadurch bieten Handy-Browser „Zum
Startbildschirm hinzufügen" an; die App startet dann ohne Adressleiste wie
eine eigenständige App (`display: standalone` in der Manifest-Datei).

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
2. **Lager** (z. B. Jochen): Drei Reiter:
   - "Bestellungen": Fahrer-Status-Liste, dann eingehende Bestellungen
     mit Buttons "Bearbeitung starten" und "Bereit melden"
   - "Geplant": vom Chef geplante Lieferungen (nur lesen)
   - "Inventur": Bestand pro Teil mit +/− und "+10". Bei "Bereit melden"
     wird der Bestand automatisch abgezogen. Negativer Bestand wird rot
     als "Fehlt: X Stk" angezeigt.
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
   bestellt/unterwegs ist, als fertig markieren/reaktivieren; Bereich
   „Fahrer" mit „Hierher schicken"/„Zurückholen" pro Fahrer (setzt dessen
   `driverStatus` auf unterwegs → dieses BV, `by` = Chef-Name); „Lieferung
   hinzufügen" (gleiches Planungs-Formular `planFormHTML(projektId)`, ohne
   BV-Auswahl) und die geplanten Lieferungen dieses BV. Am PC stehen
   Karte/Fahrer links und das Lieferungs-Formular rechts (`.detail-grid`).
   „Planen": Lieferungen im Voraus planen. „Personal": Mitarbeiter,
   Rollen und Passwörter verwalten (siehe „Anmeldung"). Die Rolle ist
   zusätzlich zum eigenen Passwort mit dem Chef-Passwort geschützt
   (Konstante `CHEF_PASSWORD` am Anfang des `<script>`-Blocks). Hinweis:
   Prüfung läuft im Browser und das Repo ist öffentlich – einfacher
   Schutz, keine echte Sicherheitsmaßnahme.

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

## PC-Ansicht (Chef im Büro)

Mobile-first bleibt: am Handy eine Spalte wie bisher. Ab 900 px wird
`main` breiter (1060 px), Kartenlisten (`.card-grid`, `.proj-list`)
zweispaltig, Widgets vierspaltig; ab 1280 px `main` 1320 px, Karten
dreispaltig und die Bauvorhaben-Detailansicht zweispaltig
(`.detail-grid`). Neue Kartenlisten immer in `<div class="card-grid">`
packen, damit sie am PC mitwachsen.

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
calCounter, driverStatus, plannedDeliveries, planCounter, lkwEntries,
lkwCounter, employees, empCounter}` enthält). Dadurch sehen alle Rollen
(egal auf welchem Handy, auch über GitHub Pages) dieselben Daten.

Die einzigen zwei Funktionen, die den Speicher anfassen, sind `loadShared()`
und `saveShared()` – dort steht auch, welche Supabase-Tabelle/Spalten
erwartet werden. Zusätzlich gibt es ein 4-Sekunden-Polling per
`setInterval`, das `loadShared()` aufruft, damit alle Rollen neue
Bestellungen/Status ohne manuellen Reload sehen.

Die Zugangsdaten (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) stehen am Anfang des
`<script>`-Blocks in `geruest-bestell-app.html` und müssen pro Firma einmal
mit den eigenen Werten aus dem Supabase-Dashboard ersetzt werden.

## Geplante nächste Schritte

- Baupläne pro Bauvorhaben hochladen (braucht Supabase Storage /
  Datei-Bucket – ausdrücklicher Wunsch des Nutzers für später)
- Kalender-Bearbeitung: aktuell nur über das (gemeinsame) Chef-Passwort
  freischaltbar. Nutzer möchte, dass auch andere/mehrere Mitarbeiter
  Termine eintragen können, nicht nur "Chef" – noch offen, wie genau
  (eigene Berechtigung pro Person? weiteres Passwort?).
  Nur eine Idee bisher: eine Extra-Spalte "Stunden" im Kalender, die nur
  Chefin (und Chef, der sieht sowieso alles) sehen kann, andere Rollen/
  Mitarbeiter nicht – noch nicht umgesetzt, nur besprochen.
- Weitere Ideen: Realtime-Updates statt Polling (Supabase Realtime),
  Push-Benachrichtigungen, Export der Bestellungen als PDF/CSV.

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

## Offen

- Reiter „Tribüne": keine Teile-Liste vorhanden (im Kunden-Excel nur
  Modul + System) – sobald sie kommt, als drittes System ergänzen.
- Echte Paketgrößen pro Teil (`pkg`) für die Lieferschein-Umrechnung.
