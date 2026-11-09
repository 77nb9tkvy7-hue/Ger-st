# UI-Überarbeitung Gerüst-Bestell-App – Design

Stand: 08.11.2026 · Ergebnis des Brainstormings im Chat · Umsetzung zuerst als
`demo.html` (Branch `ui-demo`), Original erst nach ausdrücklicher Freigabe.

## Ziel

Schneller und praktischer bedienbar für alle vier Rollen (alle gleich wichtig):
wenige Tipps pro Vorgang, die wichtigste Aktion jeder Rolle ohne Scrollen
sichtbar, große Touch-Ziele, gut lesbar bei Sonne. Sachlich/intern, kein
Shop-Look. Animationen 150–250 ms nur als Rückmeldung oder Statuswechsel.

## Feste Rahmenbedingungen

- Vanilla HTML/CSS/JS, eine Datei, keine Frameworks, kein Build-Schritt.
- Nichts entfernen: 4 Rollen, 6 Status-Stufen (Neu → In Bearbeitung → Bereit
  zur Abholung → Beladen → Unterwegs → Geliefert), Lagerabzug bei „Bereit
  melden“, „Fehlt: X Stk“, Nachlieferung, 4-s-Polling, Prüf-Schritt
  (Bestellschein-Entwurf) vor dem Abschicken, 5 Sprachen, Hell/Dunkel,
  Firmenfarben, Push, Standorte, Abholungen, Baupläne.
- Neue Texte in allen 5 Sprachblöcken des `T`-Wörterbuchs.
- Keine Einblend-Animation auf Karten/Listen (alle 4 s Neuzeichnen).

## Entscheidungen (aus dem Brainstorming)

| # | Thema | Entscheidung |
|---|---|---|
| 1 | Priorität | Alle Rollen gleich |
| 2 | Teile finden (Baustelle) | Suche ganz oben + Teile-Arten als große Zeilen; Antippen zeigt die Varianten (z. B. Konsole → 30 / 70) |
| 3 | Menge | Schnellwahl **5 · 10 · 20 · 50** + große +/− + eigener großer Ziffernblock (0–9, ⌫, OK) beim Antippen der Zahl. Handschuhe sind kein Muss (kann ausgezogen werden) → 48 px reichen |
| 4 | Erster Bildschirm | Handy: keine Kacheln, schmale antippbare Zahlen-Leiste, darunter sofort die Arbeit; Fahrer-„Mein Status“ einzeilig. PC (≥ 900 px): Kacheln bleiben |
| 5 | Fahrer-Schritte | Ein Knopf „Verladen & losfahren“ (Status geht über Beladen auf Unterwegs, beide Zeiten gespeichert) + Tour-Modus: mehrere „Bereit“-Bestellungen anhaken → „Alle verladen“ / „Alle losfahren“. Geliefert einzeln |
| 6 | Lager-Packen | Packliste schon bei „Neu“; ganze Zeile antippen = eingepackt (2. Tipp nimmt zurück); „Fehlt“ eigener Knopf ≥ 48 px; erster Haken setzt „In Bearbeitung“ (Zurücknehmen setzt nicht zurück); „Bereit melden“ groß, sobald jede Zeile erledigt ist |
| 7 | Chef | Eigener 5. Reiter **„LKWs“** (Karte + Fahrer-Status); „Übersicht“ = Zahlen-Leiste + Bestellungen |
| – | Demo-Weg | Kopie der echten App als `demo.html` mit eingebautem Beispieldaten-Modus und Rollen-Umschalter |

## Annahmen (vom Nutzer nicht widersprochen)

- Lesbarkeit: Grundschrift 15 px, kein Text unter 13 px, `--muted` mit
  Kontrast ≥ 4,5 : 1 auf `--bg` und `--card` (hell und dunkel), Status-
  Abzeichen kräftig (volle Farbe + weiße/dunkle Schrift statt Pastell).
- Touch-Ziele ≥ 48 px Höhe für alle Knöpfe im Arbeitsbereich (`main`, Fenster,
  Reiterleiste); Ausnahmen nur Fließtext-Links.
- Bestellkarten: Hauptknopf (nächster Schritt) groß und zuerst bedienbar;
  „Karte“ / „Lieferschein“ als zweite, ruhigere Zeile darunter.

## Bausteine

- **Demo-Modus** (nur `demo.html`): `DEMO = true`, `createDemoClient()` ersetzt
  Supabase (Daten in `localStorage` `demo-state`, startet mit Beispieldaten
  `DEMO_DATA`), Leiste oben mit Rollen-Umschalter + „Zurücksetzen“, kein
  Service Worker, kein Push, kein Chef-Passwort-Abfrage beim Umschalten.
- **Lesbarkeit/Touch**: neue Größen-Variablen im `:root`, `--muted` dunkler,
  `.status-badge` kräftig, Mindesthöhen.
- **Zahlen-Leiste** `statStripHTML(role)`: dieselben Zahlen wie `widgetsHTML`,
  am Handy statt der Kacheln; Chips springen wie Kacheln (`widget-go`).
- **Teile-Auswahl Baustelle**: Suche oben, Teile-Arten-Zeilen (≥ 52 px) mit
  Anzahl Varianten und Summe im Warenkorb; offene Art zeigt Varianten-Zeilen
  mit Menge. Häufig bestellt bleibt oben. System-Reiter bleiben.
- **Menge** `qtyControlHTML(it)` neu: −, Zahl (öffnet Ziffernblock), +, darunter
  Schnellwahl-Chips (nur bei geöffneter Variante / im Popup).
  Ziffernblock `numpadHTML()` als Fenster unten (`state.numpad = {id, val}`).
- **Status-Zeiten** `setOrderStatus(order, status)`: setzt `order.status` und
  `order.steps[status] = ISO-Zeit`; alle Status-Wechsel laufen darüber.
- **Lager-Packliste** bei „Neu“ + „In Bearbeitung“, Zeilen-Tipp.
- **Fahrer**: „Verladen & losfahren“, Tour-Auswahl `state.tourSel` (Set von
  IDs), Sammel-Aktionen; „Mein Status“ einzeilig.
- **Chef**: Reiter `lkws` → `chefPositionsHTML()` + Fahrer-Status.

## Prüfung

Kein TDD (reine Bedienung/Design). Prüfung im Browser per Playwright-Skript
`tools/demo-check.js` auf 390 × 844 (Handy) für alle 4 Rollen, dazu 1280 px
(Chef/PC) und Dunkelmodus: Screenshots + Messungen (Touch-Ziele, Schrift-
größen, Position der wichtigsten Aktion, Konsolenfehler) + Klick-Abläufe.

## Erfolgskriterien (Handy 390 × 844, Demo-Daten)

- Lager, Fahrer: erster Hauptknopf einer offenen Bestellung liegt oberhalb
  von 700 px (ohne Scrollen sichtbar, über der Reiterleiste).
- Baustelle: Suchfeld oberhalb von 300 px; „Konsole 70“ bestellen mit Menge
  20 in ≤ 4 Tipps bis „Bestellung prüfen“ (Art, Variante-Schnellwahl 20,
  Prüfen) ohne Tastatur.
- Keine bedienbaren Elemente im Arbeitsbereich unter 44 px Höhe; Ziel 48 px.
- Kein sichtbarer Text unter 13 px im Arbeitsbereich.
- Fahrer: eine Bestellung mit 1 Tipp von „Bereit“ auf „Unterwegs“, beide
  Zeiten in `order.steps`.
- Keine Konsolenfehler.
