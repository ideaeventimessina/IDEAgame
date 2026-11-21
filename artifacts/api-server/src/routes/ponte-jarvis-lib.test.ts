/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Ponte Jarvis — logica pura: chiave (fail-closed, tempo costante), traduzione
 * delle puntate del contratto nei tipi del casinò e PAGAMENTI con le regole del
 * casinò (PAYOUT/betWins dell'atomic-lib, nessun motore nuovo).
 *   node --test src/routes/ponte-jarvis-lib.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controllaChiave, traduciPuntate, coloreItaliano, numeroPari, CATALOGO_JARVIS,
  MAX_PUNTATE, statoJarvis, type PuntataJarvis,
} from "./ponte-jarvis-lib.ts";
import { rouletteCredit, rouletteColor, rouletteWinMoves } from "./gestione-casino-atomic-lib.ts";

const una = (raw: unknown): PuntataJarvis => {
  const t = traduciPuntate([raw]);
  assert.ok(t.ok, JSON.stringify(t));
  return t.puntate[0]!;
};
const vincita = (raw: unknown, r: number): number => {
  const p = una(raw);
  return rouletteCredit(p.kind, p.numbers, p.fiche, r);
};

/* ── Chiave ─────────────────────────────────────────────────────────────── */
test("chiave: senza Secret → 503 con il nome del Secret (fail-closed)", () => {
  for (const conf of [undefined, "", "   "]) {
    const e = controllaChiave("qualsiasi", conf);
    assert.equal(e.ok, false);
    if (!e.ok) { assert.equal(e.status, 503); assert.equal(e.body.secretMancante, "JARVIS_PONTE_KEY"); }
  }
});
test("chiave: sbagliata, vuota o di lunghezza diversa → 401; giusta → ok", () => {
  for (const r of ["sbagliata", "", undefined, "giust", "giusta1", ["altra"]]) {
    const e = controllaChiave(r, "giusta");
    assert.equal(e.ok, false);
    if (!e.ok) assert.equal(e.status, 401);
  }
  assert.equal(controllaChiave("giusta", " giusta ").ok, true);
});

/* ── Pagamenti: regole del casinò ───────────────────────────────────────── */
test("numero pieno 35:1 → vincita 36× la posta (posta restituita inclusa)", () => {
  assert.equal(vincita({ tipo: "numero", valore: 17, fiche: 10 }, 17), 360);
  assert.equal(vincita({ tipo: "numero", valore: 17, fiche: 10 }, 18), 0);
  assert.equal(vincita({ tipo: "numero", valore: 0, fiche: 5 }, 0), 180);
});
test("colori: rosso/nero 1:1 → 2×", () => {
  assert.equal(vincita({ tipo: "rosso", fiche: 10 }, 1), 20);   // 1 è rosso
  assert.equal(vincita({ tipo: "rosso", fiche: 10 }, 2), 0);    // 2 è nero
  assert.equal(vincita({ tipo: "nero", fiche: 10 }, 2), 20);
  assert.equal(vincita({ tipo: "nero", fiche: 10 }, 32), 0);    // 32 è rosso
  assert.equal(coloreItaliano(rouletteColor(17)), "nero");
  assert.equal(coloreItaliano(rouletteColor(32)), "rosso");
  assert.equal(coloreItaliano(rouletteColor(0)), "verde");
});
test("pari/dispari, manque (1–18) e passe (19–36) 1:1", () => {
  assert.equal(vincita({ tipo: "pari", fiche: 10 }, 18), 20);
  assert.equal(vincita({ tipo: "dispari", fiche: 10 }, 18), 0);
  assert.equal(vincita({ tipo: "dispari", fiche: 10 }, 35), 20);
  assert.equal(vincita({ tipo: "manque", fiche: 10 }, 18), 20);
  assert.equal(vincita({ tipo: "manque", fiche: 10 }, 19), 0);
  assert.equal(vincita({ tipo: "passe", fiche: 10 }, 19), 20);
  assert.equal(vincita({ tipo: "passe", fiche: 10 }, 36), 20);
});
test("dozzine 2:1 → 3×", () => {
  assert.equal(vincita({ tipo: "dozzina", valore: 1, fiche: 10 }, 12), 30);
  assert.equal(vincita({ tipo: "dozzina", valore: 2, fiche: 10 }, 13), 30);
  assert.equal(vincita({ tipo: "dozzina", valore: 3, fiche: 10 }, 36), 30);
  assert.equal(vincita({ tipo: "dozzina", valore: 1, fiche: 10 }, 13), 0);
});
test("colonne 2:1 → 3× (col1 = 1,4,…,34; col2 = 2,5,…,35; col3 = 3,6,…,36)", () => {
  assert.equal(vincita({ tipo: "colonna", valore: 1, fiche: 10 }, 34), 30);
  assert.equal(vincita({ tipo: "colonna", valore: 2, fiche: 10 }, 35), 30);
  assert.equal(vincita({ tipo: "colonna", valore: 3, fiche: 10 }, 36), 30);
  assert.equal(vincita({ tipo: "colonna", valore: 3, fiche: 10 }, 35), 0);
});
test("lo zero fa perdere TUTTE le puntate esterne", () => {
  const esterne = [
    { tipo: "rosso", fiche: 10 }, { tipo: "nero", fiche: 10 },
    { tipo: "pari", fiche: 10 }, { tipo: "dispari", fiche: 10 },
    { tipo: "manque", fiche: 10 }, { tipo: "passe", fiche: 10 },
    { tipo: "dozzina", valore: 1, fiche: 10 }, { tipo: "dozzina", valore: 2, fiche: 10 }, { tipo: "dozzina", valore: 3, fiche: 10 },
    { tipo: "colonna", valore: 1, fiche: 10 }, { tipo: "colonna", valore: 2, fiche: 10 }, { tipo: "colonna", valore: 3, fiche: 10 },
  ];
  for (const b of esterne) assert.equal(vincita(b, 0), 0, JSON.stringify(b));
  assert.equal(numeroPari(0), false);
  assert.equal(numeroPari(18), true);
  assert.equal(numeroPari(17), false);
});
test("il pagamento del ponte coincide con quello del tavolo (rouletteWinMoves)", () => {
  const t = traduciPuntate([
    { tipo: "numero", valore: 17, fiche: 10 }, { tipo: "nero", fiche: 20 }, { tipo: "dozzina", valore: 2, fiche: 5 }, { tipo: "pari", fiche: 7 },
  ]);
  assert.ok(t.ok);
  for (let r = 0; r <= 36; r++) {
    const bets = t.puntate.map((p) => ({ playerId: "J", kind: p.kind, numbers: p.numbers, amount: p.fiche }));
    const dalTavolo = rouletteWinMoves(bets, r).reduce((s, m) => s + m.delta, 0);
    const dalPonte = t.puntate.reduce((s, p) => s + rouletteCredit(p.kind, p.numbers, p.fiche, r), 0);
    assert.equal(dalPonte, dalTavolo, `r=${r}`);
  }
});

/* ── Validazione puntate ────────────────────────────────────────────────── */
test("puntate: assenti = solo giro; errori chiari; tutto o niente", () => {
  assert.deepEqual(traduciPuntate(undefined), { ok: true, puntate: [] });
  assert.deepEqual(traduciPuntate([]), { ok: true, puntate: [] });
  for (const bad of [
    "x",
    [{ tipo: "cavallo", valore: 1, fiche: 10 }],
    [{ tipo: "numero", valore: 37, fiche: 10 }],
    [{ tipo: "numero", fiche: 10 }],
    [{ tipo: "dozzina", valore: 4, fiche: 10 }],
    [{ tipo: "colonna", valore: 0, fiche: 10 }],
    [{ tipo: "rosso", fiche: 0 }],
    [{ tipo: "rosso", fiche: 2.5 }],
    [{ tipo: "rosso", fiche: -10 }],
    [{ tipo: "rosso", fiche: 10 }, { tipo: "boh", fiche: 1 }],
    Array.from({ length: MAX_PUNTATE + 1 }, () => ({ tipo: "rosso", fiche: 1 })),
  ]) {
    assert.equal(traduciPuntate(bad).ok, false, JSON.stringify(bad).slice(0, 80));
  }
  assert.deepEqual(una({ tipo: "Colonna", valore: "2", fiche: 3 }), { tipo: "colonna", valore: 2, fiche: 3, kind: "col2", numbers: [] });
});

test("catalogo skill nel formato del contratto", () => {
  assert.equal(CATALOGO_JARVIS.sistema, "IDEAgame");
  assert.deepEqual(CATALOGO_JARVIS.azioni.map((a) => a.percorso), [
    "/api/ponte/jarvis/roulette/giro", "/api/ponte/jarvis/roulette/:partita", "/api/ponte/jarvis/stato", "/api/ponte/jarvis/skill",
  ]);
  for (const a of CATALOGO_JARVIS.azioni) assert.ok(a.effetti === "lettura" || a.effetti === "scrittura");
});

test("stato: formato del contratto (sistema, ok, riassunto in italiano, numeri)", () => {
  const vuoto = statoJarvis({ partite: 0, giriTotali: 0, ultimaPartita: null, saldoUltimaPartita: null, ultimiNumeri: [] });
  assert.equal(vuoto.sistema, "IDEAgame");
  assert.equal(vuoto.ok, true);
  assert.match(vuoto.riassunto, /Nessuna partita/);
  const pieno = statoJarvis({ partite: 2, giriTotali: 7, ultimaPartita: "abc", saldoUltimaPartita: 950, ultimiNumeri: [17, 0, 32] });
  assert.match(pieno.riassunto, /2 partite, 7 giri/);
  assert.match(pieno.riassunto, /950 fiche/);
  assert.match(pieno.riassunto, /17, 0, 32/);
  assert.equal(pieno.numeri.giriTotali, 7);
});
