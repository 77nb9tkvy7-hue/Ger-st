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
const ROLE_VIEW = { baustelle: '.order-table', lager: '.order-card', fahrer: '.order-card', chef: '.order-card' };

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

async function shot(page, check, role, width) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${check}-${role}-${width}${OPTS.dark ? '-dark' : ''}${args.some(a => a.startsWith('--lang=')) ? '-' + OPTS.lang : ''}.png`);
  await page.screenshot({ path: file, fullPage: true });
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
