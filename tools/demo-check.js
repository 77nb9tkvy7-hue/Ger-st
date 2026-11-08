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
  const file = path.join(SHOTS, `${check}-${role}-${width}.png`);
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
};

(async () => {
  const fn = CHECKS[checkName];
  if (!fn) { console.log(`FAIL ${checkName}: unbekannte Prüfung (vorhanden: ${Object.keys(CHECKS).join(', ')})`); process.exit(1); }
  const ctx = await launch();
  let problems;
  try { problems = await fn(ctx); } catch (e) { problems = ['Ausnahme: ' + (e && e.message || e)]; }
  await ctx.browser.close();
  if (problems && problems.length) { console.log(`FAIL ${checkName}: ${problems.join('; ')}`); process.exit(1); }
  console.log(`PASS ${checkName}`);
})();
