/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Test dell'invio punteggio burraco: atomico e idempotente. Niente database, niente
 * server: un finto store con semantica TRANSAZIONALE (commit/rollback) che modella
 * `claim` come l'UPDATE condizionale `WHERE submitted=false` e `addToPair` come
 * l'UPDATE atomico dei totali.
 *   node --test src/routes/gestione-burraco-atomic-lib.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { submitScoreOnce, type ScoreTx, type ScoreAssignment } from "./gestione-burraco-atomic-lib.ts";

/* Finto "mondo" del burraco: lo stato (submitted + totali coppie) è COMMESSO solo a
   fine transazione. `crashAfterClaim` fa lanciare dentro `addToPair` per simulare un
   crash dopo aver marcato submitted ma prima di aggiornare i totali. */
function makeWorld(init?: { submitted?: boolean; totals?: Record<string, number> }) {
  const committed = { submitted: init?.submitted ?? false, totals: { ...(init?.totals ?? {}) } };
  let crashAfterClaim = false;

  async function runTx<T>(fn: (tx: ScoreTx) => Promise<T>): Promise<T> {
    const pending = { submitted: committed.submitted, totals: { ...committed.totals } };
    const tx: ScoreTx = {
      // UPDATE … WHERE submitted=false RETURNING: marca solo se non ancora inviato.
      claim: async (_aid, _sA, _sB) => {
        if (pending.submitted) return false;
        pending.submitted = true;
        return true;
      },
      addToPair: async (pairId, delta) => {
        if (crashAfterClaim) throw new Error("crash dopo il claim, prima dei totali");
        pending.totals[pairId] = (pending.totals[pairId] ?? 0) + delta;
      },
    };
    const r = await fn(tx);                              // se lancia ⇒ rollback (pending scartato)
    committed.submitted = pending.submitted;
    committed.totals = pending.totals;
    return r;
  }
  return { state: committed, runTx, crash: () => { crashAfterClaim = true; }, heal: () => { crashAfterClaim = false; } };
}

const A: ScoreAssignment = { id: "a1", pairAId: "PA", pairBId: "PB" };

// ── 3) Doppio invio punteggio: conta UNA sola volta ─────────────────────────────
test("burraco /score: doppio invio ⇒ un solo conteggio", async () => {
  const w = makeWorld();
  const first = await w.runTx((tx) => submitScoreOnce(tx, A, 100, 70));
  assert.equal(first, "ok");
  assert.equal(w.state.totals["PA"], 100);
  assert.equal(w.state.totals["PB"], 70);

  // secondo invio della STESSA manche (dopo il commit del primo): già inviato
  const second = await w.runTx((tx) => submitScoreOnce(tx, A, 100, 70));
  assert.equal(second, "already");
  assert.equal(w.state.totals["PA"], 100); // nessun doppio conteggio
  assert.equal(w.state.totals["PB"], 70);
});

// Crash fra claim e addToPair ⇒ rollback: la manche NON resta "inviata" senza
// punteggi, quindi il reinvio è ancora possibile (niente punteggi persi, §7a).
test("burraco /score: crash dopo il claim ⇒ rollback, reinvio possibile", async () => {
  const w = makeWorld();
  w.crash();
  await assert.rejects(() => w.runTx((tx) => submitScoreOnce(tx, A, 100, 70)), /crash dopo il claim/);
  assert.equal(w.state.submitted, false);        // NON marcata (rollback)
  assert.equal(w.state.totals["PA"], undefined); // niente totali applicati

  // il tavolo può reinviare: ora va a buon fine e conta una volta
  w.heal();
  const retry = await w.runTx((tx) => submitScoreOnce(tx, A, 100, 70));
  assert.equal(retry, "ok");
  assert.equal(w.state.submitted, true);
  assert.equal(w.state.totals["PA"], 100);
  assert.equal(w.state.totals["PB"], 70);
});

test("burraco /score: la coppia in riposo (pairB null) non viene conteggiata", async () => {
  const w = makeWorld();
  const bye: ScoreAssignment = { id: "a2", pairAId: "PA", pairBId: null };
  const r = await w.runTx((tx) => submitScoreOnce(tx, bye, 80, 0));
  assert.equal(r, "ok");
  assert.equal(w.state.totals["PA"], 80);
  assert.equal(Object.prototype.hasOwnProperty.call(w.state.totals, "null"), false);
});
