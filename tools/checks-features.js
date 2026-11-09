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
    // Task 4: Schriften und Bausteine selbst mitgeliefert
    vendor: async ({ page, errors }) => {
      const p = [];
      const ext = [];
      page.on('request', r => { const u = r.url(); if (/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|cdn\.jsdelivr|unpkg\.com/i.test(u)) ext.push(u); });
      await page.reload(); await page.waitForSelector('main');
      for (const role of ['baustelle', 'lager', 'fahrer', 'chef']) await switchRole(page, role);
      await ev(page, () => { state.chefTab = 'lkws'; render(); });
      await page.waitForTimeout(1500);
      const r = await ev(page, async () => { await document.fonts.ready; return { inter: document.fonts.check('600 16px Inter'), sg: document.fonts.check('700 16px "Space Grotesk"'), leaflet: typeof L !== 'undefined' && !!L.map }; });
      if (ext.length) p.push(`${ext.length} Anfrage(n) an fremde Server: ${ext.slice(0, 2).join(', ')}`);
      if (!r.inter || !r.sg) p.push('Schriften nicht geladen: ' + JSON.stringify(r));
      if (!r.leaflet) p.push('Kartenbaustein (Leaflet) nicht geladen');
      return errs(errors, p);
    },
    // Task 5: Beweis-Fotos
    fotos: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      // Testbild als Datei erzeugen (im Browser) und über die echte Datei-Eingabe wählen
      const pid = await ev(page, () => { const pr = state.projects.find(x => x.aktiv); state.chefTab = 'bauvorhaben'; state.chefProjekt = pr.id; render(); return pr.id; });
      const n0 = await ev(page, () => state.fotos.length);
      await page.click('[data-action="foto-open"]');
      const inp = await page.$('input[type=file][data-anlass="uebergabe"]');
      if (!inp) { p.push('keine Foto-Auswahl mit Anlass „Übergabe“'); return errs(errors, p); }
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkYGBgYAAAeAQH/5o7nAAAAAElFTkSuQmCC', 'base64');
      await inp.setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
      await page.waitForFunction(n0 => state.fotos && state.fotos.length > n0, n0, { timeout: 8000 }).catch(() => {});
      const a = await ev(page, n0 => { const f = state.fotos.length > n0 ? state.fotos[state.fotos.length - 1] : null; return f ? { f, thumb: !!document.querySelector('.foto-thumb') } : null; }, n0);
      if (!a) p.push('(a) Foto nicht gespeichert');
      else {
        if (a.f.anlass !== 'uebergabe' || a.f.by !== 'Chefin' || a.f.projekt !== pid || !a.f.ts || !a.f.path) p.push('(a) Foto-Eintrag unvollständig: ' + JSON.stringify(a.f));
        if (!a.thumb) p.push('(a) kein Vorschaubild im BV');
      }
      // (b) großes Bild wird verkleinert
      const b = await ev(page, async pid => {
        const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d');
        for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 7},70%,50%)`; g.fillRect((i * 97) % 4000, (i * 53) % 3000, 300, 200); }
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = await takePhotoFromFile(new File([blob], 'gross.png', { type: 'image/png' }), pid, 'schaden');
        return f ? { w: f.w, h: f.h, size: f.size } : null;
      }, pid);
      if (!b || Math.max(b.w, b.h) > 1600 || b.size >= 1024 * 1024) p.push('(b) großes Bild nicht verkleinert: ' + JSON.stringify(b));
      // (c) Löschen nur 5 Min. durch den Fotografen, danach nur Ausblenden durch den Chef
      const c = await ev(page, async () => {
        const fresh = state.fotos[state.fotos.length - 1];
        const can1 = canDeleteFoto(fresh);
        const del = await deleteFoto(fresh.id);
        const old = state.fotos[state.fotos.length - 1];
        await demoAgeFoto(old.path, 6 * 60 * 1000); old.ts = new Date(Date.now() - 6 * 60 * 1000).toISOString();
        const can2 = canDeleteFoto(old);
        const srv = await supabaseClient.storage.from('fotos').remove([old.path]);
        const byId = () => state.fotos.find(f => f.id === old.id);
        await toggleHideFoto(old.id); const hid = !!byId().hidden && byId().hidden.by === 'Chefin';
        await toggleHideFoto(old.id); const unhid = !byId().hidden;
        return { can1, del, gone: !state.fotos.some(f => f.id === fresh.id), can2, srvErr: !!srv.error, hid, unhid, oldId: old.id };
      });
      if (!c.can1 || !c.del || !c.gone) p.push('(c) frisches Foto nicht löschbar: ' + JSON.stringify(c));
      if (c.can2 || !c.srvErr) p.push('(c) Foto nach 6 Min. noch löschbar: ' + JSON.stringify(c));
      if (!c.hid || !c.unhid) p.push('(c) Ausblenden/Einblenden durch Chef geht nicht');
      await switchRole(page, 'baustelle');
      const noHide = await ev(page, id => { state.fotoView = id; render(); const r = !document.querySelector('[data-action="foto-hide"]'); state.fotoView = null; render(); return r; }, c.oldId);
      if (!noHide) p.push('(c) Baustelle sieht Ausblenden-Knopf');
      // (d) Upload-Fehler
      const d = await ev(page, async pid => {
        const n0 = state.fotos.length; const orig = supabaseClient.storage.from;
        supabaseClient.storage.from = () => ({ upload: async () => ({ data: null, error: { message: 'kein Netz' } }) });
        const c = document.createElement('canvas'); c.width = 20; c.height = 20; const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = await takePhotoFromFile(new File([blob], 'x.png', { type: 'image/png' }), pid, 'vorher');
        supabaseClient.storage.from = orig;
        return { f, same: state.fotos.length === n0, toast: (document.getElementById('toast') || {}).textContent || '' };
      }, pid);
      if (d.f || !d.same || !/nicht gespeichert/.test(d.toast)) p.push('(d) Upload-Fehler falsch behandelt: ' + JSON.stringify(d));
      await shot(page, 'fotos', 'chef', 390, false);
      return errs(errors, p);
    },
    // Task 6: Mängel melden
    maengel: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      const btn = await page.$('[data-action="mangel-open"]');
      if (!btn) { p.push('kein Knopf „Mangel melden“ bei der Baustelle'); return errs(errors, p); }
      await btn.click();
      await page.fill('#mangelText', 'Belag lose');
      await page.click('[data-action="mangel-send"]'); await page.waitForTimeout(600);
      const a = await ev(page, () => { const m = (state.maengel || []).filter(x => x.status === 'offen'); return { n: m.length, last: m[m.length - 1] }; });
      if (a.n < 1 || !a.last || a.last.text !== 'Belag lose' || a.last.by !== 'Max') p.push('Mangel nicht gespeichert: ' + JSON.stringify(a));
      await switchRole(page, 'chef');
      const b = await ev(page, () => { state.chefTab = 'uebersicht'; render(); const sec = document.getElementById('sec-maengel'); return { sec: !!sec, done: document.querySelectorAll('[data-action="mangel-done"]').length, chip: [...document.querySelectorAll('.stat-chip-btn')].some(x => /Mängel/.test(x.textContent)) }; });
      if (!b.sec || b.done < 1) p.push('Chef sieht offenen Mangel nicht: ' + JSON.stringify(b));
      if (!b.chip) p.push('Chef-Leiste ohne Chip „Mängel“');
      const n0 = a.n;
      await page.click('[data-action="mangel-done"]'); await page.waitForTimeout(400);
      const c = await ev(page, () => (state.maengel || []).filter(x => x.status === 'offen').length);
      if (c !== n0 - 1) p.push(`nach Erledigt noch ${c} offen (erwartet ${n0 - 1})`);
      await shot(page, 'maengel', 'chef', 390, false);
      return errs(errors, p);
    },
    // Task 6: Unterschrift
    signatur: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'fahrer');
      const oid = await ev(page, () => { const o = state.orders.find(x => x.status === 'Unterwegs'); state.fahrerTab = 'lieferungen'; render(); return o && o.id; });
      const btn = await page.$(`[data-action="sig-open"][data-order="${oid}"]`);
      if (!btn) { p.push('kein Knopf „Unterschrift“ auf der Karte „Unterwegs“'); return errs(errors, p); }
      await btn.click(); await page.waitForSelector('#sigCanvas');
      await page.waitForFunction(() => !document.getAnimations().length, null, { timeout: 3000 }).catch(() => {});  // Einblenden (280 ms) abwarten, sonst stimmen die Koordinaten nicht
      const box = await (await page.$('#sigCanvas')).boundingBox();
      await page.mouse.move(box.x + 30, box.y + 60); await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + 60 + (i % 2 ? 50 : 0));
      await page.mouse.up();
      await page.waitForTimeout(5000);  // Neuzeichnen/Polling abwarten
      const b = await ev(page, () => { const c = document.getElementById('sigCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i - 1] < 128) ink++; return { strokes: (state.sigDraft || {}).strokes ? state.sigDraft.strokes.length : 0, ink }; });
      if (b.strokes < 1 || b.ink < 20) p.push('(b) Striche nach 5 s weg: ' + JSON.stringify(b));
      await page.fill('#sigName', 'Herr Huber');
      await page.click('[data-action="sig-save"]'); await page.waitForTimeout(800);
      const a = await ev(page, async id => { const o = state.orders.find(x => x.id === id); await printOrderWithSig(id); return { sig: o.signatur || null, img: !!document.querySelector('#printArea img.ls-sig'), name: /Herr Huber/.test(document.getElementById('printArea').innerHTML) }; }, oid);
      if (!a.sig || !a.sig.path || a.sig.name !== 'Herr Huber') p.push('(a) Unterschrift nicht gespeichert: ' + JSON.stringify(a.sig));
      if (!a.img || !a.name) p.push('(a) Lieferschein ohne Unterschrift-Bild/Name');
      return errs(errors, p);
    },
    // Task 7: geschützte Zeilen (Zeit/Unterweisung) – Server-Regeln im Demo-Client nachgebaut
    schutz: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      const a = await ev(page, async () => {
        const own = await appendProtected('zeit:2026-11', { id: 't1', person: 'Max', projekt: 101, in: '2026-11-08T07:00:00Z' });
        const foreign = await appendProtected('zeit:2026-11', { id: 't2', person: 'Jochen', projekt: 101, in: '2026-11-08T07:00:00Z' });
        const korr = await appendProtected('zeit:2026-11', { id: 't1', person: 'Max', projekt: 101, in: '2026-11-08T07:00:00Z', korr: { in: 'x' } });
        const rows = await loadProtected('zeit:');
        return { own, foreign, korr, persons: rows.flatMap(r => r.entries.map(e => e.person)), team: ciTeam() };
      });
      if (!a.own) p.push('eigener Eintrag nicht gespeichert');
      if (a.foreign) p.push('Baustelle konnte fremden Eintrag schreiben');
      if (a.korr) p.push('Baustelle konnte Korrektur setzen');
      if (a.persons.some(n => !a.team.includes(n))) p.push('Baustelle liest fremde Einträge: ' + a.persons.join(','));
      await switchRole(page, 'chef');
      const b = await ev(page, async () => {
        const w = await appendProtected('zeit:2026-11', { id: 't3', person: 'Ludwig', projekt: 101, in: '2026-11-08T06:00:00Z' });
        const rows = await loadProtected('zeit:');
        return { w, persons: [...new Set(rows.flatMap(r => r.entries.map(e => e.person)))].sort() };
      });
      if (!b.w) p.push('Chef kann nicht schreiben');
      if (!b.persons.includes('Max') || !b.persons.includes('Ludwig')) p.push('Chef liest nicht alle: ' + b.persons.join(','));
      const leak = await ev(page, () => JSON.stringify(stateToValue()).includes('"zeit:'));
      if (leak) p.push('Zeit-Daten im großen Datensatz');
      return errs(errors, p);
    },
    // Task 8: Einchecken, Stunden, Regiebericht
    zeit: async ({ page, context, errors }) => {
      const p = [];
      await context.grantPermissions(['geolocation']);
      await switchRole(page, 'baustelle');
      const bv = await ev(page, () => { const x = state.projects.find(q => q.aktiv && q.coords); return { id: x.id, lat: x.coords.lat, lon: x.coords.lon }; });
      const tryIn = async (dLat, acc) => {
        await context.setGeolocation({ latitude: bv.lat + dLat, longitude: bv.lon, accuracy: acc });
        await page.click('[data-action="ci-in"]');
        const hint = await page.$('[data-action="ci-hint-ok"]');
        if (hint) { await hint.click(); }
        await page.waitForTimeout(900);
        return ev(page, () => ({ msg: state.ciMsg || '', open: (state.zeit || []).filter(e => e.person === 'Max' && !e.out).length, hintSeen: true }));
      };
      const far = await tryIn(0.0036, 20);
      if (!/zu weit/i.test(far.msg) || far.open) p.push('(a) 400 m: ' + JSON.stringify(far));
      const bad = await tryIn(0.00072, 250);
      if (!/ungenau/i.test(bad.msg) || bad.open) p.push('(a) ±250 m: ' + JSON.stringify(bad));
      const ok = await tryIn(0.00072, 20);
      if (ok.open !== 1) p.push('(a) 80 m nicht eingecheckt: ' + JSON.stringify(ok));
      await page.click('[data-action="ci-out"]'); await page.waitForTimeout(700);
      const out1 = await ev(page, () => (state.zeit || []).filter(e => e.person === 'Max' && !e.out).length);
      if (out1 !== 0) p.push('(a) Auschecken ging nicht');
      // (b) Kolonne: Chef legt Team an, Max checkt 3 Personen ein und aus
      await switchRole(page, 'chef');
      const kset = await ev(page, () => setKolonne('Max', ['Kemal', 'Jochen']));
      if (!kset) p.push('(b) Kolonne nicht gespeichert');
      await switchRole(page, 'baustelle');
      await page.waitForTimeout(400);
      await page.click('[data-action="ci-in"]'); await page.waitForTimeout(900);
      const team = await ev(page, () => (state.zeit || []).filter(e => !e.out).map(e => e.person).sort().join(','));
      if (team !== 'Jochen,Kemal,Max') p.push('(b) Kolonne eingecheckt: ' + team);
      await page.click('[data-action="ci-out"]'); await page.waitForTimeout(900);
      const team2 = await ev(page, () => (state.zeit || []).filter(e => !e.out).length);
      if (team2 !== 0) p.push('(b) Kolonne nicht ausgecheckt: ' + team2);
      // (c) Stunden + Korrektur, Kalender-Spalte nur Chef
      const h = await ev(page, () => hoursOf({ in: '2026-11-08T06:00:00Z', out: '2026-11-08T14:30:00Z' }));
      if (h !== 8.5) p.push('(c) hoursOf 06:00–14:30 = ' + h);
      await switchRole(page, 'chef');
      const c = await ev(page, async pid => {
        await appendProtected('zeit:2026-11', { id: 'k1', person: 'Max', projekt: pid, in: '2026-11-03T06:00:00Z', out: '2026-11-03T14:30:00Z', by: 'Max' });
        await loadZeit();
        const e = state.zeit.find(x => x.id === 'k1');
        await korrigiereZeit(e, { in: '2026-11-03T06:30:00Z', out: '2026-11-03T14:30:00Z', grund: 'Pause' });
        await loadZeit();
        state.view = 'calendar'; state.dpWeek = weekStartISO('2026-11-03'); render();   // Dispo zeigt eine Woche
        const el = [...document.querySelectorAll('.cal-hours')].map(x => x.textContent).join(' | ');
        return { h: hoursOf(state.zeit.find(x => x.id === 'k1')), el };
      }, bv.id);
      if (c.h !== 8) p.push('(c) korrigiert ≠ 8,0: ' + c.h);
      if (!/8,0/.test(c.el) || !/korrigiert/.test(c.el)) p.push('(c) Kalender zeigt Stunden nicht: ' + c.el.slice(0, 120));
      await shot(page, 'zeit', 'chef-kalender', 390, false);
      const rb = await ev(page, pid => { state.view = 'app'; state.chefTab = 'bauvorhaben'; state.chefProjekt = pid; render(); const h = document.getElementById('sec-regie'); return !!h && /8,0/.test(h.parentElement.textContent); }, bv.id);
      if (!rb) p.push('(c) Regiebericht im BV fehlt/ohne Stunden');
      await switchRole(page, 'baustelle');
      const d = await ev(page, () => { state.view = 'calendar'; render(); const r = { cls: document.querySelectorAll('.cal-hours').length, txt: /Stunden/.test(document.getElementById('app').innerText) }; state.view = 'app'; render(); return r; });
      if (d.cls || d.txt) p.push('(d) Nicht-Chef sieht Stunden im Kalender');
      return errs(errors, p);
    },
    // Task 9: Prüfprotokoll + QR-Freigabe
    pruefung: async ({ page, context, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      const btn = await page.$('[data-action="pruef-open"]');
      if (!btn) { p.push('kein Knopf für das Prüfprotokoll bei der Baustelle'); return errs(errors, p); }
      await btn.click();
      const pid = await ev(page, () => state.pruefDraft.projekt);
      const n0 = await ev(page, pid => (state.projects.find(x => x.id === pid).pruefungen || []).length, pid);
      const ks = await ev(page, () => [...document.querySelectorAll('[data-action="pp-toggle"]')].map(b => b.dataset.k));
      for (const k of ks) await page.click('[data-action="pp-toggle"][data-k="' + k + '"]');
      await page.click('[data-action="pruef-save"][data-erg="frei"]'); await page.waitForTimeout(300);
      const noFoto = await ev(page, pid => ({ warn: (state.pruefDraft || {}).warn || '', n: (state.projects.find(x => x.id === pid).pruefungen || []).length }), pid);
      if (!/Foto/.test(noFoto.warn) || noFoto.n !== n0) p.push('ohne Foto nicht gesperrt: ' + JSON.stringify(noFoto));
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkYGBgYAAAeAQH/5o7nAAAAAElFTkSuQmCC', 'base64');
      await (await page.$('input[type=file][data-pruef="1"]')).setInputFiles({ name: 'g.png', mimeType: 'image/png', buffer: png });
      await page.waitForFunction(() => state.pruefDraft && state.pruefDraft.fotoIds.length > 0, null, { timeout: 8000 }).catch(() => {});
      await page.click('[data-action="pruef-save"][data-erg="frei"]'); await page.waitForTimeout(600);
      const r = await ev(page, async pid => {
        const pr = state.projects.find(x => x.id === pid), last = (pr.pruefungen || []).slice(-1)[0];
        printAushang(pid);
        const img = document.querySelector('#printArea img.qr');
        return { erg: last && last.ergebnis, fotos: last && last.fotoIds.length, token: pr.freigabeToken, qr: !!img && /^data:image/.test(img.src) };
      }, pid);
      if (r.erg !== 'frei' || !r.fotos || !r.token) p.push('Protokoll nicht gespeichert: ' + JSON.stringify(r));
      if (!r.qr) p.push('Aushang ohne QR-Bild');
      await page.waitForFunction(t => (localStorage.getItem('demo-state') || '').includes(t), r.token, { timeout: 8000 }).catch(() => {});  // gespeichert, bevor die öffentliche Seite liest
      const pub = await context.newPage();
      await pub.goto('file://' + require('path').resolve(__dirname, '..', 'freigabe.html') + '?t=' + r.token + '&demo=1');
      await pub.waitForFunction(() => document.getElementById('status').textContent !== '…', null, { timeout: 8000 }).catch(() => {});
      const txt = await pub.evaluate(() => document.body.innerText);
      if (!/freigegeben/i.test(txt) || !new RegExp('BV ' + pid).test(txt)) p.push('Freigabe-Seite zeigt Status nicht: ' + txt.slice(0, 100));
      if (/Max|Jochen|Ludwig|Chefin/.test(txt)) p.push('Freigabe-Seite zeigt Namen');
      await shot(page, 'pruefung', 'baustelle', 390, false);
      return errs(errors, p);
    },
    // Task 9: Unterweisungen
    unterweisung: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      const id = await ev(page, () => createUnterweisung('Leitergang sichern', 'Immer Luke schließen.'));
      if (!id) { p.push('Unterweisung nicht angelegt'); return errs(errors, p); }
      await switchRole(page, 'fahrer');
      const card = await page.$('.uw-card [data-action="uw-ok"]');
      if (!card) { p.push('Fahrer sieht keine Unterweisung'); return errs(errors, p); }
      for (let n = 0; n < 5 && await page.$('.uw-card [data-action="uw-ok"]'); n++) { await page.click('.uw-card [data-action="uw-ok"]'); await page.waitForTimeout(500); }
      const gone = await ev(page, id => !document.querySelector('.uw-card') && ((state.uwBest || {})[id] || []).some(e => e.person === 'Ludwig'), id);
      if (!gone) p.push('Karte nach Bestätigen noch sichtbar');
      await switchRole(page, 'chef');
      const r = await ev(page, () => { state.chefTab = 'personal'; render(); const el = document.getElementById('sec-uw'); return el ? el.parentElement.textContent : ''; });
      if (!/1 \/ \d/.test(r) || !/Ludwig/.test(r)) p.push('Chef sieht Bestätigung nicht: ' + r.slice(0, 160));
      return errs(errors, p);
    },
    // Task 10: Reihenfolge vorschlagen (OSRM ist im Test gesperrt -> Rückfall nächster Nachbar)
    reihenfolge: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'fahrer');
      const r = await ev(page, async () => {
        const out = await orderStops({ lat: 48.0, lon: 11.0 }, [{ id: 'c', lat: 48.03, lon: 11.0 }, { id: 'a', lat: 48.01, lon: 11.0 }, { id: 'b', lat: 48.02, lon: 11.0 }]);
        return out.map(x => x.id).join('');
      });
      if (r !== 'abc') p.push('Reihenfolge (Rückfall): ' + r + ' (erwartet abc)');
      // Oberfläche: zwei Bestellungen in der Tour -> Knopf -> Nummern + Google-Maps-Link
      const ui = await ev(page, async () => {
        const ids = state.orders.filter(o => (o.status === 'Bereit zur Abholung' || o.status === 'Beladen') && o.projekt).map(o => o.id).slice(0, 2);
        state.tourSel = ids; state.fahrerTab = 'lieferungen'; render();
        const b = document.querySelector('[data-action="tour-order"]'); if (!b) return { btn: false };
        b.click(); await new Promise(r => setTimeout(r, 1500));
        return { btn: true, order: (state.tourOrder || []).length, badges: document.querySelectorAll('.stop-badge').length, maps: !!document.querySelector('a.tour-maps[href*="google.com/maps/dir"]') };
      });
      if (!ui.btn || ui.order < 2 || ui.badges < 2 || !ui.maps) p.push('Tour-Reihenfolge in der Oberfläche: ' + JSON.stringify(ui));
      await shot(page, 'reihenfolge', 'fahrer', 390, false);
      return errs(errors, p);
    },
    // Task 10: Fahrtenliste
    fahrten: async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      const r = await ev(page, async () => {
        const pr = state.projects.find(x => x.aktiv && x.coords);
        const now = new Date(), ts = now.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        state.orders.push({ id: 9801, projekt: pr.id, person: 'Max', status: 'Geliefert', fahrer: 'Ludwig', items: [{ id: 'anker', name: 'Anker', unit: 'Stk', qty: 2 }], time: ts, steps: { Geliefert: now.toISOString() } });
        state.orders.push({ id: 9802, projekt: pr.id, person: 'Max', status: 'Geliefert', fahrer: 'Kemal', items: [{ id: 'anker', name: 'Anker', unit: 'Stk', qty: 2 }], time: ts, steps: { Geliefert: now.toISOString() } });
        const rows = await fahrtenData('month');
        const mine = rows.filter(x => x.id === 9801 || x.id === 9802);
        const btn = !!document.querySelector('[data-action="fahrten-open"]');
        return { n: mine.length, km: mine.map(x => x.km), fahrer: mine.map(x => x.fahrer).sort().join(','), btn, csv: fahrtenCSV(rows).split('\n')[0] };
      });
      if (r.n !== 2 || !r.km.every(k => k > 0)) p.push('Fahrtenliste: ' + JSON.stringify(r));
      if (r.fahrer !== 'Kemal,Ludwig') p.push('Fahrer fehlen: ' + r.fahrer);
      if (!r.btn) p.push('kein Knopf „Fahrtenliste“ beim Chef');
      if (!/^﻿?Datum;Fahrer;Bestellung;Bauvorhaben;km/.test(r.csv)) p.push('CSV-Kopf: ' + r.csv);
      return errs(errors, p);
    },
    // Gesamtprüfung: Funde I2, I3, I4, I5, I7, I9
    'review-fixes': async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'baustelle');
      // I2: Ladefehler darf vorhandene Zeiten/Bestätigungen nicht löschen
      const i2 = await ev(page, async () => {
        await loadZeit(); await loadUwBest();
        const z0 = state.zeit.length, u0 = JSON.stringify(state.uwBest);
        const orig = supabaseClient.rpc;
        supabaseClient.rpc = async (fn, a) => (fn === 'prot_read' ? { data: null, error: { message: 'kein Netz' } } : orig(fn, a));
        await loadZeit(); await loadUwBest();
        supabaseClient.rpc = orig;
        return { z0, z1: state.zeit.length, same: JSON.stringify(state.uwBest) === u0 };
      });
      if (!i2.z0 || i2.z1 !== i2.z0 || !i2.same) p.push('I2 Ladefehler löscht Daten: ' + JSON.stringify(i2));
      // I3: Abfragen alle 4 s nur aktueller + Vormonat (nicht die ganze Historie)
      const i3 = await ev(page, async () => {
        const seen = []; const orig = supabaseClient.rpc;
        supabaseClient.rpc = async (fn, a) => { if (fn === 'prot_read') seen.push(a.p_prefix); return orig(fn, a); };
        await loadShared();
        supabaseClient.rpc = orig;
        return seen;
      });
      if (i3.includes('zeit:') || !i3.some(x => /^zeit:\d{4}-\d{2}$/.test(x))) p.push('I3 Abfrage-Präfixe: ' + i3.join(','));
      // I4: zwei Geräte legen je ein Prüfprotokoll an -> beide bleiben
      const i4 = await ev(page, () => {
        const base = { projects: [{ id: 101, pruefungen: [{ id: 1, ergebnis: 'frei' }] }] };
        const l = { projects: [{ id: 101, pruefungen: [{ id: 1, ergebnis: 'frei' }, { id: 2, ergebnis: 'gesperrt' }] }] };
        const r = { projects: [{ id: 101, pruefungen: [{ id: 1, ergebnis: 'frei' }, { id: 3, ergebnis: 'frei' }] }] };
        return merge3(base, l, r).value.projects[0].pruefungen.map(x => x.id).sort().join(',');
      });
      if (i4 !== '1,2,3') p.push('I4 Prüfprotokolle zusammengeführt: ' + i4);
      // I5: Foto-Nummern kollidieren nicht zwischen Geräten (keine Umnummerierung)
      const i5 = await ev(page, async () => {
        const c = document.createElement('canvas'); c.width = 10; c.height = 10; const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = await takePhotoFromFile(new File([blob], 'x.png', { type: 'image/png' }), 101, 'vorher');
        const m = merge3({ fotos: [] }, { fotos: [{ id: 'fa', path: 'a' }] }, { fotos: [{ id: 'fb', path: 'b' }] }).value.fotos.map(x => x.id).sort().join(',');
        return { type: typeof (f && f.id), m };
      });
      if (i5.type !== 'string' || i5.m !== 'fa,fb') p.push('I5 Foto-Ids: ' + JSON.stringify(i5));
      // I7: abgelaufene/fehlgeschlagene Foto-Links werden neu geholt
      const i7 = await ev(page, async () => {
        const f = state.fotos.find(x => x.projekt === 101);
        fotoUrlCache[f.path] = { url: 'alt', exp: Date.now() - 1000 };
        await refreshFotoUrls();
        const e = fotoUrlCache[f.path];
        return { isObj: !!e && typeof e === 'object', renewed: !!e && e.url !== 'alt' && e.exp > Date.now() };
      });
      if (!i7.isObj || !i7.renewed) p.push('I7 Foto-Links: ' + JSON.stringify(i7));
      // I9: neue Knöpfe mind. 48 px hoch
      const h = async sel => ev(page, s => Math.min(...[...document.querySelectorAll(s)].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height), 999), sel);
      const small = [];
      for (const s of ['.fotos-btns .mini-btn']) { const v = await h(s); if (v < 48) small.push(s + '=' + Math.round(v)); }
      await switchRole(page, 'chef');
      for (const s of ['.export-row .mini-btn']) { const v = await h(s); if (v < 48) small.push(s + '=' + Math.round(v)); }
      await switchRole(page, 'lager');
      await ev(page, () => { state.lagerTab = 'inventur'; render(); });
      for (const s of ['.inv-extra .mini-btn', '.inv-min-link']) { const v = await h(s); if (v < 48) small.push(s + '=' + Math.round(v)); }
      if (small.length) p.push('I9 Knöpfe unter 48 px: ' + small.join(', '));
      return errs(errors, p);
    },
    // Zurück-Pfeil auf den Kalender-Seiten: zurück zur vorigen Seite + Stelle; Handy-Zurück genauso
    'zurueck': async ({ page, errors }) => {
      const p = [];
      await switchRole(page, 'chef');
      await page.setViewportSize({ width: 390, height: 500 });
      await ev(page, () => { state.chefTab = 'uebersicht'; render(); window.scrollTo(0, 400); });
      await page.waitForTimeout(200);
      const y0 = await ev(page, () => window.scrollY);
      const go = async a => { await ev(page, () => { state.menuOpen = true; render(); }); await page.click(`[data-action="${a}"]`); await page.waitForTimeout(500); };
      await go('go-calendar');
      const a = await ev(page, () => ({ v: state.view, y: window.scrollY, btn: !!document.querySelector('.view-back') }));
      if (a.v !== 'calendar' || !a.btn || a.y > 5) p.push('Kalender ohne Zurück-Knopf/oben: ' + JSON.stringify(a));
      await go('go-lkwkalender');
      await page.click('.view-back'); await page.waitForTimeout(500);
      const b = await ev(page, () => state.view);
      if (b !== 'calendar') p.push('Zurück vom LKW-Kalender führt nicht zum Kalender: ' + b);
      await page.click('.view-back'); await page.waitForTimeout(500);
      const c = await ev(page, () => ({ v: state.view, tab: state.chefTab, y: window.scrollY }));
      if (c.v !== 'app' || c.tab !== 'uebersicht' || Math.abs(c.y - y0) > 40) p.push('Zurück zur App falsch: ' + JSON.stringify({ ...c, y0 }));
      // Handy-Zurück (Browser-Verlauf)
      await go('go-lkwkalender');
      await page.goBack(); await page.waitForTimeout(500);
      const d = await ev(page, () => ({ v: state.view, y: window.scrollY }));
      if (d.v !== 'app' || Math.abs(d.y - y0) > 40) p.push('Handy-Zurück falsch: ' + JSON.stringify({ ...d, y0 }));
      const h = await ev(page, () => document.querySelector('.view-back') ? 1 : 0);
      if (h) p.push('Zurück-Knopf in der App sichtbar');
      return errs(errors, p);
    },
  };
};

