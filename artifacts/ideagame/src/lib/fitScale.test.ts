/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Test del fit-to-screen dei tabelloni HOME — riproduce il bug TV (Andrea "spariscono i
   tasti in basso") e prova l'invariante del fix: a differenza del vecchio tvZoom (solo
   larghezza, fino a 1.5x), il contenuto scalato RIENTRA sempre in altezza → i pulsanti in
   basso restano visibili. Logica pura, nessun DOM.
     node --test src/lib/fitScale.test.ts
*/

import test from "node:test";
import assert from "node:assert/strict";
import { computeFitScale } from "./fitScale.ts";

// Il vecchio comportamento rotto, per confronto: scala SOLO sulla larghezza (bug).
function oldWidthOnlyZoom(vw: number): number {
  return Math.min(1.5, Math.max(1, vw / 1180));
}

test("BUG riprodotto: il vecchio zoom solo-larghezza fa traboccare l'altezza su una TV", () => {
  // TV 1920x1080, tabellone naturale 1180x950 (tipico: header+contenuto+pulsanti).
  const zoom = oldWidthOnlyZoom(1920); // = 1.5
  const scaledH = 950 * zoom;          // 1425 px
  assert.ok(scaledH > 1080, "il vecchio zoom rende il tabellone più alto dello schermo (tasti tagliati)");
});

test("FIX: su TV 1920x1080 il contenuto scalato NON supera mai l'altezza disponibile", () => {
  const boxW = 1920, boxH = 1000; // area utile dopo top-bar/score-bar
  for (const natH of [500, 700, 900, 1000, 1100, 1300]) {
    const s = computeFitScale(boxW, boxH, 1180, natH);
    assert.ok(1180 * s <= boxW + 0.5, `larghezza eccede a natH=${natH}`);
    assert.ok(natH * s <= boxH + 0.5, `ALTEZZA eccede (tasti tagliati) a natH=${natH}: ${natH * s} > ${boxH}`);
  }
});

test("FIX: su TV 1280x720 (720p) i tasti restano dentro in entrambe le dimensioni", () => {
  const boxW = 1280, boxH = 650;
  for (const natH of [400, 650, 800, 950]) {
    const s = computeFitScale(boxW, boxH, 1180, natH);
    assert.ok(natH * s <= boxH + 0.5, `ALTEZZA eccede a natH=${natH}`);
    assert.ok(1180 * s <= boxW + 0.5, `larghezza eccede a natH=${natH}`);
  }
});

test("un tabellone piccolo viene comunque ingrandito per riempire la TV (fino a maxScale)", () => {
  const s = computeFitScale(1920, 1000, 1180, 400); // molto basso
  assert.ok(s > 1, "un tabellone corto deve ingrandirsi per usare lo schermo");
  assert.ok(s <= 1.5, "ma non oltre maxScale");
});

test("rispetta maxScale e minScale", () => {
  assert.equal(computeFitScale(100000, 100000, 1180, 1180, { maxScale: 1.5 }), 1.5);
  assert.equal(computeFitScale(10, 10, 1180, 1180, { minScale: 0.3 }), 0.3);
});

test("dimensioni non valide → scala neutra 1 (nessun crash prima della misura)", () => {
  assert.equal(computeFitScale(0, 0, 0, 0), 1);
  assert.equal(computeFitScale(1920, 1080, 1180, 0), 1);
});
