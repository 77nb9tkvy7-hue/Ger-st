# Gerüst-Bestell-App

## Was ist das?

Eine firmeninterne Web-App für einen Gerüstbau-Betrieb. Wenn auf der Baustelle
Gerüstteile fehlen, werden sie hier bestellt. Die Bestellung geht gleichzeitig
an das Lager und an den LKW-Fahrer.

Die komplette App ist EINE Datei: `geruest-bestell-app.html`
(HTML + CSS + JavaScript, keine Frameworks, kein Build-Schritt).

## Anmeldung

Nur festangestellte Mitarbeiter können sich anmelden: Name aus einer
festen Liste wählen, dann Rolle wählen. Die Liste steht in der Konstante
`EMPLOYEES` am Anfang des `<script>`-Blocks (Name + PIN pro Person, neue
Mitarbeiter = neue Zeile). Die PIN-Prüfung ist auf Kundenwunsch aktuell
DEAKTIVIERT (nur der Chef braucht sein Passwort); die PINs bleiben im
Code für eine spätere Aktivierung stehen.
Die Anmeldung wird per `localStorage` auf dem Gerät gespeichert und gilt
bis zum Ende des Kalendertages – morgens einmal anmelden reicht
(`saveSession`/`restoreSession`/`clearSession`). „Abmelden" löscht sie.

## Menü / Kalender (ohne Anmeldung erreichbar)

Oben links sitzt das SGM-Logo, oben rechts ein Menü-Knopf (☰) – beides ist
auch VOR der Anmeldung sichtbar (Funktion `topNavHTML()`). Im Menü gibt es
aktuell nur den Punkt „Kalender" (`state.view = 'calendar'`). Der Kalender
zeigt, wer wann wo im Einsatz sein soll, und ist bewusst frei einsehbar
(kein Login nötig). Einträge bearbeiten/anlegen/löschen kann nur, wer das
Chef-Passwort eingibt (gleiche Konstante `CHEF_PASSWORD`, eigene Freischalt-
Abfrage `state.calUnlocked`, gilt nur für die aktuelle Seitenladung, nicht
dauerhaft gespeichert). Die Kalender-Daten (`calendarEntries`,
`calCounter`) liegen im selben Supabase-Datensatz wie alles andere.

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
2. **Lager** (z. B. Jochen): Zwei Reiter:
   - "Bestellungen": eingehende Bestellungen, Buttons "Bearbeitung starten"
     und "Bereit melden"
   - "Inventur": Bestand pro Teil mit +/− und "+10". Bei "Bereit melden"
     wird der Bestand automatisch abgezogen. Negativer Bestand wird rot
     als "Fehlt: X Stk" angezeigt.
3. **Fahrer** (z. B. Ludwig): Sieht was wohin muss und wann bestellt wurde.
   Kann erst handeln, wenn das Lager freigegeben hat.
   Buttons: "Verladen" → "Losfahren" → "Lieferung bestätigen".
   Jede Bestellkarte (bei allen Rollen) hat einen Link „In Google Maps
   öffnen": mit GPS-Koordinaten, falls vorhanden, sonst per Adress-Suche.
4. **Chef**: Zwei Reiter. „Übersicht": Statistik-Chips pro Status, alle
   Bestellungen, kompletter Lagerbestand (nur lesen). „Bauvorhaben":
   Bauvorhaben anlegen (Name + Adresse, automatische Nummer „BV 101"
   aufwärts) und wie ein Ordner pro Bauvorhaben sehen, welche Teile
   schon geliefert „vor Ort" sind, was bestellt/unterwegs ist und welche
   Bestellungen dazugehören; Bauvorhaben können als fertig markiert und
   reaktiviert werden. Die Rolle ist mit einem Passwort geschützt
   (Konstante `CHEF_PASSWORD` am Anfang des `<script>`-Blocks). Hinweis:
   Prüfung läuft im Browser und das Repo ist öffentlich – einfacher
   Schutz, keine echte Sicherheitsmaßnahme.

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
die `{orders, counter, inventory, projects, projektCounter}` enthält). Dadurch sehen alle Rollen
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

- PIN-Prüfung beim Anmelden wieder aktivieren (Code ist vorhanden,
  aktuell bewusst deaktiviert)
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
  ab 900 px Breite zweispaltige Teile-Liste/Inventur für PC
- Kein Amazon-/Shop-Feeling: Bestellschein-Charakter statt Warenkorb
