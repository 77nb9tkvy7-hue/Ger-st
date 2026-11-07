---
name: texte-uebersetzen
description: Use when adding or changing any user-visible text, button, label, hint, push notification, status name or emoji in geruest-bestell-app.html – anything a Baustelle/Lager/Fahrer/Chef user reads on screen – including part/system names.
---

# Texte und Übersetzungen (T-Wörterbuch, 5 Sprachen)

## Grundsatz

Die App läuft in de, pl, sk, hr, en (`LANGS`, genau diese Reihenfolge). Ein Text, der nur auf Deutsch existiert, erscheint beim polnischen Fahrer auf Deutsch.

## Regeln

| Was | So |
|---|---|
| Sichtbarer Text | Immer `t('schluessel', {platzhalter})`, nie fest ins HTML/JS. |
| Neuer Schlüssel | In **allen 5** Blöcken von `T` (`de:{…}`, `pl:{…}`, `sk:{…}`, `hr:{…}`, `en:{…}`), gleicher Name, gleiche Platzhalter (`{n}`, `{zeit}` …). |
| Wortwahl | Einfache Handwerker-Wörter, kurz (Knöpfe am Handy sind schmal). |
| Gespeicherte Werte | Bleiben deutsch/intern (`'In Bearbeitung'`, `'lager'`); nur die Anzeige übersetzen (`statusLabel()`/`slug()`-Muster). |
| Datum/Uhrzeit/Zahlen | Mit der Sprache formatieren: `LOCALES[state.lang]` (z. B. `toLocaleTimeString(LOCALES[state.lang], …)`), nie fest `'de-DE'`. |
| Neues Emoji im Text | In `EMO` eintragen → Lucide-Form in `SYM_ICONS` (Strich-SVG, ISC). Sonst bleibt es als buntes Emoji stehen. |
| Push-Texte (`n…T`/`n…B`) | Gehen über `tlv()`/`stripEmo()` – keine Emojis nötig. |
| Selbst übersetzt (pl/sk/hr) | Dem Nutzer sagen, welche Texte gegengelesen werden sollten. |

## Prüfen

1. `node scripts/check-katalog.js` → muss `OK` melden. Meldet fehlende Sprachen, ungleiche Platzhalter, `t('x')` ohne Wörterbuch-Eintrag, Emojis ohne `EMO`-Eintrag.
2. **Im Browser prüfen** (Playwright ist in Cloud-Sitzungen vorinstalliert: `require('playwright')` geht aus jedem Ordner; NICHT `playwright install`):
   ```js
   const {chromium} = require('playwright');
   const b = await chromium.launch();
   const ctx = await b.newContext({serviceWorkers:'block'});
   const p = await ctx.newPage(); const errs = [];
   p.on('pageerror', e => errs.push(e.message));
   await p.goto('file://' + process.cwd() + '/geruest-bestell-app.html');
   ```
   Ohne Netz ist „Supabase-Bibliothek nicht geladen“ normal; jeder andere Fehler nicht. Für Ansichten hinter der Anmeldung Supabase per `page.route` nachbauen (siehe CLAUDE.md „PWA“). Neue Knöpfe in allen 5 Sprachen bei 390 px Breite ansehen (Screenshot) – lange Texte brechen um.
3. Neue Funktion/Begriff → CLAUDE.md kurz ergänzen.

## Häufige Fehler

- Nur `de` ergänzt, „die anderen später“ → Absturz nicht, aber gemischte Sprachen.
- Uhrzeit mit fest `'de-DE'` formatiert.
- Emoji ohne `EMO`-Eintrag → einziges buntes Emoji zwischen Strich-Symbolen.
- Nicht im Browser angesehen, weil Playwright angeblich fehlt.
