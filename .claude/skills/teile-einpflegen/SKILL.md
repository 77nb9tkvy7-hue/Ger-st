---
name: teile-einpflegen
description: Use when adding, changing or removing scaffolding parts, lengths, weights, package sizes (pkg) or a whole new Gerüst-System (e.g. Tribüne) in geruest-bestell-app.html – typically from a customer Excel "Materialauszug" – or when asked to rename a part type/ID.
---

# Teile einpflegen (PARTS / CATALOG / SYSTEMS)

## Grundsatz

Artikel-IDs (`partItemId(typ, variante)`, z. B. `stielMZ_200`, `spindel`) stehen in gespeicherten Bestellungen und im Lagerbestand bei Supabase. **Eine geänderte oder verschwundene ID = Bestand weg, alte Bestellungen passen nicht mehr.** Anzeigenamen dürfen sich ändern, IDs nie.

## Ablauf

1. **IDs vorher sichern:**
   `node scripts/check-katalog.js --ids-speichern <scratchpad>/ids-vorher.json`
2. **Excel lesen.** kg = Spalte „Einzeln“ × 100 (0,182 → 18.2). Kein Gewicht → `null`.
3. **Teile-Art schon da?** Gleicher Name, Längen UND Gewichte exakt gleich → nur das System in `systems` ergänzen (ein Artikel, Bestand zählt nicht doppelt). Sonst eigener Typ (z. B. Suffix `M`/`S` wie `konsole30M`).
4. **Zeile in `PARTS`:** `[typ, nameKey, icon, [systeme], [[länge|'varKey'|[länge,'varKey']|null, kg|null], …]]`. Icon aus der vorhandenen Icon-Tabelle (`frame`, `rail`, `plank`, `spindle` …).
5. **Neues System:** Eintrag in `SYSTEMS` (`{id, nameKey:'sys_<id>'}`) + Liste in `CATEGORY_ORDER` (Excel-Reihenfolge). Jeder neue Typ muss in `CATEGORY_ORDER` jedes seiner Systeme.
6. **Namen:** `part_<nameKey>`, `var_<key>`, `sys_<id>` in allen 5 Sprachen → **REQUIRED SUB-SKILL:** texte-uebersetzen.
7. **Prüfen:** `node scripts/check-katalog.js --ids-vorher <scratchpad>/ids-vorher.json` → muss `OK` melden, „Neue Artikel-IDs“ = genau die gewollten.
8. **Im Browser laden** (siehe texte-uebersetzen, Abschnitt „Im Browser prüfen“).
9. **CLAUDE.md nachziehen:** Abschnitte „Teile-Katalog“, „Teile leichter finden“ (Systeme) und „Offen“ (z. B. „Tribüne fehlt“ streichen); neue Datenformate dort beschreiben.

## Heikle Fälle

| Wunsch | Richtig |
|---|---|
| „Benenn `stielMZ` in … um“ | Nicht den Typ umbenennen. Nur Anzeigename (`part_…`) ändern; Grund dem Nutzer erklären. |
| Bestehendes Teil ohne Länge (`[null, kg]`, ID = Typ) bekommt Längen | Alte ID festhalten: optionales 3. Feld `[länge, kg, 'alteId']`, beim CATALOG-Aufbau `fixedId || partItemId(…)` (falls noch nicht vorhanden, so einbauen + Kommentar über `PARTS` + CLAUDE.md). Sonst wird aus `spindel` plötzlich `spindel_60`. |
| Teil fällt beim Kunden weg | Nicht löschen, solange Bestand/Bestellungen es nutzen könnten – nachfragen. |
| Paketgröße bekannt | `CATALOG.find(i=>i.id==='belag_300').pkg = 20;` unter dem CATALOG-Aufbau. |

## Häufige Fehler

- IDs nur „im Kopf“ geprüft statt mit `--ids-vorher` verglichen.
- Eigenes Wegwerf-Prüfskript geschrieben – `scripts/check-katalog.js` prüft bereits alles (bei Lücken dort ergänzen).
- CLAUDE.md nicht aktualisiert → nächste Sitzung hält die Tribüne für „fehlt noch“.
- Übersetzte Teile-Namen selbst erfunden, ohne es dem Nutzer zu sagen (Fachbegriffe gegenlesen lassen).
