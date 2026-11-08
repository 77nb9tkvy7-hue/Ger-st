#!/usr/bin/env node
// Prüf-Skript für demo.html (Playwright).
// Aufruf: node tools/demo-check.js <check> [--role=baustelle|lager|fahrer|chef] [--width=390] [--dark] [--lang=de]
// Jede Prüfung druckt "PASS <name>" oder "FAIL <name>: <Grund>"; Exit-Code 1 bei FAIL.
// Neue Prüfung: in CHECKS einen Eintrag  name: async (ctx) => { ... }  ergänzen.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const ROLES = ['baustelle', 'lager', 'fahrer', 'chef'];
const ROLE_VIEW = { baustelle: '.art-list', lager: '.order-card', fahrer: '.order-card', chef: '.order-card' };

const args = process.argv.slice(2);
const checkName = args.find(a => !a.startsWith('--')) || 'baseline';
const opt = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const _w = parseInt(opt('width', '390'), 10);
const OPTS = { role: opt('role', null), width: _w, height: parseInt(opt('height', _w >= 1280 ? '900' : '844'), 10), dark: args.includes('--dark'), lang: opt('lang', 'de') };

// ---- Helfer (von allen Prüfungen gemeinsam genutzt) -------------------------
async function launch(o = OPTS) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: o.width, height: o.height }, serviceWorkers: 'block',
    colorScheme: o.dark ? 'dark' : 'light', locale: 'de-DE',
  });
  await context.addInitScript(l => { try { localStorage.setItem('demo-geruest-lang', l); } catch (e) {} }, o.lang);
  await context.route(/tile|openstreetmap|nominatim|osrm|fonts\.g|cdnjs/i, r => r.abort());
  const page = await context.newPage();
  const errors = [];
  const filtered = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  // console.error zählt als Fehler, außer erwartete Netz-Fehler der bewusst abgebrochenen Hosts (Karten, Schriften, cdnjs, Nominatim, OSRM)
  page.on('console', m => { if (m.type() !== 'error') return; const u = (m.location() && m.location().url) || '';
    if (/tile|openstreetmap|nominatim|osrm|fonts\.g|cdnjs/i.test(u) && /Failed to load resource|ERR_/i.test(m.text())) filtered.push(u); else errors.push('console.error: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'demo.html'));
  await page.waitForSelector('#demoBar');
  await page.waitForSelector('main', { timeout: 10000 });
  return { browser, context, page, errors, filtered, opts: o };
}

async function switchRole(page, role) {
  await page.click(`#demoBar [data-role="${role}"]`);
  await page.waitForSelector(`#demoBar [data-role="${role}"].on`);
  await page.waitForTimeout(350);
}

// Messwerte der aktuellen Ansicht
async function measure(page) {
  return page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !(el.type === 'hidden'); };
    const scopes = [...document.querySelectorAll('main, .overlay, .role-nav')];
    const inScope = el => scopes.some(s => s.contains(el));
    const small = [...document.querySelectorAll('button,a,select,input,[data-action]')]
      .filter(el => inScope(el) && vis(el) && el.getBoundingClientRect().height < 44);
    let textUnder13 = 0;
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const n = walker.currentNode; const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent.trim() || !vis(el)) continue;
      seen.add(el);
      if (parseFloat(getComputedStyle(el).fontSize) < 13) textUnder13++;
    }
    // Lager: der Hauptknopf erscheint erst, wenn alles abgehakt ist -> erste Packlisten-Zeile (.pick-tap) gilt als erste Aktion
    const prim = [...document.querySelectorAll('.advance-btn, .pick-tap')].find(vis) ||
                 [...document.querySelectorAll('.submit-btn')].find(vis);
    const firstPrimaryY = prim ? Math.round(prim.getBoundingClientRect().top + window.scrollY) : null;
    return { under44: small.length, textUnder13, firstPrimaryY,
             overflowX: document.documentElement.scrollWidth > window.innerWidth,
             scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  });
}

async function shot(page, check, role, width, full = true) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${check}-${role}-${width}${OPTS.dark ? '-dark' : ''}${args.some(a => a.startsWith('--lang=')) ? '-' + OPTS.lang : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}

const fmt = (m) => `under44=${m.under44} textUnder13=${m.textUnder13} firstPrimaryY=${m.firstPrimaryY} overflowX=${m.overflowX} (scrollW ${m.scrollW} / innerW ${m.innerW})`;

// ---- Prüfungen --------------------------------------------------------------
const CHECKS = {
  // Alle Rollen zeigen ihre Ansicht, keine Seitenfehler; druckt die Messwerte je Rolle.
  async baseline(ctx) {
    const { page, errors, opts } = ctx;
    const roles = opts.role ? [opts.role] : ROLES;
    const problems = [];
    // Kein "Kein Netz"-Banner und keine scheinbaren lokalen Änderungen während 15 s Polling
    let banner = 0, pend = 0;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const r = await page.evaluate(() => ({ b: !!document.querySelector('.sync-banner'), h: hasLocalChanges(), p: !!state.syncPending }));
      if (r.b) banner++; if (r.h || r.p) pend++;
    }
    if (banner || pend) problems.push(`Sync-Leiste/Pending in ${banner}/${pend} von 15 s (hasLocalChanges soll false bleiben)`);
    for (const role of roles) {
      await switchRole(page, role);
      const found = await page.$(ROLE_VIEW[role]);
      if (!found) problems.push(`${role}: ${ROLE_VIEW[role]} fehlt`);
      const m = await measure(page);
      console.log(`  [${role}] ${fmt(m)}`);
      await shot(page, 'baseline', role, opts.width);
    }
    // Rollenwechsel/Abmelden verwirft vorübergehende Bedien-Zustände (Tour-Auswahl, Wohin?, Ziffernblock, Teile-Art, Demo: Bestellliste)
    const dirty = () => page.evaluate(() => { state.tourSel = [1005]; state.zielOpen = true; state.numpad = { id: 'x', val: '' }; state.openArt = 'konsole'; state.cart = { konsole70M: 3 }; });
    const left = () => page.evaluate(() => [state.tourSel.length && 'tourSel', state.zielOpen && 'zielOpen', state.numpad && 'numpad', state.openArt && 'openArt', Object.keys(state.cart).length && 'cart'].filter(Boolean));
    await dirty(); await switchRole(page, 'fahrer');
    let rest = await left(); if (rest.length) problems.push('Demo-Rollenwechsel lässt stehen: ' + rest.join(','));
    await dirty(); await page.evaluate(async () => { await signOutAll(); });
    rest = (await left()).filter(x => x !== 'cart'); if (rest.length) problems.push('Abmelden lässt stehen: ' + rest.join(','));
    await page.evaluate(() => { state.cart = {}; });
    // Speicher: die Demo liest/schreibt nie Schlüssel der echten App ('geruest-*'); Zurücksetzen löscht nur 'demo-*'
    const SENT = { 'geruest-session': '{"name":"Echt","role":"chef"}', 'geruest-cache': '"ECHT"', 'geruest-bv': '999' };
    const leaked = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('geruest-')));
    if (leaked.length) problems.push('Demo schreibt echte App-Schlüssel: ' + leaked.join(', '));
    await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, SENT);
    await switchRole(page, 'chef');
    await Promise.all([page.waitForEvent('load'), page.click('#demoBar [data-action="demo-reset"]')]);
    await page.waitForSelector('main', { timeout: 10000 }); await page.waitForTimeout(500);
    const ls = await page.evaluate(() => { const o = {}; Object.keys(localStorage).forEach(k => { o[k] = localStorage.getItem(k); }); return { o, name: state.name }; });
    const keys = Object.keys(ls.o);
    console.log('  localStorage nach Zurücksetzen: ' + keys.sort().join(', '));
    for (const k in SENT) if (ls.o[k] !== SENT[k]) problems.push(`echter Schlüssel ${k} verändert/gelöscht`);
    const extra = keys.filter(k => k.startsWith('geruest-') && !(k in SENT));
    if (extra.length) problems.push('echte App-Schlüssel geschrieben: ' + extra.join(', '));
    if (ls.name === 'Echt') problems.push('Demo hat echte Sitzung gelesen');
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Zahlen-Leiste am Handy (< 900 px), Kacheln am PC; Chips springen ohne Fehler.
  async strip(ctx) {
    ctx.page.on('dialog', d => d.dismiss());
    const { page, errors } = ctx;
    const problems = [];
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const role of ROLES) {
        await switchRole(page, role);
        const r = await page.evaluate(() => {
          const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).display !== 'none'; };
          const tiles = [...document.querySelectorAll('.widget')].filter(vis).length;
          const strip = document.querySelector('.stat-strip');
          const chips = strip ? [...strip.querySelectorAll('.stat-chip-btn')].filter(vis) : [];
          return { tiles, stripVis: !!(strip && vis(strip)), chips: chips.length, minH: chips.length ? Math.min(...chips.map(c => c.getBoundingClientRect().height)) : 0,
                   overflowX: document.documentElement.scrollWidth > window.innerWidth };
        });
        const tag = `${role}@${width}`;
        if (width < 900) {
          if (r.tiles) problems.push(`${tag}: Kacheln sichtbar`);
          if (!r.stripVis || !r.chips) problems.push(`${tag}: Leiste fehlt`);
          if (r.minH < 44) problems.push(`${tag}: Chip nur ${r.minH}px hoch`);
          if (r.overflowX) problems.push(`${tag}: horizontaler Überlauf`);
          if (r.chips) {
            const tgt = await page.evaluate(() => { const b = document.querySelector('.stat-chip-btn'); return { go: b.dataset.go || '', tab: b.dataset.tab || '' }; });
            await page.evaluate(() => { window.__flash = false; new MutationObserver(() => { if (document.querySelector('.jump-flash')) window.__flash = true; }).observe(document.getElementById('app'), { subtree: true, attributes: true, childList: true }); });
            await page.click('.stat-chip-btn');
            await page.waitForTimeout(700);
            if (!(await page.$('.stat-strip'))) problems.push(`${tag}: Leiste nach Tipp weg`);
            const hit = await page.evaluate(g => window.__flash || !!document.querySelector('.jump-flash'), tgt.go);
            const exists = tgt.go ? await page.evaluate(g => !!document.getElementById(g), tgt.go) : true;
            if (tgt.go && exists && !hit) problems.push(`${tag}: Ziel ${tgt.go} bekam kein jump-flash`);
          }
          await shot(page, 'strip', role, width);
        } else {
          if (!r.tiles) problems.push(`${tag}: Kacheln fehlen`);
          if (r.stripVis) problems.push(`${tag}: Leiste sichtbar`);
        }
      }
    }
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Hauptknopf zuerst. Lager/Fahrer: erster Hauptknopf am Handy ohne Scrollen sichtbar;
  // in jeder Karte steht der Hauptknopf vor .btn-row-secondary, Zweitknöpfe >= 44 px hoch.
  async cards(ctx) {
    const { page, errors } = ctx;
    const problems = [];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const role of ['lager', 'fahrer']) {
      await switchRole(page, role);
      const m = await measure(page);
      console.log(`  [${role}] ${fmt(m)}`);
      if (m.firstPrimaryY == null || m.firstPrimaryY >= 700) problems.push(`${role}: firstPrimaryY=${m.firstPrimaryY} (soll < 700)`);
      const r = await page.evaluate(() => {
        const bad = [];
        const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        let n = 0;
        document.querySelectorAll('.order-card').forEach(c => {
          if (!vis(c) || c.classList.contains('my-status')) return;
          const sec = c.querySelector('.btn-row-secondary'); if (!sec) return;
          n++;
          const main = c.querySelector('.advance-btn');
          const id = (c.querySelector('.no') || {}).textContent || '?';
          if (main && !(main.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING)) bad.push(`${id}: Hauptknopf nach Zweitreihe`);
          sec.querySelectorAll('button,a').forEach(b => { if (b.getBoundingClientRect().height < 44) bad.push(`${id}: Zweitknopf ${Math.round(b.getBoundingClientRect().height)}px`); });
        });
        return { n, bad };
      });
      if (!r.n) problems.push(`${role}: keine Karte mit Zweitreihe`);
      r.bad.forEach(b => problems.push(`${role}: ${b}`));
      await shot(page, 'cards', role, 390);
    }
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Baustelle bestellt über Suchfeld oben -> Teile-Art -> Variante -> Bestellschein.
  // Tipps werden gezählt und gedruckt; die "<= 4 Tipps"-Grenze prüft die Prüfung numpad (Schnellwahl).
  async 'order-flow'(ctx) {
    const { page, errors, opts } = ctx;
    const problems = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await switchRole(page, 'baustelle');
    await page.evaluate(() => { state.cart = {}; state.openArt = null; state.catalogSearch = ''; render(); window.scrollTo(0, 0); });
    const top = await page.evaluate(() => { const s = document.getElementById('catalogSearch'); return s ? Math.round(s.getBoundingClientRect().top + window.scrollY) : null; });
    const sh = await page.evaluate(() => { const s = document.getElementById('catalogSearch'); return s ? Math.round(s.getBoundingClientRect().height) : 0; });
    console.log(`  Suchfeld top=${top} hoehe=${sh}`);
    if (top == null || top >= 300) problems.push(`Suchfeld-Oberkante ${top} (soll < 300)`);
    if (sh < 52) problems.push(`Suchfeld nur ${sh}px hoch`);
    const artH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.art-row')].map(r => r.getBoundingClientRect().height)));
    if (artH < 52) problems.push(`Teile-Art-Zeile nur ${artH}px`);
    let taps = 0;
    const konsole = await page.evaluate(() => t('group_konsole'));
    const art = page.locator('.art-row', { hasText: konsole }).first();
    if (!(await art.count())) { problems.push('Zeile "Konsole" fehlt'); return problems; }
    await art.click(); taps++;
    await page.waitForTimeout(150);
    const vars = await page.evaluate(() => [...document.querySelectorAll('.art.open .var-row')].map(r => ({ label: r.querySelector('.var-label').textContent.trim(), qty: !!r.querySelector('.qty-ctl [data-numfor]') })));
    console.log(`  Varianten: ${vars.map(v => v.label).join(' | ')}`);
    for (const n of ['30', '70', '100']) {
      const v = vars.find(x => new RegExp('\\b' + n + '\\b').test(x.label));
      if (!v) problems.push(`Variante ${n} fehlt`); else if (!v.qty) problems.push(`Variante ${n} ohne Mengen-Steuerung`);
    }
    // Menge 20 bei Konsole 70 per Schnellwahl (ohne Tastatur)
    const row70 = page.locator('.art.open .var-row', { has: page.locator('[data-numfor="konsole70M"]') });
    const quick = row70.locator('[data-action="qty-quick"][data-q="20"]');
    if (!(await quick.count())) { problems.push('Schnellwahl "20" fehlt in der Variant-Zeile'); return problems; }
    const qb = await quick.boundingBox();
    if (qb.height < 44) problems.push(`Chip nur ${Math.round(qb.height)}px hoch`);
    await quick.click(); taps++;
    await page.waitForTimeout(150);
    const cart = await page.evaluate(() => Object.entries(state.cart).filter(([, q]) => q > 0));
    const footer = await page.evaluate(() => (document.querySelector('.order-footer span') || {}).textContent || '');
    console.log(`  Warenkorb ${JSON.stringify(cart)} · Fußleiste "${footer}"`);
    if (cart.length !== 1 || cart[0][0] !== 'konsole70M' || cart[0][1] !== 20) problems.push(`Warenkorb falsch: ${JSON.stringify(cart)}`);
    if (!/\b20\b/.test(footer)) problems.push('Fußleiste zeigt nicht 20');
    const meta = await page.evaluate(() => (document.querySelector('.art.open .art-meta') || {}).textContent || '');
    if (!/20/.test(meta)) problems.push(`Art-Zeile zeigt kein "20 im Auftrag" (${meta})`);
    await shot(page, 'order-flow', 'baustelle', 390);
    await page.click('.order-footer [data-action="open-order-review"]'); taps++;
    await page.waitForSelector('.review-table', { timeout: 3000 }).catch(() => {});
    const rows = await page.evaluate(() => [...document.querySelectorAll('.review-table tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim()).join(' × ')));
    console.log(`  Bestellschein: ${rows.join(' | ')}`);
    const k70 = await page.evaluate(() => t('part_konsole70'));
    if (!(rows.length === 1 && rows[0].includes(k70) && /\b20\b/.test(rows[0]))) problems.push(`Bestellschein falsch: ${rows.join(' | ')}`);
    console.log(`  Tipps gezählt: ${taps} (Grenze <= 4)`);
    if (taps > 4) problems.push(`${taps} Tipps (Grenze 4)`);
    await shot(page, 'order-flow-review', 'baustelle', 390);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Ziffernblock – öffnen, 1 + 2 tippen, Polling (5 s) übersteht, OK -> 12; Tastatur; Chips ohne Überlauf.
  async numpad(ctx) {
    const { page, errors } = ctx;
    const problems = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await switchRole(page, 'baustelle');
    await page.evaluate(() => { state.cart = {}; state.openArt = null; state.catalogSearch = ''; state.numpad = null; render(); window.scrollTo(0, 0); });
    await page.locator('.art-row', { hasText: await page.evaluate(() => t('group_konsole')) }).first().click();
    const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ovf > 0) problems.push(`horizontaler Überlauf ${ovf}px bei 390`);
    const chipH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.qty-chip')].map(c => c.getBoundingClientRect().height)));
    if (chipH < 44) problems.push(`Chip ${chipH}px hoch`);
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    await page.waitForSelector('.drawer.numpad');
    await page.click('.np-key[data-k="1"]'); await page.click('.np-key[data-k="2"]');
    const keyH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.np-key')].map(k => k.getBoundingClientRect().height)));
    if (keyH < 64) problems.push(`Taste ${keyH}px hoch (< 64)`);
    await shot(page, 'numpad', 'baustelle', 390, false);
    console.log('  warte 5 s (Polling)…');
    await page.waitForTimeout(5200);
    const disp = await page.evaluate(() => (document.getElementById('npDisplay') || {}).textContent);
    if (disp !== '12' || !(await page.locator('.drawer.numpad').count())) problems.push(`Ziffernblock nach Polling weg/verändert (Anzeige ${disp})`);
    await page.click('.np-key.np-ok');
    await page.waitForTimeout(250);
    let q = await page.evaluate(() => state.cart.konsole70M);
    if (q !== 12) problems.push(`Menge ${q} statt 12`);
    const txt = await page.evaluate(() => document.querySelector('[data-numfor="konsole70M"]').textContent);
    if (txt !== '12') problems.push(`Zahlknopf zeigt ${txt}`);
    // Tastatur: öffnen, 7, Rücktaste, 3, Enter -> 3 ; dann 0 -> entfernen
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    await page.keyboard.press('7'); await page.keyboard.press('Backspace'); await page.keyboard.press('3'); await page.keyboard.press('Enter');
    q = await page.evaluate(() => state.cart.konsole70M);
    if (q !== 3) problems.push(`Tastatur: Menge ${q} statt 3`);
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    await page.keyboard.press('0'); await page.keyboard.press('Enter');
    q = await page.evaluate(() => state.cart.konsole70M);
    if (q) problems.push(`0 hat nicht entfernt (${q})`);
    // Hintergrund bricht ab; Esc bricht ab
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    await page.keyboard.press('9'); await page.keyboard.press('Escape');
    if (await page.evaluate(() => state.numpad || state.cart.konsole70M)) problems.push('Esc hat nicht abgebrochen');
    // Barrierefreiheit: Dialog-Rolle, Fokus auf OK beim Öffnen, zurück auf den Mengen-Knopf beim Schließen, Zahl im aria-label
    await page.evaluate(() => { state.cart.konsole70M = 4; render(); });
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    const a1 = await page.evaluate(() => { const d = document.querySelector('.drawer.numpad'); const a = document.activeElement;
      return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), label: d.getAttribute('aria-label') || '', ok: a.classList.contains('np-ok') }; });
    await page.click('.np-key[data-k="5"]');
    const a2 = await page.evaluate(() => (document.activeElement.dataset || {}).k);
    await page.keyboard.press('Escape');
    const a3 = await page.evaluate(() => { const a = document.activeElement; return { back: a.classList.contains('qty-num') && a.dataset.numfor === 'konsole70M', label: a.getAttribute('aria-label') || '', np: !!state.numpad,
      strip: (document.querySelector('.stat-strip') || { getAttribute: () => 'ohne Leiste' }).getAttribute('aria-label') }; });
    console.log('  a11y: ' + JSON.stringify({ a1, a2, a3 }));
    if (a1.role !== 'dialog' || a1.modal !== 'true' || !a1.label) problems.push('Ziffernblock ohne role=dialog/aria-modal/aria-label');
    if (!a1.ok) problems.push('Fokus beim Öffnen nicht auf OK');
    if (a2 !== '5') problems.push('Fokus nach Tastendruck nicht auf der Taste (' + a2 + ')');
    if (!a3.back || a3.np) problems.push('Fokus nach Schließen nicht auf dem Mengen-Knopf');
    if (!/4/.test(a3.label)) problems.push('aria-label des Mengen-Knopfs ohne Zahl: ' + a3.label);
    if (!a3.strip) problems.push('.stat-strip ohne aria-label');
    // Enter auf fokussiertem OK darf den Ziffernblock nicht gleich wieder öffnen
    await page.click('[data-action="numpad-open"][data-id="konsole70M"]');
    await page.keyboard.press('7'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const a4 = await page.evaluate(() => ({ np: !!state.numpad, q: state.cart.konsole70M }));
    if (a4.np || a4.q !== 7) problems.push('Enter: ' + JSON.stringify(a4));
    await page.evaluate(() => { delete state.cart.konsole70M; render(); });
    // Kein Neu-Abspielen: Popup -> Ziffernblock -> OK darf das Popup nicht erneut animieren
    await page.evaluate(() => { state.itemPopup = 'konsole70M'; render(); });
    await page.waitForTimeout(400);
    await page.click('.item-popup [data-action="numpad-open"]');
    await page.waitForTimeout(500);
    await page.click('.np-key.np-ok');
    const anims = await page.evaluate(() => document.getAnimations().length);
    if (anims !== 0) problems.push(`${anims} Animation(en) nach Schließen des Ziffernblocks (Popup spielt neu)`);
    await page.evaluate(() => { state.itemPopup = null; render(); });
    // Chip setzt Menge, "Häufig bestellt"-Dopplung + Art-Zeile ziehen mit
    await page.click('[data-action="qty-quick"][data-id="konsole70M"][data-q="10"]');
    const synced = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('[data-numfor="konsole70M"]').forEach(x => { if (x.textContent !== '10') bad.push('Zahl ' + x.textContent); });
      document.querySelectorAll('.qty-chip[data-id="konsole70M"]').forEach(c => { if (c.classList.contains('on') !== (c.dataset.q === '10')) bad.push('Chip ' + c.dataset.q); });
      document.querySelectorAll('.art').forEach(a => { if (a.querySelector('[data-numfor="konsole70M"]') && !a.classList.contains('has-cart')) bad.push('.art ohne has-cart'); });
      return bad;
    });
    if (synced.length) problems.push('Nachziehen: ' + synced.join(', '));
    // Einzel-Variante inline (ohne Aufklappen)
    const single = await page.evaluate(() => { state.openArt = null; render(); return document.querySelectorAll('.art.single .qty-ctl').length; });
    console.log(`  Teile-Arten mit nur einer Variante (Steuerung inline): ${single}`);
    if (!single) problems.push('keine Einzel-Variante inline');
    const ovf2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ovf2 > 0) problems.push(`Überlauf ${ovf2}px`);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Chef "Planen" nutzt dieselbe Teile-Art-Liste – Teil wählen und Lieferung einplanen.
  async plan(ctx) {
    const { page, errors } = ctx;
    const problems = [];
    await switchRole(page, 'chef');
    await page.evaluate(() => { state.cart = {}; state.openArt = null; state.catalogSearch = ''; state.chefTab = 'planen'; render(); });
    const before = await page.evaluate(() => state.plannedDeliveries.length);
    const pid = await page.evaluate(() => { const o = document.querySelector('#planProjektSelect option[value]:not([value=""])'); return o ? o.value : null; });
    if (!pid) { problems.push('kein Bauvorhaben im Planungs-Formular'); return problems; }
    await page.selectOption('#planProjektSelect', pid);
    await page.fill('#planDateInput', '2026-12-01');
    await page.locator('.art-row', { hasText: await page.evaluate(() => t('group_konsole')) }).first().click();
    await page.locator('.art.open [data-action="qty-quick"][data-id="konsole30M"][data-q="5"]').click();
    await page.locator('.art.open [data-action="qty"][data-id="konsole30M"][data-delta="1"]').click();
    await page.waitForTimeout(150);
    await page.click('[data-action="add-planned-delivery"]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ n: state.plannedDeliveries.length, last: state.plannedDeliveries[state.plannedDeliveries.length - 1], warn: state.planWarn }));
    console.log(`  geplant vorher ${before}, nachher ${r.n}; letzte: ${JSON.stringify(r.last && r.last.items)} ${r.warn || ''}`);
    if (r.n !== before + 1) problems.push('Lieferung nicht eingeplant');
    else if (!r.last.items.some(i => i.id === 'konsole30M' && i.qty === 6)) problems.push('Position Konsole 30 × 6 fehlt');
    await shot(page, 'plan', 'chef', 390);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Verladen & losfahren, Tour-Modus, Status-Zeiten.
  async fahrer(ctx) {
    const { page, errors } = ctx;
    const problems = [];
    const st = id => page.evaluate(i => { const o = state.orders.find(x => x.id === i); return o && { status: o.status, steps: o.steps || null }; }, id);
    await switchRole(page, 'fahrer');
    await page.evaluate(() => { state.fahrerTab = 'lieferungen'; render(); });
    // (a) ein Tipp load-go
    await page.click('[data-action="load-go"][data-order="1004"]');
    await page.waitForTimeout(300);
    const a = await st(1004);
    if (a.status !== 'Unterwegs' || !a.steps || !a.steps['Beladen'] || !a.steps['Unterwegs']) problems.push('(a) load-go: ' + JSON.stringify(a));
    // (b)+(c) Tour: 1005 (Bereit) und 1006 (Beladen) anhaken
    await page.click('[data-action="tour-toggle"][data-order="1005"]');
    await page.click('[data-action="tour-toggle"][data-order="1006"]');
    const bar = await page.evaluate(() => { const b = document.querySelector('.tour-bar'); const r = b && b.getBoundingClientRect(); const tick = document.querySelector('.tour-tick'); const tr = tick.getBoundingClientRect();
      return b && { h: r.height, btnH: Math.min(...[...b.querySelectorAll('button')].map(x => x.getBoundingClientRect().height)), tickW: tr.width, tickH: tr.height, aria: tick.getAttribute('aria-label'), text: b.textContent.trim().replace(/\s+/g, ' ') }; });
    console.log('  Leiste: ' + JSON.stringify(bar));
    if (!bar) problems.push('Tour-Leiste fehlt');
    else { if (bar.btnH < 48) problems.push('Leisten-Knopf nur ' + bar.btnH + 'px'); if (bar.tickW < 48 || bar.tickH < 48) problems.push('Ankreuz-Feld zu klein'); if (!bar.aria) problems.push('aria-label fehlt'); }
    await shot(page, 'fahrer', 'fahrer-tour', 390);
    await page.waitForTimeout(5200);
    const sel = await page.evaluate(() => state.tourSel.slice());
    if (sel.length !== 2) problems.push('(c) Auswahl nach Polling: ' + JSON.stringify(sel));
    await page.click('[data-action="tour-load"]');
    await page.waitForTimeout(300);
    const b5 = await st(1005), b6 = await st(1006);
    if (b5.status !== 'Beladen' || b6.status !== 'Beladen') problems.push('(b) tour-load: ' + b5.status + '/' + b6.status);
    await page.click('[data-action="tour-go"]');
    await page.waitForTimeout(300);
    const c5 = await st(1005), c6 = await st(1006);
    if (c5.status !== 'Unterwegs' || c6.status !== 'Unterwegs') problems.push('(b) tour-go: ' + c5.status + '/' + c6.status);
    if (!c5.steps || !c5.steps['Beladen'] || !c5.steps['Unterwegs']) problems.push('(b) steps fehlen bei 1005');
    if (await page.$('.tour-bar')) problems.push('Leiste nach tour-go noch da');
    // (d) Bestellung ohne steps (1007, Unterwegs) normal weiterschalten
    const d0 = await st(1007);
    if (d0.steps) problems.push('1007 hat unerwartet steps');
    await page.click('[data-action="advance"][data-order="1007"]');
    await page.waitForTimeout(300);
    const d1 = await st(1007);
    if (d1.status !== 'Geliefert') problems.push('(d) 1007: ' + d1.status);
    // Merge: Gerät A ergänzt Beladen, Gerät B ergänzt Unterwegs -> alle drei Zeiten bleiben
    const mg = await page.evaluate(() => {
      const t0 = '2026-01-01T07:00:00.000Z', t1 = '2026-01-01T07:40:00.000Z', t2 = '2026-01-01T07:42:00.000Z', t3 = '2026-01-01T07:50:00.000Z';
      const r = mergeRecord({id:1, steps:{Neu:t0}}, {id:1, steps:{Neu:t0, Unterwegs:t2}}, {id:1, steps:{Neu:t0, Beladen:t1}});
      const c = mergeRecord({id:1, steps:{Neu:t0}}, {id:1, steps:{Neu:t0, Beladen:t1}}, {id:1, steps:{Neu:t0, Beladen:t3}});
      return { keys: Object.keys(r.steps).sort().join(','), later: c.steps.Beladen === t3 };
    });
    if (mg.keys !== 'Beladen,Neu,Unterwegs') problems.push('merge steps: ' + mg.keys);
    if (!mg.later) problems.push('merge steps: spätere Zeit gewinnt nicht');
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Packliste – Zeile antippen = eingepackt; erster Haken startet die Bearbeitung.
  async lager(ctx) {
    ctx.page.on('dialog', d => d.accept());
    const { page, errors } = ctx;
    const problems = [];
    await page.setViewportSize({ width: 390, height: 844 });
    const st = id => page.evaluate(i => { const o = state.orders.find(x => x.id === i); return o && { status: o.status, pick: JSON.stringify(o.pick || {}), steps: o.steps || null, items: o.items.map(x => x.id + ':' + x.qty) }; }, id);
    await switchRole(page, 'lager');
    await page.evaluate(() => { state.lagerTab = 'bestellungen'; render(); });
    // Pick-Liste schon bei "Neu", kein "Bearbeitung starten"
    const b0 = await page.evaluate(() => { const c = [...document.querySelectorAll('.order-card')].find(x => x.querySelector('.no').textContent.includes('1002')); return { pick: !!c.querySelector('.pick-tap'), adv: !!c.querySelector('.advance-btn'), open: (c.querySelector('.pick-open') || {}).textContent, rowH: Math.min(...[...c.querySelectorAll('.pick-tap')].map(r => r.getBoundingClientRect().height)), missH: Math.min(...[...c.querySelectorAll('.pick-btn')].map(r => r.getBoundingClientRect().height)) }; });
    console.log('  1002 Neu: ' + JSON.stringify(b0));
    if (!b0.pick) problems.push('Packliste bei "Neu" fehlt');
    if (b0.adv) problems.push('Hauptknopf bei Neu noch da');
    if (!/2/.test(b0.open || '')) problems.push('Hinweis "Noch N offen" fehlt: ' + b0.open);
    if (b0.rowH < 56) problems.push('Zeile nur ' + b0.rowH + 'px'); if (b0.missH < 48) problems.push('Fehlt-Knopf nur ' + b0.missH + 'px');
    // (a)
    await page.click('[data-action="pick-row"][data-order="1002"][data-idx="0"]');
    await page.waitForTimeout(200);
    let o = await st(1002);
    if (o.status !== 'In Bearbeitung' || !o.steps || !o.steps['In Bearbeitung']) problems.push('(a) ' + JSON.stringify(o));
    // Polling übersteht
    await page.waitForTimeout(5200);
    o = await st(1002);
    if (!o.pick.includes('"s":"ok"')) problems.push('Haken nach Polling weg: ' + o.pick);
    await shot(page, 'lager', 'lager', 390);
    // (b)
    await page.click('[data-action="pick-row"][data-order="1002"][data-idx="0"]');
    await page.waitForTimeout(200);
    o = await st(1002);
    if (o.pick !== '{}' || o.status !== 'In Bearbeitung') problems.push('(b) ' + JSON.stringify(o));
    // (c) zweites Gerät: Bestellung schon weiter
    // Karte (Stand "Neu") ist sichtbar; das zweite Gerät hat den Status inzwischen weitergesetzt, ohne dass diese Ansicht neu zeichnet
    await page.evaluate(() => { render(); state.orders.find(q => q.id === 1008).status = 'Bereit zur Abholung'; });
    await page.evaluate(() => document.querySelector('[data-action="pick-row"][data-order="1008"][data-idx="0"]').click());
    await page.waitForTimeout(200);
    const c1 = await st(1008);
    if (c1.status !== 'Bereit zur Abholung') problems.push('(c) Status rückwärts: ' + c1.status);
    // (d) 1002: Zeile 0 fehlt 2, Zeile 1 ok -> Bereit melden
    await page.evaluate(() => { state.inventory.rahmenSL70_200 = 10; state.inventory.diagonaleM_250 = 50; return saveShared(); });
    await page.click('[data-action="pick"][data-order="1002"][data-idx="0"][data-s="fehlt"]');
    await page.fill('#pickMiss-1002-0', '2'); await page.dispatchEvent('#pickMiss-1002-0', 'change');
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => !!document.querySelector('[data-action="advance"][data-order="1002"]'));
    if (mid) problems.push('Bereit melden schon vor letzter Zeile da');
    await page.click('[data-action="pick-row"][data-order="1002"][data-idx="1"]');
    await page.waitForTimeout(250);
    const adv = page.locator('.advance-btn[data-action="advance"][data-order="1002"]');
    if (!(await adv.count())) { problems.push('Bereit melden fehlt nach letzter Zeile'); return problems; }
    const ab = await adv.boundingBox();
    console.log('  Bereit melden Höhe ' + Math.round(ab.height));
    await shot(page, 'lager-done', 'lager', 390);
    await adv.click();
    await page.waitForTimeout(300);
    const d = await page.evaluate(() => ({ st: state.orders.find(x => x.id === 1002), inv: [state.inventory.rahmenSL70_200, state.inventory.diagonaleM_250], nach: state.orders.find(x => x.nachVon === 1002) }));
    if (d.st.status !== 'Bereit zur Abholung') problems.push('(d) Status ' + d.st.status);
    if (d.inv[0] !== 10 - 14 || d.inv[1] !== 50 - 12) problems.push('(d) Bestand ' + d.inv);
    if (!d.nach || d.nach.items[0].qty !== 2) problems.push('(d) Nachlieferung fehlt');
    await page.evaluate(() => { state.lagerTab = 'inventur'; state.systemSel = 'system'; render(); });
    const txt = await page.evaluate(() => document.body.innerText);
    const need = await page.evaluate(() => t('stockMissingLabel') + ' 4');
    if (!txt.includes(need)) problems.push('Inventur zeigt "' + need + '" nicht');
    await shot(page, 'lager-inventur', 'lager', 390);
    // (e) Merge zweier Geräte: Status läuft nie rückwärts, Packliste je Zeile, nach "Bereit melden" keine Packliste mehr
    const mr = await page.evaluate(() => {
      const base = { orders: [{ id: 1, status: 'Neu', items: [{ id: 'a', qty: 5 }, { id: 'b', qty: 3 }] }], counter: 2 };
      const local = JSON.parse(JSON.stringify(base)); Object.assign(local.orders[0], { status: 'In Bearbeitung', pick: { 0: { s: 'ok' } }, steps: { 'In Bearbeitung': '2026-11-08T10:00:05Z' } });
      const remote = JSON.parse(JSON.stringify(base)); Object.assign(remote.orders[0], { status: 'Bereit zur Abholung', items: [{ id: 'a', qty: 5 }, { id: 'b', qty: 1 }], fehlt: [{ id: 'b', qty: 2 }], nachId: 2,
        steps: { 'In Bearbeitung': '2026-11-08T10:00:00Z', 'Bereit zur Abholung': '2026-11-08T10:00:03Z' } });
      const m = merge3(base, local, remote).value.orders[0];
      // zwei Geräte haken verschiedene Zeilen ab
      const b2 = { orders: [{ id: 1, status: 'In Bearbeitung', items: [{ id: 'a', qty: 5 }, { id: 'b', qty: 3 }], pick: {} }] };
      const l2 = JSON.parse(JSON.stringify(b2)); l2.orders[0].pick = { 0: { s: 'ok' } };
      const r2 = JSON.parse(JSON.stringify(b2)); r2.orders[0].pick = { 1: { s: 'fehlt', n: 3 } };
      const m2 = merge3(b2, l2, r2).value.orders[0];
      // umgekehrt: lokal "Bereit melden", Server hat noch einen Haken gesetzt
      const l3 = JSON.parse(JSON.stringify(remote)); delete l3.orders[0].pick;
      const r3 = JSON.parse(JSON.stringify(b2)); r3.orders[0].pick = { 0: { s: 'ok' } };
      const m3 = merge3(b2, l3, r3).value.orders[0];
      return { st: m.status, pick: 'pick' in m, items: m.items.map(x => x.id + ':' + x.qty).join(','), nachId: m.nachId,
        pick2: JSON.stringify(m2.pick), st2: m2.status, st3: m3.status, pick3: 'pick' in m3 };
    });
    console.log('  Merge: ' + JSON.stringify(mr));
    if (mr.st !== 'Bereit zur Abholung') problems.push('(e) Status rückwärts beim Zusammenführen: ' + mr.st);
    if (mr.pick) problems.push('(e) Packliste nach Bereit melden noch da');
    if (mr.items !== 'a:5,b:1' || mr.nachId !== 2) problems.push('(e) Server-Positionen verloren: ' + mr.items);
    if (mr.pick2 !== '{"0":{"s":"ok"},"1":{"s":"fehlt","n":3}}' || mr.st2 !== 'In Bearbeitung') problems.push('(e) Haken zweier Geräte: ' + mr.pick2);
    if (mr.st3 !== 'Bereit zur Abholung' || mr.pick3) problems.push('(e) lokal Bereit melden: ' + mr.st3 + ' pick ' + mr.pick3);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Chef-Reiter "LKWs" (5 Reiter, Karte dort, Übersicht ohne Karte).
  async chef(ctx) {
    const { page, errors, opts } = ctx;
    const problems = [];
    await switchRole(page, 'chef');
    await page.evaluate(() => { state.chefTab = 'uebersicht'; render(); });
    const nav = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.role-nav button')];
      const vis = bs.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 0.5 && r.left >= -0.5; });
      return { n: bs.length, vis: vis.length, ids: bs.map(b => b.dataset.tab), sw: document.documentElement.scrollWidth, iw: innerWidth,
        mapOnOverview: !!document.getElementById('bvMapSlot'),
        firstCardTop: (() => { const c = document.querySelector('.order-card'); return c ? Math.round(c.getBoundingClientRect().top) : null; })() };
    });
    console.log('  ' + JSON.stringify(nav));
    if (nav.n !== 5 || nav.vis !== 5) problems.push(`Reiter sichtbar ${nav.vis}/${nav.n}`);
    if (nav.ids.join() !== 'uebersicht,lkws,bauvorhaben,planen,personal') problems.push('Reihenfolge ' + nav.ids);
    if (nav.sw > nav.iw) problems.push(`Überlauf ${nav.sw}>${nav.iw}`);
    if (nav.mapOnOverview) problems.push('Karte noch in Übersicht');
    if (nav.firstCardTop === null || nav.firstCardTop >= 700) problems.push('erste Bestellkarte bei ' + nav.firstCardTop);
    await shot(page, 'chef-uebersicht-' + opts.lang, 'chef', 390);
    await page.click('.role-nav [data-tab="lkws"]');
    await page.waitForTimeout(600);
    const l = await page.evaluate(() => ({ slot: !!document.querySelector('#bvMapSlot'), inSlot: !!document.querySelector('#bvMapSlot .bv-map, #bvMapSlot .order-time'),
      status: !!document.querySelector('.driver-status-list, .empty-state'), sw: document.documentElement.scrollWidth, iw: innerWidth, tab: state.chefTab }));
    console.log('  ' + JSON.stringify(l));
    if (!l.slot || !l.inSlot) problems.push('#bvMapSlot fehlt/leer im Reiter LKWs');
    if (l.sw > l.iw) problems.push('Überlauf in LKWs');
    await shot(page, 'chef-lkws-' + opts.lang, 'chef', 390);
    // Kachel "Fahrer unterwegs" -> Reiter LKWs
    await page.evaluate(() => { state.chefTab = 'uebersicht'; render(); });
    const tgt = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-action="widget-go"]')].find(x => x.dataset.go === 'sec-lkw'); if (!b) return null; b.click(); return state.chefTab; });
    if (tgt !== 'lkws') problems.push('Fahrer-Kachel springt nach ' + tgt);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Kontrast-Stichprobe (WCAG, < 4,5 = FAIL). Je Rolle werden ALLE sichtbaren Abzeichen (.status-badge, .pu-badge, .ev-kind,
  // .wunsch-badge, .rn-badge) und --muted-Texte (.order-time, .view-sub, .ms-meta) gemessen; Hintergrund = über den nächsten deckenden
  // Vorfahren zusammengesetzt, Vorfahren-opacity eingerechnet; je (Farbe, Hintergrund)-Paar einmal. Erledigt-Bereiche und der
  // Fahrer-Kalender (Tage -7..+21) werden vorher geöffnet.
  async contrast(ctx) {
    const { page, errors, opts } = ctx;
    const problems = [];
    const roles = opts.role ? [opts.role] : ROLES;
    await page.evaluate(() => {
      const rgb = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,\/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      window.__ct = { seen: {}, n: 0 };
      window.__sample = (role) => {
        const sel = '.status-badge,.pu-badge,.ev-kind,.wunsch-badge,.rn-badge,.order-time,.view-sub,.ms-meta,.pick-btn.miss,.pick-miss';
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
          if (!(el.textContent || '').trim()) continue;
          const layers = []; let opacity = 1; let opaque = false;
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const st = getComputedStyle(n); opacity *= parseFloat(st.opacity);
            if (!opaque) { const b = rgb(st.backgroundColor); if (b.a > 0) { layers.push(b); if (b.a >= 1) opaque = true; } }
          }
          let bg = opaque ? layers.pop() : rgb(getComputedStyle(document.body).backgroundColor);
          if (bg.a < 1) bg = { r: 255, g: 255, b: 255, a: 1 };
          while (layers.length) bg = mix(layers.pop(), bg);
          const back = rgb(getComputedStyle(document.body).backgroundColor); const backO = back.a >= 1 ? back : { r: 255, g: 255, b: 255, a: 1 };
          let fg = mix(rgb(getComputedStyle(el).color), bg);
          if (opacity < 1) { fg = mix({ ...fg, a: opacity }, backO); bg = mix({ ...bg, a: opacity }, backO); }
          const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const cls = el.className.toString().split(/\s+/).filter(c => !/^(card|active)$/.test(c)).join('.') || el.tagName;
          const key = `${[fg.r, fg.g, fg.b].map(Math.round)}|${[bg.r, bg.g, bg.b].map(Math.round)}|${opacity.toFixed(2)}`;
          window.__ct.n++;
          if (!window.__ct.seen[key]) window.__ct.seen[key] = { what: `${role}:${cls}`, ratio };
        }
      };
    });
    // Zusätzliche Abholungen (eine erledigt, eine mit Wunschtag heute) damit .pu-done / .ev-kind.abholung wirklich gemessen werden
    const openAll = () => page.evaluate(() => {
      const iso = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const base = state.pickups[0] || { projekt: 102, baustelle: 'x', person: 'Max', items: [], abbau: false, notiz: '', time: new Date().toISOString() };
      if (!state.pickups.some(p => p.id === 901)) state.pickups.push({ ...base, id: 901, status: 'Im Lager', fahrer: 'Ludwig' }, { ...base, id: 902, status: 'Unterwegs', fahrer: 'Ludwig', wunsch: 'datum', bis: iso });
      document.querySelectorAll('.done-toggle').forEach(b => { state.showDone[b.dataset.key] = true; }); render(); });
    // (Überschrift fehlt bewusst: openAll fügt Test-Abholungen nur im Speicher ein)
    for (const role of roles) {
      await switchRole(page, role);
      await openAll(); await openAll();
      await page.evaluate(r => window.__sample(r), role);
      if (role === 'fahrer') {
        await page.evaluate(async () => {
          state.fahrerTab = 'kalender'; const today = new Date(); const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
          for (let i = -7; i <= 21; i++) { const d = new Date(today); d.setDate(d.getDate() + i); state.fahrerCalDay = iso(d); render(); window.__sample('fahrer-kal'); }
          state.fahrerCalDay = null; state.fahrerTab = 'lieferungen'; render();
        });
      }
      if (role === 'lager') { for (const tab of ['geplant', 'inventur', 'bestellungen']) { await page.evaluate(t => { state.lagerTab = t; render(); window.__sample('lager-' + t); }, tab); } }
      if (role === 'chef') { for (const tab of ['uebersicht', 'lkws', 'bauvorhaben', 'planen']) { await page.evaluate(t => { state.chefTab = t; render(); window.__sample('chef-' + t); }, tab); } await page.evaluate(() => { state.chefTab = 'uebersicht'; render(); }); }
    }
    // Nicht-Text (WCAG 1.4.11, >= 3:1): Rand des leeren Packlisten-Kreises und des Tour-Häkchens gegen die Karte
    if (roles.includes('lager') || roles.includes('fahrer')) {
      const nt = await page.evaluate(async () => {
        const rgb = s => { const v = s.match(/rgba?\(([^)]+)\)/)[1].split(/[ ,\/]+/).map(Number); return v; };
        const lum = v => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]); };
        const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
        const card = rgb(getComputedStyle(document.documentElement).getPropertyValue('--card').trim() ? (() => { const d = document.createElement('div'); d.style.color = 'var(--card)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })() : 'rgb(255,255,255)');
        const out = {};
        const probe = (cls, inner) => { const w = document.createElement('div'); w.innerHTML = inner; document.body.appendChild(w); const el = w.querySelector(cls); const r = ratio(rgb(getComputedStyle(el).borderTopColor), card); w.remove(); return r; };
        out.pickBox = probe('.pick-box', '<div class="pick-row"><span class="pick-box"></span></div>');
        out.tourTick = probe('.tour-tick i', '<button class="tour-tick"><i></i></button>');
        return out;
      });
      console.log(`  Rand leerer Kreis ${nt.pickBox.toFixed(2)}:1, Tour-Häkchen ${nt.tourTick.toFixed(2)}:1`);
      if (nt.pickBox < 3) problems.push(`.pick-box Rand nur ${nt.pickBox.toFixed(2)}:1`);
      if (nt.tourTick < 3) problems.push(`.tour-tick Rand nur ${nt.tourTick.toFixed(2)}:1`);
    }
    const res = await page.evaluate(() => ({ n: window.__ct.n, items: Object.values(window.__ct.seen) }));
    const worst = res.items.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    console.log(`  ${res.n} Texte gemessen, ${res.items.length} verschiedene Farbpaare, schwächster Wert ${worst.ratio.toFixed(2)}:1 (${worst.what})`);
    console.log('  ' + res.items.sort((a, b) => a.ratio - b.ratio).slice(0, 6).map(r => `${r.what} ${r.ratio.toFixed(2)}`).join(', '));
    for (const r of res.items) if (r.ratio < 4.5) problems.push(`${r.what} nur ${r.ratio.toFixed(2)}:1`);
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Reiter-Beschriftungen unten werden nie abgeschnitten (Umbruch auf 2 Zeilen), kein Überlauf; alle Rollen in der gewählten Sprache.
  async nav(ctx) {
    const { page, errors } = ctx;
    const problems = [];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const role of ['lager', 'fahrer', 'chef']) {
      await switchRole(page, role);
      const r = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('.role-nav button')];
        return { n: bs.length, sw: document.documentElement.scrollWidth, iw: innerWidth,
          cut: bs.map(b => { const l = b.querySelector('.rn-lbl'); return { t: l.textContent.trim(), w: l.scrollWidth > l.clientWidth + 1, h: l.scrollHeight > l.clientHeight + 1, lines: Math.round(l.clientHeight / parseFloat(getComputedStyle(l).lineHeight)), out: b.getBoundingClientRect().right > innerWidth + 0.5 || b.getBoundingClientRect().left < -0.5 }; }) };
      });
      console.log(`  [${role}] ` + r.cut.map(c => `${c.t}(${c.lines}Z)`).join(' '));
      if (r.sw > r.iw) problems.push(`${role}: Überlauf ${r.sw}>${r.iw}`);
      for (const c of r.cut) { if (c.w || c.h) problems.push(`${role}: "${c.t}" abgeschnitten`); if (c.out) problems.push(`${role}: "${c.t}" außerhalb`); }
      await shot(page, 'nav', role, 390);
    }
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
};

Object.assign(CHECKS, require('./checks-features')({ switchRole, measure, shot }));

(async () => {
  if (checkName === 'all') {
    // Jede Prüfung in einem eigenen Prozess (eigener Browser, frischer Demo-Zustand); eine Zeile je Prüfung.
    const { spawnSync } = require('child_process');
    const runs = [['baseline'], ['strip'], ['cards'], ['order-flow'], ['numpad'], ['plan'], ['fahrer'], ['lager'], ['chef'], ['contrast'], ['nav'], ['nav', '--lang=pl'],
      ['baseline', '--width=1280'], ['baseline', '--dark'], ['contrast', '--dark']];
    let bad = 0;
    for (const r of runs) {
      const res = spawnSync('node', [__filename, ...r], { encoding: 'utf8' });
      const lines = (res.stdout || '').trim().split('\n');
      const last = lines[lines.length - 1];
      const ok = res.status === 0 && /^PASS/.test(last);
      if (!ok) bad++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${r.join(' ')}${ok ? '' : ' -> ' + last + (res.stderr ? ' | ' + res.stderr.trim().split('\n')[0] : '')}`);
    }
    const g = spawnSync('git', ['diff', '--quiet', '82ee6a1', '--', 'geruest-bestell-app.html'], { cwd: ROOT });
    console.log(`${g.status === 0 ? 'PASS' : 'FAIL'} Original unverändert (geruest-bestell-app.html)`);
    if (g.status !== 0) bad++;
    console.log(bad ? `FAIL all: ${bad} Prüfung(en) fehlgeschlagen` : 'PASS all');
    process.exit(bad ? 1 : 0);
  }
  const fn = CHECKS[checkName];
  if (!fn) { console.log(`FAIL ${checkName}: unbekannte Prüfung (vorhanden: ${Object.keys(CHECKS).join(', ')})`); process.exit(1); }
  let ctx, problems;
  try { ctx = await launch(); problems = await fn(ctx); } catch (e) { problems = ['Ausnahme: ' + (e && e.message || e)]; }
  if (ctx && ctx.filtered && ctx.filtered.length) console.log(`  (gefiltert: ${ctx.filtered.length} erwartete Netz-Fehler der abgebrochenen Hosts)`);
  if (ctx) await ctx.browser.close();
  if (problems && problems.length) { console.log(`FAIL ${checkName}: ${problems.join('; ')}`); process.exit(1); }
  console.log(`PASS ${checkName}`);
})();
