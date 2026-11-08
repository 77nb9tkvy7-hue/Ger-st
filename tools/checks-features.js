// Prüfungen für die neuen Funktionen (Plan docs/plan-neue-funktionen.md).
// Wird von tools/demo-check.js eingebunden: Object.assign(CHECKS, require('./checks-features')(helpers)).
// Jede Prüfung gibt eine Liste von Problemen zurück (leer = PASS).
module.exports = ({ switchRole, shot }) => {
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const errs = (errors, p) => { if (errors.length) p.push(`${errors.length} Seitenfehler: ${errors.slice(0, 3).join(' | ')}`); return p; };

  return {
    // Task 1: Defekt-Bestand (Logik + Zusammenführen)
    defekt: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'lager');
      const r = await ev(page, () => {
        const id = 'anker';
        const inv0 = state.inventory[id] ?? 0, def0 = (state.defect || {})[id] ?? 0;
        const pu = { id: 999, status: 'Abgeholt', items: [{ id, qty: 10, defekt: 3 }] };
        bookPickupIntoStock(pu);
        const a = { inv: (state.inventory[id] ?? 0) - inv0, def: (state.defect[id] ?? 0) - def0 };
        repairDefect(id, 2);
        const b = { inv: (state.inventory[id] ?? 0) - inv0, def: (state.defect[id] ?? 0) - def0 };
        scrapDefect(id, 1);
        const c = { inv: (state.inventory[id] ?? 0) - inv0, def: (state.defect[id] ?? 0) - def0 };
        const base = { defect: { anker: 1 } }, l = { defect: { anker: 3 } }, rem = { defect: { anker: 3 } };
        const m = merge3(base, l, rem).value.defect.anker;
        return { a, b, c, m };
      });
      if (r.a.inv !== 7 || r.a.def !== 3) p.push(`Abholung 10/3 defekt: Bestand +${r.a.inv}, Defekt +${r.a.def} (erwartet +7/+3)`);
      if (r.b.inv !== 9 || r.b.def !== 1) p.push(`Repariert 2: Bestand +${r.b.inv}, Defekt +${r.b.def} (erwartet +9/+1)`);
      if (r.c.inv !== 9 || r.c.def !== 0) p.push(`Verschrottet 1: Bestand +${r.c.inv}, Defekt +${r.c.def} (erwartet +9/0)`);
      if (r.m !== 5) p.push(`merge3 Defekt zwei Geräte je +2: ${r.m} (erwartet 5)`);
      // Oberfläche: Inventur zeigt Defekt-Zeile mit Knöpfen
      await ev(page, () => { state.lagerTab = 'inventur'; state.defect = { ...(state.defect || {}), anker: 2 }; render(); });
      const ui = await ev(page, () => { const t = document.body.innerText; return { def: /Defekt: 2/.test(t), rep: !!document.querySelector('[data-action="defect-repair"]'), scr: !!document.querySelector('[data-action="defect-scrap"]') }; });
      if (!ui.def || !ui.rep || !ui.scr) p.push(`Inventur: Defekt-Anzeige/Knöpfe fehlen ${JSON.stringify(ui)}`);
      await shot(page, 'defekt', 'lager', 390, false);
      return errs(errors, p);
    },
    // Task 1: Mindestbestand
    stock: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'lager');
      const r = await ev(page, () => {
        state.inventory.anker = 4; state.minStock = { ...(state.minStock || {}), anker: 10 };
        const s1 = stockStatus('anker'); state.inventory.anker = 12; const s2 = stockStatus('anker');
        state.inventory.anker = -1; const s3 = stockStatus('anker'); state.inventory.anker = 4;
        const base = { minStock: { anker: 5 } }, l = { minStock: { anker: 10 } }, rem = { minStock: { anker: 5 } };
        const m = merge3(base, l, rem).value.minStock.anker;
        state.lagerTab = 'bestellungen'; render();
        const chip = [...document.querySelectorAll('.stat-chip-btn')].some(b => /Knapp/.test(b.textContent));
        state.lagerTab = 'inventur'; render();
        const row = /Knapp/.test(document.body.innerText) && /Min/.test(document.body.innerText);
        return { s1, s2, s3, m, chip, row, minBtn: !!document.querySelector('[data-action="min-open"]') };
      });
      if (r.s1 !== 'knapp' || r.s2 !== 'ok' || r.s3 !== 'fehlt') p.push(`stockStatus: ${r.s1}/${r.s2}/${r.s3} (erwartet knapp/ok/fehlt)`);
      if (r.m !== 10) p.push(`merge3 minStock: ${r.m} (erwartet 10)`);
      if (!r.chip) p.push('Lager-Leiste ohne Chip „Knapp“');
      if (!r.row || !r.minBtn) p.push('Inventur ohne Knapp-Hinweis/Min-Knopf');
      return errs(errors, p);
    },
    // Task 2: Materialliste je BV
    material: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      const r = await ev(page, () => {
        const pid = 990;
        state.projects.push({ id: pid, name: 'Testbau', adresse: 'X', aktiv: true });
        state.orders.push({ id: 9901, projekt: pid, person: 'Max', status: 'Geliefert', items: [{ id: 'anker', name: 'Anker', unit: 'Stk', qty: 20 }], time: '01.11.2026, 08:00' });
        state.orders.push({ id: 9902, projekt: pid, person: 'Max', status: 'Unterwegs', items: [{ id: 'anker', name: 'Anker', unit: 'Stk', qty: 5 }], time: '02.11.2026, 08:00' });
        state.pickups.push({ id: 9903, projekt: pid, status: 'Im Lager', items: [{ id: 'anker', qty: 15, defekt: 2 }] });
        const b = materialBalance(pid).find(x => x.id === 'anker');
        state.chefTab = 'bauvorhaben'; state.chefProjekt = pid; render();
        return { b, sec: !!document.getElementById('sec-material'), print: !!document.querySelector('[data-action="material-print"]') };
      });
      const b = r.b || {};
      if (b.geliefert !== 20 || b.zurueck !== 15 || b.defekt !== 2 || b.vorOrt !== 5) p.push(`materialBalance: ${JSON.stringify(b)} (erwartet 20/15/2/5)`);
      if (!r.sec || !r.print) p.push('BV-Detail ohne Abschnitt Material / Drucken');
      await shot(page, 'material', 'chef', 390, false);
      return errs(errors, p);
    },
    // Task 2: Pause-Knopf
    pause: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'fahrer');
      const btn = await page.$('[data-action="set-driver-status"][data-status="pause"]');
      if (!btn) { p.push('kein Pause-Knopf'); return errs(errors, p); }
      await btn.click(); await page.waitForTimeout(300);
      const r = await ev(page, async () => {
        const s1 = state.driverStatus[state.name].status;
        // simulierter Zonenwechsel (weg vom Lager) darf Pause nicht überschreiben
        state.lager = state.lager || { coords: { lat: 48.1, lon: 11.5 } };
        geoName = state.name; geoZone = 'in';
        await autoDriverStatus({ lat: state.lager.coords.lat + 0.05, lon: state.lager.coords.lon, acc: 20 });
        return { s1, s2: state.driverStatus[state.name].status };
      });
      if (r.s1 !== 'pause' || r.s2 !== 'pause') p.push(`Pause: ${r.s1} → nach Zonenwechsel ${r.s2} (erwartet pause/pause)`);
      await switchRole(page, 'chef');
      const lkw = await ev(page, () => { state.chefTab = 'lkws'; render(); return /Pause/.test(document.body.innerText); });
      if (!lkw) p.push('Chef sieht Pause nicht');
      return errs(errors, p);
    },
    // Task 2: Export
    export: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      const r = await ev(page, () => {
        const csv = exportCSV('all');
        const lines = csv.replace(/^﻿/, '').trim().split('\n');
        const pos = state.orders.reduce((a, o) => a + (o.items || []).length, 0);
        const btn = !!document.querySelector('[data-action="export-open"]');
        return { bom: csv.charCodeAt(0) === 0xFEFF, head: lines[0], n: lines.length - 1, pos, btn };
      });
      if (!r.bom) p.push('CSV ohne BOM');
      if (r.head !== 'Nr;Datum;Bauvorhaben;Besteller;Status;Teil;Menge;Einheit;kg') p.push('Kopfzeile: ' + r.head);
      if (r.n !== r.pos) p.push(`Zeilen ${r.n} ≠ Positionen ${r.pos}`);
      if (!r.btn) p.push('kein Export-Knopf in der Chef-Übersicht');
      return errs(errors, p);
    },
    // Task 3: Anmeldung ohne Namensliste
    login: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      await ev(page, () => { document.querySelector('[data-action="logout"]').click(); });
      await page.waitForSelector('#loginPw');
      const sel = await page.$('select#loginName');
      if (sel) p.push('Anmeldeseite hat noch eine Namensliste (select)');
      const pageNames = await ev(page, () => /Jochen|Ludwig|Kemal|Chefin/.test(document.getElementById('app').innerHTML));
      if (pageNames) p.push('Mitarbeiternamen auf der Anmeldeseite sichtbar');
      // falscher Name
      await page.fill('#loginName', 'Mox'); await page.fill('#loginPw', '1234');
      await page.click('[data-action="login"]'); await page.waitForTimeout(500);
      const w1 = await ev(page, () => (document.querySelector('.warn') || {}).textContent || '');
      if (!/Name oder Passwort falsch/.test(w1)) p.push('falscher Name → Meldung: ' + w1);
      // richtiger Name, andere Schreibweise
      await page.fill('#loginName', '  max '); await page.fill('#loginPw', '1234');
      await page.click('[data-action="login"]'); await page.waitForTimeout(900);
      const who = await ev(page, () => ({ name: state.name, logged: state.loggedIn }));
      if (who.name !== 'Max' || !who.logged) p.push('Anmeldung „  max “ fehlgeschlagen: ' + JSON.stringify(who));
      // nach Abmelden vorausgefüllt
      await ev(page, () => { document.querySelector('[data-action="logout"]').click(); });
      await page.waitForSelector('#loginPw');
      const pre = await page.inputValue('#loginName');
      if (pre !== 'Max') p.push('Name nach Abmelden nicht vorausgefüllt: ' + pre);
      await shot(page, 'login', 'abgemeldet', 390, false);
      return errs(errors, p);
    },
    // Task 3: Kalender nur nach Anmeldung
    'calendar-lock': async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      await ev(page, () => { document.querySelector('[data-action="logout"]').click(); });
      await page.waitForSelector('#loginPw');
      for (const view of ['calendar', 'lkwkalender']) {
        const r = await ev(page, v => { state.view = v; render(); const t = document.body.innerText; return { lock: /nur nach der Anmeldung/.test(t), btn: !!document.querySelector('[data-action="go-app"]'), leak: /BV 1\d\d|Leopold|Schulhaus|Giesing/.test(document.getElementById('app').innerHTML), authed: state.authed }; }, view);
        if (!r.lock || !r.btn) p.push(`${view}: kein Hinweis/Anmelde-Knopf ${JSON.stringify(r)}`);
        if (r.leak) p.push(`${view}: Termine/Adressen ohne Anmeldung sichtbar`);
      }
      const rpcInfo = await ev(page, async () => { const { data } = await supabaseClient.rpc('public_info'); return JSON.stringify(data || {}); });
      if (rpcInfo !== '{}') p.push('public_info liefert noch Daten: ' + rpcInfo.slice(0, 80));
      return errs(errors, p);
    },
  };
};

