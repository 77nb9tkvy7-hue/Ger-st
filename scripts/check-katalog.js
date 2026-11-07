#!/usr/bin/env node
// Prüft Teile-Katalog und Übersetzungen in geruest-bestell-app.html.
// Aufruf:  node scripts/check-katalog.js
// Ergebnis: "OK" (Exit 0) oder eine Liste der Fehler (Exit 1).
// Braucht nur Node, keine Installation, keinen Browser.
//
// Geprüft wird:
//  - jeder Schlüssel im Wörterbuch T steht in ALLEN Sprachen aus LANGS
//  - Platzhalter wie {n} sind in allen Sprachen gleich
//  - jeder im Code benutzte t('…')-Schlüssel steht im Wörterbuch
//  - part_/var_/sys_-Namen aller Teile und Systeme stehen im Wörterbuch
//  - keine doppelte Artikel-ID im CATALOG, keine doppelte Typ-ID in PARTS
//  - jede Teile-Art steht in CATEGORY_ORDER jedes ihrer Systeme (und umgekehrt)
//  - Systeme in PARTS gibt es in SYSTEMS; Gewichte sind Zahlen > 0 oder null
//  - jedes Symbol in EMO gibt es in SYM_ICONS; Emojis in Texten ohne EMO-Eintrag
//  - optional: Artikel-IDs gegen eine gespeicherte Liste (--ids-vorher DATEI)
//
// Artikel-IDs dürfen sich NIE ändern. Vor großen Teile-Änderungen:
//   node scripts/check-katalog.js --ids-speichern /tmp/ids.json
// danach:
//   node scripts/check-katalog.js --ids-vorher /tmp/ids.json
// meldet jede verschwundene Artikel-ID als Fehler.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'geruest-bestell-app.html');
const src = fs.readFileSync(file, 'utf8');

function slice(startMarker, endMarker){
  const a = src.indexOf(startMarker);
  if(a < 0) throw new Error('Nicht gefunden: ' + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if(b < 0) throw new Error('Ende nicht gefunden nach: ' + startMarker);
  return src.slice(a, b);
}

const code = [
  slice('const LANGS = [', 'const LANG_KEY'),
  slice('const T = {', '\nfunction t('),
  slice('const SYSTEMS = [', 'function inSystem('),
  slice('const SYM_ICONS = {', 'function ic('),
  slice('const EMO = {', 'const EMO_RE'),
].join('\n') + '\n;({LANGS, T, SYSTEMS, PARTS, CATEGORY_ORDER, CATALOG, SYM_ICONS, EMO});';

const {LANGS, T, SYSTEMS, PARTS, CATEGORY_ORDER, CATALOG, SYM_ICONS, EMO} = vm.runInNewContext(code, {});

const errors = [];
const warnings = [];
const langs = LANGS.map(l=>l.code);

// --- Wörterbuch ---------------------------------------------------------
const allKeys = new Set();
langs.forEach(l=>{
  if(!T[l]) errors.push(`Sprache "${l}" fehlt komplett im Wörterbuch T`);
  else Object.keys(T[l]).forEach(k=>allKeys.add(k));
});
Object.keys(T).forEach(l=>{ if(!langs.includes(l)) errors.push(`T hat Sprache "${l}", die nicht in LANGS steht`); });
const placeholders = s => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
allKeys.forEach(k=>{
  const fehlt = langs.filter(l=>T[l] && !(k in T[l]));
  if(fehlt.length) errors.push(`Übersetzung fehlt: "${k}" in ${fehlt.join(', ')}`);
  const ref = T.de && k in T.de ? placeholders(T.de[k]) : null;
  if(ref !== null) langs.forEach(l=>{
    if(T[l] && k in T[l] && placeholders(T[l][k]) !== ref)
      errors.push(`Platzhalter passen nicht: "${k}" in ${l} hat [${placeholders(T[l][k])}], de hat [${ref}]`);
  });
});

// im Code benutzte Schlüssel: t('x'), t("x"), tl(lang,'x')
const usedKeys = new Set();
// (zusammengesetzte Schlüssel wie t('part_'+id) werden übersprungen)
for(const m of src.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+)['"](?!\s*\+)/g)) usedKeys.add(m[1]);
for(const m of src.matchAll(/\btl\(\s*[A-Za-z_.]+\s*,\s*['"]([A-Za-z0-9_]+)['"](?!\s*\+)/g)) usedKeys.add(m[1]);
usedKeys.forEach(k=>{ if(!(T.de && k in T.de)) errors.push(`Im Code benutzt, aber nicht im Wörterbuch: t('${k}')`); });

// --- Teile ----------------------------------------------------------------
const sysIds = SYSTEMS.map(s=>s.id);
const need = new Set();
SYSTEMS.forEach(s=>need.add(s.nameKey));
const typeSeen = new Set();
PARTS.forEach(p=>{
  const [type, nameKey, icon, systems, variants] = p;
  if(typeSeen.has(type)) errors.push(`Teile-Art doppelt in PARTS: "${type}"`);
  typeSeen.add(type);
  need.add('part_' + nameKey);
  systems.forEach(s=>{
    if(!sysIds.includes(s)) errors.push(`"${type}": System "${s}" gibt es nicht in SYSTEMS`);
    else if(!(CATEGORY_ORDER[s]||[]).includes(type)) errors.push(`"${type}" fehlt in CATEGORY_ORDER.${s}`);
  });
  variants.forEach(([v, kg])=>{
    if(typeof v === 'string') need.add('var_' + v);
    if(Array.isArray(v)) need.add('var_' + v[1]);
    if(kg !== null && !(typeof kg === 'number' && kg > 0)) errors.push(`"${type}": Gewicht muss Zahl > 0 oder null sein, ist ${JSON.stringify(kg)}`);
  });
});
Object.entries(CATEGORY_ORDER).forEach(([s, list])=>{
  if(!sysIds.includes(s)) errors.push(`CATEGORY_ORDER hat System "${s}", das nicht in SYSTEMS steht`);
  list.forEach(type=>{
    const p = PARTS.find(x=>x[0]===type);
    if(!p) errors.push(`CATEGORY_ORDER.${s} nennt "${type}", das es in PARTS nicht gibt`);
    else if(!p[3].includes(s)) errors.push(`CATEGORY_ORDER.${s} nennt "${type}", aber das Teil gehört nicht zu System "${s}"`);
  });
  const dup = list.filter((x,i)=>list.indexOf(x)!==i);
  if(dup.length) errors.push(`CATEGORY_ORDER.${s} doppelt: ${dup.join(', ')}`);
});
sysIds.forEach(s=>{ if(!CATEGORY_ORDER[s]) errors.push(`System "${s}" hat keinen Eintrag in CATEGORY_ORDER`); });
need.forEach(k=>{
  const fehlt = langs.filter(l=>T[l] && !(k in T[l]));
  if(fehlt.length === langs.length) errors.push(`Name fehlt im Wörterbuch: "${k}" (alle Sprachen)`);
});
const ids = CATALOG.map(i=>i.id);
const dupIds = [...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
if(dupIds.length) errors.push(`Artikel-ID doppelt: ${dupIds.join(', ')}`);

// --- Artikel-IDs gegen früheren Stand --------------------------------------
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i+1] : null; };
if(opt('--ids-speichern')){
  fs.writeFileSync(opt('--ids-speichern'), JSON.stringify(ids, null, 1));
  console.log(`${ids.length} Artikel-IDs gespeichert in ${opt('--ids-speichern')}`);
}
if(opt('--ids-vorher')){
  const vorher = JSON.parse(fs.readFileSync(opt('--ids-vorher'), 'utf8'));
  const weg = vorher.filter(id=>!ids.includes(id));
  if(weg.length) errors.push(`Artikel-IDs verschwunden (alte Bestellungen/Bestände passen nicht mehr): ${weg.join(', ')}`);
  const neu = ids.filter(id=>!vorher.includes(id));
  if(neu.length) console.log(`Neue Artikel-IDs: ${neu.join(', ')}`);
}

// --- Symbole ---------------------------------------------------------------
Object.entries(EMO).forEach(([e, v])=>{
  const name = Array.isArray(v) ? v[0] : v;
  if(!SYM_ICONS[name]) errors.push(`EMO "${e}" zeigt auf Symbol "${name}", das in SYM_ICONS fehlt`);
});
const emoKeys = new Set(Object.keys(EMO));
const pict = /\p{Extended_Pictographic}/u;
const unbekannt = new Map();
langs.forEach(l=>Object.entries(T[l]||{}).forEach(([k, s])=>{
  for(const ch of String(s).replace(/️/g,'')){
    if(pict.test(ch) && !emoKeys.has(ch)) unbekannt.set(ch, k);
  }
}));
unbekannt.forEach((k, ch)=>warnings.push(`Emoji "${ch}" (z. B. in "${k}") hat keinen EMO-Eintrag – bleibt als Emoji stehen`));

// --- Ausgabe ---------------------------------------------------------------
warnings.forEach(w=>console.log('Hinweis: ' + w));
if(errors.length){
  errors.forEach(e=>console.log('FEHLER: ' + e));
  console.log(`\n${errors.length} Fehler.`);
  process.exit(1);
}
console.log(`OK – ${allKeys.size} Texte in ${langs.length} Sprachen, ${PARTS.length} Teile-Arten, ${ids.length} Artikel, ${sysIds.length} Systeme.`);
