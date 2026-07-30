# Gerüst-Bestell-App

## Was ist das?

Eine firmeninterne Web-App für einen Gerüstbau-Betrieb. Wenn auf der Baustelle
Gerüstteile fehlen, werden sie hier bestellt. Die Bestellung geht gleichzeitig
an das Lager und an den LKW-Fahrer.

Die komplette App ist EINE Datei: `geruest-bestell-app.html`
(HTML + CSS + JavaScript, keine Frameworks, kein Build-Schritt).

## Die 4 Rollen (Login-Screen: Name eingeben + Rolle wählen)

1. **Baustelle** (z. B. Max): Bestellt Teile über eine einfache Liste mit
   +/− Mengenwahl (bewusst KEIN Amazon-Warenkorb-Stil, das wurde extra
   entfernt). Sieht unten seine eigenen letzten Bestellungen mit Status.
2. **Lager** (z. B. Jochen): Zwei Reiter:
   - "Bestellungen": eingehende Bestellungen, Buttons "Bearbeitung starten"
     und "Bereit melden"
   - "Inventur": Bestand pro Teil mit +/− und "+10". Bei "Bereit melden"
     wird der Bestand automatisch abgezogen. Negativer Bestand wird rot
     als "Fehlt: X Stk" angezeigt.
3. **Fahrer** (z. B. Ludwig): Sieht was wohin muss und wann bestellt wurde.
   Kann erst handeln, wenn das Lager freigegeben hat.
   Buttons: "Verladen" → "Losfahren" → "Lieferung bestätigen".
4. **Chef**: Nur-Lese-Übersicht über alles: Statistik-Chips pro Status,
   alle Bestellungen, kompletter Lagerbestand. Diese Rolle ist mit einem
   Passwort geschützt (Konstante `CHEF_PASSWORD` am Anfang des
   `<script>`-Blocks). Hinweis: Da die Prüfung im Browser stattfindet und
   das Repo öffentlich ist, ist das nur ein einfacher Schutz gegen
   neugierige Mitarbeiter, keine echte Sicherheitsmaßnahme.

## Status-Ablauf einer Bestellung

Neu → In Bearbeitung → Bereit zur Abholung → Beladen → Unterwegs → Geliefert
(die ersten beiden Schritte macht das Lager, den Rest der Fahrer)

## Datenspeicherung – WICHTIG

Die App nutzt Supabase als geteilten Online-Speicher (kostenlose Stufe).
Alle Bestellungen und der Lagerbestand landen in einer Tabelle `app_state`
(eine Zeile mit `key = 'shopfloor-data-v2'` und einer `jsonb`-Spalte `value`,
die `{orders, counter, inventory}` enthält). Dadurch sehen alle Rollen
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

- Aktuell keine offenen Punkte. Mögliche spätere Verbesserungen: Realtime-
  Updates statt Polling (Supabase Realtime), Passwortschutz auch für
  Lager/Fahrer, Export der Bestellungen als PDF/CSV.

## Stil-Vorgaben

- Sprache der Oberfläche: Deutsch, einfache Handwerker-taugliche Wörter
- Design: Baustellen-Look (Asphalt-Dunkelgrau #22262A, Beton-Grau #D9D6CD,
  Warnorange #E85D04, Gelb #FFC300), Schriften: Oswald (Überschriften,
  Versalien) + Inter (Text)
- Mobile-first: wird hauptsächlich am Handy benutzt
- Kein Amazon-/Shop-Feeling: Bestellschein-Charakter statt Warenkorb
