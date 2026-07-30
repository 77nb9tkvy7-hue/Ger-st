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
   alle Bestellungen, kompletter Lagerbestand.

## Status-Ablauf einer Bestellung

Neu → In Bearbeitung → Bereit zur Abholung → Beladen → Unterwegs → Geliefert
(die ersten beiden Schritte macht das Lager, den Rest der Fahrer)

## Datenspeicherung – WICHTIG

Aktuell nutzt die App `window.storage` (get/set mit shared=true) – das ist
eine Claude-Artefakt-API und funktioniert NUR, wenn die Datei innerhalb von
Claude geöffnet wird. Außerhalb (z. B. GitHub Pages, lokaler Browser)
funktioniert das Teilen der Daten nicht.

## Geplante nächste Schritte

- Umbau der Datenspeicherung auf einen echten Online-Speicher
  (z. B. Firebase oder Supabase, kostenlose Stufe), damit die App über
  GitHub Pages von allen Mitarbeitern auf ihren eigenen Handys genutzt
  werden kann und alle dieselben Daten sehen.
- Beim Umbau: `loadShared()` und `saveShared()` in der Datei sind die
  einzigen zwei Funktionen, die den Speicher anfassen – nur die müssen
  ersetzt werden. Zusätzlich gibt es ein 4-Sekunden-Polling per setInterval.

## Stil-Vorgaben

- Sprache der Oberfläche: Deutsch, einfache Handwerker-taugliche Wörter
- Design: Baustellen-Look (Asphalt-Dunkelgrau #22262A, Beton-Grau #D9D6CD,
  Warnorange #E85D04, Gelb #FFC300), Schriften: Oswald (Überschriften,
  Versalien) + Inter (Text)
- Mobile-first: wird hauptsächlich am Handy benutzt
- Kein Amazon-/Shop-Feeling: Bestellschein-Charakter statt Warenkorb
