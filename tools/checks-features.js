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
  };
};
