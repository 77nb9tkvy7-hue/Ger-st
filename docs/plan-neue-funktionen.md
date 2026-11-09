# Neue Funktionen (Pakete 1–7) – Plan

> Umsetzung: Native (ein Durchgang in einer Sitzung, eine Gesamtprüfung am Ende) – Nutzerwunsch „nutzungslimit-freundlich“. Schritte mit `- [ ]`.

**Ziel:** Pakete 1–7 der Funktionsliste (ohne Kundenansicht) in `demo.html` (Branch `features-demo`, abgezweigt von `ui-demo`) mit Beispieldaten zeigen. `geruest-bestell-app.html` bleibt unverändert.

**Aufbau:** Alles in `demo.html` (eine Datei, Vanilla). Prüfungen als benannte Checks in `tools/demo-check.js` (vorhandene Technik). Server-Teile (SQL) werden nur als Datei vorbereitet, nicht ausgeführt. Selbst mitgelieferte Bausteine in `vendor/`.

## Entscheidungen (Brainstorming)

| Punkt | Entscheidung |
|---|---|
| Grundlage | auf `ui-demo` aufbauen |
| Umfang | Paket 1 (Mindestbestand, Materialliste je BV, Pause-Knopf, Export, defekte Teile), Paket 2 (nichts Persönliches ohne Anmeldung, selbst mitliefern), Paket 3 (Beweis-Fotos, Mängel melden, Unterschrift) |
| Defekte Teile | eigener Bestand „Defekt / Reparatur“, zurückbuchen („Repariert“) oder austragen („Verschrottet“) |
| Anmeldung | Name eintippen (Groß/klein egal), Handy merkt ihn; Server verrät nur „stimmt / stimmt nicht“, keine Liste |
| Kalender | beide nur nach Anmeldung |
| Fotos | Fotograf kann 5 Min. lang selbst löschen (auch Server-Regel); danach fest, Chef kann nur aus-/einblenden mit Vermerk |
| Unterschrift | nur auf Wunsch: Extra-Knopf auf der Karte, „Lieferung bestätigen“ bleibt 1 Tipp |
| Erweiterung | auch Pakete 4–7 in die Demo (Nutzerwunsch), außer Kundenansicht (bleibt offen) |
| Stunden | automatisch aus Ein-/Auschecken, Chef kann jeden Wert korrigieren (mit Vermerk); nur Chef sieht sie |
| Einchecken | jeder selbst + Kolonnenführer checkt sein Team mit einem Tipp; nur in GPS-Nähe zum BV (≤ 150 m, Genauigkeit ≤ 100 m) |
| Speicherdauer | Einchecken-Daten bis Abrechnung des BV + 12 Monate, dann automatisch gelöscht (Summen im Regiebericht bleiben); Wert einstellbar |
| Nicht in dieser Runde | Kundenansicht (offen), Tribünen + Paketgrößen (warten auf Daten), Sofort-Aktualisierung (Realtime – ohne echten Server in der Demo nicht vorführbar), vollständige Aufteilung von Bestellungen/Bestand auf eigene Server-Zeilen (in der Demo unsichtbar, eigener Umbau) |

## Global Constraints

- `geruest-bestell-app.html` und `sw.js` NICHT ändern (`git diff --quiet 49804e8 -- geruest-bestell-app.html sw.js` → Exit 0). SW-Änderungen kommen in die Port-Checkliste.
- Eine Datei, Vanilla, keine Frameworks. Nichts entfernen (Rollen, 6 Status, Lagerabzug, „Fehlt: X Stk“, Polling …).
- Neue Texte in ALLEN 5 Sprachblöcken von `T`. Farben nur über `:root`-Variablen. Touch ≥ 48 px, Text ≥ 13 px.
- Neue Datensatz-Felder in `stateToValue()` + `applyValue()`; Listen mit `id` zusätzlich in `RECORD_ARRAYS` samt Zähler.
- Mengen-Zähler (`defect`) wie `inventory` als +/− zusammenführen; `minStock` je Teil (spätere Änderung gewinnt).
- Fenster über `animateOverlayOnOpen()`, Polling pausiert solange Kamera-/Unterschrift-/Export-Fenster offen.
- Logik-Änderungen (Bestand, Defekt, Lösch-Frist) zuerst als fehlschlagende Prüfung, dann Code. Design: Prüfung im Browser.

## Review Focus

1. Zwei Handys buchen gleichzeitig Defekt/Reparatur → Summen addieren sich (Check `defekt` (c)).
2. Foto ohne Netz → klare Meldung „nicht gespeichert, bitte nochmal“, nichts halb gespeichert (Check `fotos` (d)).
3. Großes Handyfoto (≥ 4000 px) → verkleinert auf ≤ 1600 px, < 1 MB (Check `fotos` (b)).
4. Name mit anderer Groß-/Kleinschreibung oder Leerzeichen → Anmeldung klappt; falscher Name → nur „Name oder Passwort falsch“ (Check `login`).
5. Neuzeichnen alle 4 s während Unterschrift → Striche bleiben (Check `signatur` (b)).

---

### Task 1: Paket 1 – Bestand: Mindestbestand + Defekt-Bestand

**Daten:** `state.minStock = {itemId: n}`, `state.defect = {itemId: n}`; Abhol-Positionen bekommen `defekt` (Stück). Funktionen: `stockStatus(id) → 'ok'|'knapp'|'fehlt'`, `bookPickupIntoStock(pu)` (Bestand += qty−defekt, defect += defekt), `repairDefect(id,n)`, `scrapDefect(id,n)`.
- [ ] Check `defekt` schreiben: (a) Abholung mit 10 Stk, davon 3 defekt → „Im Lager“ → Bestand +7, Defekt +3; (b) Repariert 2 → Defekt 1, Bestand +2; Verschrottet 1 → Defekt 0, Bestand unverändert; (c) zwei Stände (Basis / zwei lokale je +2 Defekt) über `merge3` → Defekt +4. Check `stock`: Min 10 bei Bestand 4 → Inventur-Zeile „Knapp“, Lager-Leiste Chip „Knapp 1“. Laufen lassen → FAIL.
- [ ] Umsetzen: Abhol-Editor (Fahrer/Lager) je Position „davon defekt“ (Ziffernblock); Inventur-Zeile zeigt „Defekt: N“ mit „Repariert“/„Verschrottet“ (Ziffernblock für Menge) und „Min: N“ (antippen → Ziffernblock); Knapp-Warnung in Inventur (gelb), Lager-Zahlenleiste/Kachel „Knapp“; merge für `defect` als Delta, `minStock` je Schlüssel.
- [ ] `node tools/demo-check.js defekt` + `stock` → PASS; `baseline` → PASS. Commit „Demo: Mindestbestand und Defekt-Bestand“.

### Task 2: Paket 1 – Materialliste je BV, Pause-Knopf, Export

- [ ] `materialBalance(pid) → [{id, geliefert, zurueck, defekt, vorOrt}]` (Geliefertes aus Bestellungen „Geliefert“, Zurück aus Abholungen „Im Lager“). Chef-BV-Detail: Abschnitt „Material“ (Tabelle, „noch vor Ort“ fett) + „Drucken“ (vorhandener `#printArea`). Check `material`: BV mit 20 geliefert / 15 zurück (davon 2 defekt) → vorOrt 5.
- [ ] Pause: `DRIVER_STATUSES = ['lager','unterwegs','pause']`, `driverStatusMeta('pause')` (grau, Symbol `coffee`), drei Knöpfe in „Mein Status“, `autoDriverStatus` überschreibt „pause“ nie; Chef/Lager-Liste zeigt Pause. Check `pause`: setzen → Status pause; simulierter GPS-Wechsel → bleibt pause.
- [ ] Export (Chef, Übersicht, Knopf „Export“ → Fenster): Zeitraum-Chips „Dieser Monat / Letzter Monat / Alle“; „Excel (CSV)“ = Datei `bestellungen-<JJJJ-MM>.csv`, `;`-getrennt, UTF-8 mit BOM, Spalten `Nr;Datum;Bauvorhaben;Besteller;Status;Teil;Menge;Einheit;kg`, eine Zeile je Position; „PDF / Drucken“ = Liste in `#printArea`. Check `export`: CSV-Text über `exportCSV(range)` erzeugt, Kopfzeile + Zeilenzahl = Positionen im Zeitraum.
- [ ] Checks + `baseline` → PASS. Commit „Demo: Materialliste je BV, Pause-Knopf, Export“.

### Task 3: Paket 2 – Anmeldung ohne Namensliste, Kalender nur angemeldet

- [ ] Check `login`: Anmeldeseite hat KEINE Namensliste (kein `<select>` mit Namen), Eingabe „  max “ + richtiges Passwort → angemeldet als Max; „Mox“ → Meldung `warnLoginFail` („Name oder Passwort falsch“); nach Abmelden steht „Max“ vorausgefüllt (localStorage über `skey('geruest-login-name')`). Check `calendar-lock`: abgemeldet → Kalender und LKW-Kalender zeigen `calLoginFirst` + Anmelde-Knopf, keine Termine/Adressen im DOM.
- [ ] Umsetzen: Login-Formular Name (Textfeld, `autocomplete="username"`) + Passwort; RPC `login_lookup(p_name text) → integer|null` (Demo-Client beantwortet aus Mitarbeitern, trim + lower); `loadPublic()` lädt nichts Persönliches mehr. SQL in `supabase/security.sql` ergänzen (nicht ausführen): `login_lookup` (security definer, exakter Vergleich `lower(trim())`, gibt nur id), `public_info()` gibt `'{}'::jsonb` zurück.
- [ ] Checks + `baseline` → PASS. Commit „Demo: Anmeldung ohne Namensliste, Kalender nur angemeldet“.

### Task 4: Paket 2 – Schriften und Bausteine selbst mitliefern

- [ ] `vendor/` anlegen per `npm pack` (Registry ist erreichbar): `@fontsource/inter` + `@fontsource/space-grotesk` (woff2, latin + latin-ext für pl/sk/hr), `leaflet@1.9.4` (js, css, images), `@supabase/supabase-js@2` UMD (`dist/umd/supabase.js`, für die spätere Übernahme). Lizenz-Dateien mitnehmen.
- [ ] `demo.html`: `@font-face` auf `vendor/fonts/…`, Leaflet aus `vendor/leaflet/`. Kartenkacheln bleiben extern (OpenStreetMap) – Hinweis in der Port-Checkliste, ebenso `sw.js`-Cacheliste + `VERSION` hochzählen.
- [ ] Check `vendor`: beim Laden aller Rollen KEINE Anfragen an fonts.googleapis/gstatic/cdnjs/jsdelivr (Kacheln ausgenommen); Schrift „Inter“ ist geladen (`document.fonts.check`). Commit „Demo: Schriften und Bausteine selbst mitgeliefert“.

### Task 5: Paket 3 – Beweis-Fotos

**Daten:** `state.fotos = [{id, projekt, anlass, by, ts, lat, lon, acc, path, w, h, hidden:null|{by,ts}}]`, Zähler `fotoCounter`. Anlässe: `abladen, uebergabe, vor_abbau, schaden, vorher, nachher, mangel`. Bucket `fotos`, Pfad `bv<ID>/<JJJJ-MM>/<zufall>.jpg`. Funktionen: `takePhoto(projekt, anlass) → Promise<foto|null>`, `stampImage(file, lines) → Blob` (≤ 1600 px lange Seite, JPEG 0.8, Stempel-Band unten: Datum Uhrzeit · Name · BV · GPS ±m), `canDeleteFoto(f) → bool` (eigenes Foto, < 5 Min.).
- [ ] Check `fotos` zuerst: (a) Foto aufnehmen (Datei-Eingabe mit Testbild) → erscheint im BV unter „Fotos“ mit Anlass, Name, Zeit; (b) 4000×3000-Testbild → gespeichert ≤ 1600 px, < 1 MB; (c) eigenes Foto löschen nach 1 Min. geht, nach 6 Min. (Uhr vorstellen) nicht mehr; Chef blendet aus → grau „ausgeblendet von …“, wieder einblenden geht; Baustelle sieht keinen Ausblenden-Knopf; (d) Upload-Fehler (Speicher wirft) → Meldung `fotoFail`, kein Eintrag in `state.fotos`. → FAIL.
- [ ] Umsetzen: Knopf „Foto“ (Kamera-Symbol) im BV-Bereich jeder Rolle (Baustelle unter BV-Auswahl, Fahrer/Lager BV-Karte, Chef BV-Detail) → Anlass-Chips → `<input type=file accept="image/*" capture="environment">`; Foto-Raster (Vorschaubilder) mit Anlass-Filter, Antippen = Großansicht (Fenster). Mini-Knopf „Foto“ auf Fahrer-Karten „Unterwegs“ (Anlass `abladen`). Demo-Client: `storage.from('fotos')` mit `upload/createSignedUrls/remove` in IndexedDB (Daten-URL + `created_at`), `remove` lehnt nach 5 Min. ab. SQL (Datei): Bucket `fotos` privat, Policies insert für Angemeldete mit Rolle, kein update, delete nur `owner = auth.uid() and created_at > now() - interval '5 minutes'`.
- [ ] `fotos` + `baseline` → PASS. Commit „Demo: Beweis-Fotos“.

### Task 6: Paket 3 – Mängel melden + Unterschrift

- [ ] Mängel: `state.maengel = [{id, projekt, fotoId, text, by, ts, status:'offen'|'erledigt', doneBy, doneTs}]`, Zähler `mangelCounter`. Knopf „Mangel melden“ (Baustelle unter BV-Auswahl, Fahrer/Lager auf BV-Karte): Foto (Anlass `mangel`) + kurzer Text → Push an Chef (`nMangelT/nMangelB`). Chef: Übersicht-Abschnitt „Mängel offen N“ + Zahlen-Leiste/Kachel, BV-Detail; Knopf „Erledigt“. Check `maengel`: melden → Chef sieht 1 offen; erledigt → 0 offen.
- [ ] Unterschrift: Mini-Knopf „Unterschrift“ auf Fahrer-Karten „Unterwegs“/„Geliefert“ → Fenster mit Zeichenfläche (≥ 260 px hoch, Pointer-Events, `touch-action:none`), Feld „Name Empfänger“, „Neu“, „Speichern“; PNG in Bucket `fotos` (`bv<ID>/unterschrift-<Bestellnr>-<zufall>.png`); `order.signatur = {path, name, ts, by}`; Lieferschein-Druck zeigt Unterschrift + Name + Zeit. Polling pausiert solange offen. Check `signatur`: (a) Striche zeichnen, Speichern → `order.signatur` gesetzt, Lieferschein enthält `<img>`; (b) 5 s warten vor Speichern → Striche noch da.
- [ ] Checks + `baseline` → PASS. Commit „Demo: Mängel melden, Unterschrift“.

### Task 7: Paket 4 (Teil) – geschützte Zeilen für Personen-Daten

Nur was die neuen Funktionen brauchen: Einchecken, Stunden und Unterweisungs-Bestätigungen liegen NICHT im großen Datensatz, sondern in eigenen Zeilen wie heute die LKW-Standorte: `app_state.key = 'zeit:<JJJJ-MM>'` (Einchecken + Stunden eines Monats, lesen/schreiben nur Chef; Mitarbeiter dürfen nur eigene Einträge anhängen) und `'unterweisung:<id>'`. Funktionen: `loadProtected(prefix) → Promise<object[]>`, `appendProtected(key, entry) → Promise<bool>`.
- [ ] Check `schutz` zuerst: als Baustelle/Fahrer/Lager angemeldet liefert `loadProtected('zeit:')` nur eigene Einträge (Demo-Client simuliert die Regeln anhand `app_metadata.roles`/`name`), als Chef alle; Baustelle kann fremden Eintrag nicht ändern. → FAIL.
- [ ] Umsetzen (Demo-Client + App-Funktionen) und SQL in `supabase/security.sql` (Datei, nicht ausführen): RLS für `zeit:%` (insert eigener Eintrag über Funktion `zeit_append(entry jsonb)` security definer; select/update nur `jwt_is_chef()`), Lösch-Funktion `zeit_cleanup()` + pg_cron-Vorschlag. Commit „Demo: geschützte Zeilen für Zeiterfassung“.

### Task 8: Paket 5 – Einchecken, Stunden, Regiebericht, Monatsübersicht

**Daten (Zeile `zeit:<JJJJ-MM>`):** `{checkins:[{id, person, projekt, in, out, inPos:{lat,lon,acc}, outPos, by, korr:null|{in,out,by,ts,grund}}]}`. Funktionen: `nearestProject(pos) → {p, dist}|null` (≤ 150 m), `checkIn(persons[], projekt)`, `checkOut(persons[])`, `hoursOf(c) → Stunden (korrigiert falls vorhanden, auf 0,25 gerundet)`.
- [ ] Check `zeit` zuerst: (a) Position 80 m vom BV → „Einchecken“ möglich; 400 m → Hinweis `ciTooFar` mit Entfernung, kein Eintrag; Genauigkeit 250 m → `ciBadGps`; (b) Kolonnenführer (neues Mitarbeiter-Feld `kolonne:[Namen]`) checkt 3 Personen mit einem Tipp ein und aus → 3 Einträge; (c) 07:00–15:30 → 8,5 h; Chef korrigiert auf 8,0 mit Grund → Kalender-Spalte zeigt 8,0 und „korrigiert“; (d) Baustelle/Fahrer/Lager sehen im Kalender keine Stunden-Spalte und keine Stunden im DOM. → FAIL.
- [ ] Umsetzen: Baustelle oben großer Knopf „Einchecken – BV 101“ (bzw. „Auschecken · seit 07:02“), Kolonnenführer mit Personen-Chips; vor dem ERSTEN Einchecken einmalig Datenschutzhinweis (Text als Platzhalter, vom Chef im Reiter Personal hinterlegbar, Feld `state.ciHinweis`) mit „Verstanden“. Chef: Kalender-Spalte „Stunden“ je Person/Tag; Reiter Personal „Kolonnen“ (Mitglieder wählen); BV-Detail „Regiebericht“ (Datum, Person, von–bis, Stunden, Summe; Drucken über `#printArea`); Übersicht/Reiter „Monat“: Monatsübersicht je BV (Material aus `materialBalance`, Lieferungen, Stunden-Summe) zum Drucken. Speicherdauer: BV-Feld `abgerechnetAm`; `zeit_cleanup` löscht Einchecken-Daten älter als Abrechnung + 12 Monate (Demo: Knopf im Personal „Alte Daten löschen“ zeigt Anzahl).
- [ ] Checks + `baseline` → PASS. Commit „Demo: Einchecken, Stunden, Regiebericht, Monatsübersicht“.

### Task 9: Paket 6 – Prüfprotokoll + QR-Freigabe, Unterweisungen

- [ ] Prüfprotokoll: BV-Feld `pruefungen = [{id, datum, by, punkte:{<key>:true|false}, fotoIds[], ergebnis:'frei'|'gesperrt', bemerkung}]`; Prüfpunkte als feste Liste (Schlüssel `pp_*` in 5 Sprachen: Verankerung, Beläge, Seitenschutz, Aufstiege, Fußplatten/Spindeln, Kennzeichnung); mindestens 1 Foto Pflicht; Ergebnis „freigegeben“/„gesperrt“. QR: `vendor/qrcode-generator` (npm `qrcode-generator`, MIT) erzeugt QR für Link `freigabe.html?t=<token>` (BV-Feld `freigabeToken`, zufällig); `freigabe.html` (eigene kleine Datei, keine Anmeldung) zeigt nur „Gerüst BV 101 – freigegeben am … / gesperrt“ über SQL-Funktion `freigabe_info(token)` (Datei); Demo: liest aus `demo-state`. Druck: Aushang A4 mit QR + Status.
- [ ] Unterweisungen: Chef legt Thema + Text an (`state.unterweisungen=[{id, titel, text, ab, by}]`, Zähler); jeder Mitarbeiter sieht offene Unterweisungen als Karte oben, liest, tippt „Gelesen und verstanden“ → Bestätigung in geschützter Zeile `unterweisung:<id>` (Name, Zeit). Chef sieht je Unterweisung „bestätigt 5 / 8“ mit Namen.
- [ ] Check `pruefung`: Protokoll ohne Foto → Speichern gesperrt; mit Foto → „frei“, QR-Bild vorhanden, `freigabe.html?t=…` zeigt Datum ohne Namen. Check `unterweisung`: neue Unterweisung → Fahrer sieht Karte, bestätigt → Chef „1 / n“. Commit „Demo: Prüfprotokoll mit QR-Freigabe, Unterweisungen“.

### Task 10: Paket 7 – Reihenfolge + Fahrtenliste

- [ ] Reihenfolge: im Tour-Modus Knopf „Reihenfolge vorschlagen“ → `orderStops(start, stops[]) → stops[]` über OSRM `trip`-Dienst (`ROUTE_URL`-Host, `source=first`), Rückfall ohne Antwort: nächster-Nachbar nach Luftlinie; Karten werden in dieser Reihenfolge nummeriert („1.“, „2.“ …), Knopf „Route in Google Maps“ mit allen Zwischenzielen. Check `reihenfolge`: OSRM abgebrochen → Rückfall liefert für 3 bekannte Punkte die erwartete Folge.
- [ ] Fahrtenliste (kein steuerliches Fahrtenbuch – so beschriftet): Chef/Fahrer, Monat wählbar; je ausgelieferter Bestellung Datum, Fahrer, von Lager → BV, km (OSRM-Route Lager→BV, zwischengespeichert je BV; ohne Antwort Luftlinie × 1,3 mit „ca.“); CSV + Drucken. Keine GPS-Spuren (bleibt bei „nur letzter Standort“). Check `fahrten`: 2 gelieferte Bestellungen im Monat → 2 Zeilen, km > 0. Commit „Demo: Reihenfolge vorschlagen, Fahrtenliste“.

### Task 11: Abschluss

- [ ] `DEMO_DATA` ergänzen (Min-Werte, ein Defekt-Bestand, eine Abholung mit defekten Teilen, 3 Beispiel-Fotos, 1 offener Mangel, Einchecken-Daten der letzten 5 Tage für 3 Personen, eine Kolonne, 1 Prüfprotokoll, 1 Unterweisung), `DEMO_VERSION` hochzählen. Port-Checkliste `docs/superpowers/plans/2026-11-08-ui-port-checkliste.md` ergänzen (SQL ausführen, `sw.js` Cacheliste, Bucket `fotos`).
- [ ] `node tools/demo-check.js all` (inkl. neuer Checks) → alle PASS; Screenshots 390 px je Rolle ansehen.
- [ ] Eine Gesamtprüfung (ein Prüfer, mittleres Modell) über den Branch; gefundene wichtige Fehler in einer Runde beheben.
- [ ] Commit + Push `features-demo`; Übersicht „Punkt / was umgesetzt / wo in der App“ für den Nutzer.
