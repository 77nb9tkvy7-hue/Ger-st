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
const OPTS = { role: opt('role', null), width: parseInt(opt('width', '390'), 10), dark: args.includes('--dark'), lang: opt('lang', 'de') };

// ---- Helfer (von allen Prüfungen gemeinsam genutzt) -------------------------
async function launch(o = OPTS) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: o.width, height: 844 }, serviceWorkers: 'block',
    colorScheme: o.dark ? 'dark' : 'light', locale: 'de-DE',
  });
  await context.addInitScript(l => { try { localStorage.setItem('geruest-lang', l); } catch (e) {} }, o.lang);
  await context.route(/tile|openstreetmap|nominatim|osrm|fonts\.g|cdnjs/i, r => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto('file://' + path.join(ROOT, 'demo.html'));
  await page.waitForSelector('#demoBar');
  await page.waitForSelector('main', { timeout: 10000 });
  return { browser, context, page, errors, opts: o };
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
    const prim = [...document.querySelectorAll('.advance-btn')].find(vis) ||
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
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
  // Task 3: Zahlen-Leiste am Handy (< 900 px), Kacheln am PC; Chips springen ohne Fehler.
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
  // Task 4: Hauptknopf zuerst. Lager/Fahrer: erster Hauptknopf am Handy ohne Scrollen sichtbar;
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
  // Task 5: Baustelle bestellt über Suchfeld oben -> Teile-Art -> Variante -> Bestellschein.
  // Tipps werden gezählt und gedruckt; die "<= 4 Tipps"-Grenze prüft erst Task 6 (Schnellwahl).
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
  // Task 6: Ziffernblock – öffnen, 1 + 2 tippen, Polling (5 s) übersteht, OK -> 12; Tastatur; Chips ohne Überlauf.
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
    // Kein Neu-Abspielen: Popup -> Ziffernblock -> OK darf das Popup nicht erneut animieren
    await page.evaluate(() => { state.itemPopup = 'konsole70M'; render(); });
    await page.waitForTimeout(400);
    await page.click('.item-popup [data-action="numpad-open"]');
    await page.waitForTimeout(500);
    await page.click('.np-key.np-ok');
    const anims = await page.evaluate(() => document.getAnimations().length);
    if (anims !== 0) problems.push(`${anims} Animation(en) nach Schließen des Ziffernblocks (Popup spielt neu)`);
    await page.evaluate(() => { state.itemPopup = null; render(); });
    // R6: Chip setzt Menge, "Häufig bestellt"-Dopplung + Art-Zeile ziehen mit
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
  // Task 5: Chef "Planen" nutzt dieselbe Teile-Art-Liste – Teil wählen und Lieferung einplanen.
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
  // Task 7: Verladen & losfahren, Tour-Modus, Status-Zeiten.
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
    if (errors.length) problems.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`);
    return problems;
  },
};

(async () => {
  const fn = CHECKS[checkName];
  if (!fn) { console.log(`FAIL ${checkName}: unbekannte Prüfung (vorhanden: ${Object.keys(CHECKS).join(', ')})`); process.exit(1); }
  let ctx, problems;
  try { ctx = await launch(); problems = await fn(ctx); } catch (e) { problems = ['Ausnahme: ' + (e && e.message || e)]; }
  if (ctx) await ctx.browser.close();
  if (problems && problems.length) { console.log(`FAIL ${checkName}: ${problems.join('; ')}`); process.exit(1); }
  console.log(`PASS ${checkName}`);
})();
