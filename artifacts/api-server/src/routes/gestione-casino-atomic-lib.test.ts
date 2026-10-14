/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Test della MECCANICA atomica/idempotente dei soldi del casinò. Niente database,
 * niente server: un finto store in-memory con semantica TRANSAZIONALE (le scritture
 * valgono solo a commit; se il callback lancia, rollback totale) — esattamente la
 * garanzia su cui si appoggiano `moveFish`/`mutateSession` sopra `db.transaction`.
 *   node --test src/routes/gestione-casino-atomic-lib.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type FishTx, type FishMove,
  payAll, rouletteWinMoves, rouletteCanSpin, alreadySettled, putTable,
} from "./gestione-casino-atomic-lib.ts";

type RTable = { phase: string; bets: Array<{ playerId: string; kind: string; numbers: number[]; amount: number }>; result: number | null };

/* Finto "mondo" dei soldi + stato tavolo, con transazione a commit/rollback — il
   modello di `mutateSession`+`moveFish`: lo stato (saldi, ledger e il tavolo nel
   config jsonb) vive in una BOZZA e viene committato solo se il callback NON lancia
   e chiede `save`. `pay` applica prima il saldo e POI il ledger: `crashAtPay` fa
   lanciare FRA i due, così un crash tra update-saldo e insert-ledger annulla TUTTO. */
function makeWorld(initial: Record<string, number>, initialTable?: RTable) {
  const committed = {
    balances: { ...initial } as Record<string, number>,
    ledger: [] as Array<{ playerId: string; delta: number; kind: string; balanceAfter: number }>,
    table: initialTable ? structuredClone(initialTable) : null,
  };
  let crashAtPay: number | null = null;

  async function runTx<T>(fn: (tx: FishTx, draftTable: RTable) => Promise<{ save: boolean; result: T }>): Promise<T> {
    const draftBal = { ...committed.balances };
    const draftLedger: typeof committed.ledger = [];
    const draftTable = committed.table ? structuredClone(committed.table) : ({} as RTable);
    let n = 0;
    const tx: FishTx = {
      pay: async (m: FishMove) => {
        const cur = draftBal[m.playerId];
        if (cur == null) return null;
        if (m.requireFunds && cur + m.delta < 0) return null;   // guard anti-scoperto atomico
        const nb = cur + m.delta;
        draftBal[m.playerId] = nb;                              // (1) UPDATE saldo
        n += 1;
        if (crashAtPay === n) throw new Error("crash simulato tra update saldo e ledger");
        draftLedger.push({ playerId: m.playerId, delta: m.delta, kind: m.kind, balanceAfter: nb }); // (2) ledger
        return nb;
      },
    };
    const { save, result } = await fn(tx, draftTable);   // se lancia ⇒ rollback totale
    committed.balances = draftBal;                       // i saldi si committano a fine tx (no-throw)
    committed.ledger.push(...draftLedger);
    if (save && committed.table) committed.table = draftTable; // il config si riscrive solo se richiesto
    return result;
  }
  return {
    get balances() { return committed.balances; },
    get ledger() { return committed.ledger; },
    get table() { return committed.table; },
    runTx,
    crashNext: (k: number) => { crashAtPay = k; },
    noCrash: () => { crashAtPay = null; },
  };
}

/* Replica ESATTA della logica di /spin: idempotente (solo se phase==="betting"),
   paga i vincitori e passa a "result" nella stessa transazione, persistendo il
   tavolo solo a buon fine. */
async function spin(world: ReturnType<typeof makeWorld>, r: number) {
  return world.runTx(async (tx, table) => {
    if (!rouletteCanSpin(table.phase)) return { save: false, result: { alreadySpun: true, number: table.result } };
    table.phase = "result"; table.result = r;
    await payAll(tx, rouletteWinMoves(table.bets, r));
    return { save: true, result: { alreadySpun: false, number: r } };
  });
}

// ── 1) SPIN idempotente: un secondo /spin NON ripaga ────────────────────────────
test("roulette /spin: idempotente — doppio spin paga UNA sola volta", async () => {
  // A punta 10 sul rosso; esce il 3 (rosso) ⇒ accredito 10*(1+1)=20.
  const world = makeWorld({ A: 100 }, { phase: "betting", bets: [{ playerId: "A", kind: "red", numbers: [], amount: 10 }], result: null });

  const first = await spin(world, 3);
  assert.equal(first.alreadySpun, false);
  assert.equal(world.balances["A"], 120);
  assert.equal(world.ledger.length, 1);

  const second = await spin(world, 7); // retry/doppio-click sullo stesso giro
  assert.equal(second.alreadySpun, true);
  assert.equal(world.balances["A"], 120);     // nessun secondo pagamento
  assert.equal(world.ledger.length, 1);
  assert.equal(world.table!.result, 3);       // il numero del 1° giro resta quello
});

test("roulette /spin: il perdente non viene pagato (quote invariate)", async () => {
  const world = makeWorld({ A: 100 }, { phase: "betting", bets: [{ playerId: "A", kind: "black", numbers: [], amount: 10 }], result: null });
  await spin(world, 3); // 3 è rosso ⇒ la puntata sul nero perde
  assert.equal(world.balances["A"], 100);
  assert.equal(world.ledger.length, 0);
});

// ── 2) Crash fra UPDATE saldo e INSERT ledger ⇒ rollback totale ─────────────────
test("pagamento: crash tra update saldo e ledger ⇒ niente movimento parziale", async () => {
  const world = makeWorld({ A: 100 }, { phase: "betting", bets: [{ playerId: "A", kind: "red", numbers: [], amount: 10 }], result: null });
  world.crashNext(1); // crash dentro la 1ª pay, dopo il saldo ma prima del ledger
  await assert.rejects(() => spin(world, 3), /crash simulato/);
  // rollback: saldo invariato, nessuna riga di ledger, fase ancora "betting"
  assert.equal(world.balances["A"], 100);
  assert.equal(world.ledger.length, 0);
  assert.equal(world.table!.phase, "betting");

  // retry pulito: paga esattamente una volta e saldo e ledger restano allineati
  world.noCrash();
  await spin(world, 3);
  assert.equal(world.balances["A"], 120);
  assert.equal(world.ledger.length, 1);
  assert.equal(world.ledger[0]!.balanceAfter, 120);
});

test("pagamenti multipli: crash a metà loop ⇒ nessun vincitore pagato a metà", async () => {
  const world = makeWorld({ A: 100, B: 100 }, { phase: "betting", result: null, bets: [
    { playerId: "A", kind: "red", numbers: [], amount: 10 },
    { playerId: "B", kind: "red", numbers: [], amount: 10 },
  ] });
  world.crashNext(2); // crash sul 2° pagamento
  await assert.rejects(() => spin(world, 3), /crash simulato/);
  assert.equal(world.balances["A"], 100); // il 1° NON resta pagato (rollback)
  assert.equal(world.balances["B"], 100);
  assert.equal(world.ledger.length, 0);
});

test("uscita atomica: requireFunds impedisce lo scoperto senza scrivere ledger", async () => {
  const world = makeWorld({ A: 5 });
  const bal = await world.runTx(async (tx) => {
    const r = await tx.pay({ playerId: "A", delta: -10, kind: "roulette_bet", requireFunds: true });
    return { save: false, result: r };
  });
  assert.equal(bal, null);            // niente righe toccate
  assert.equal(world.balances["A"], 5);
  assert.equal(world.ledger.length, 0);
});

// ── 3) Idempotenza mano/corsa (settledHand/settledRace) ─────────────────────────
test("alreadySettled: la stessa mano/corsa si salda una volta sola", () => {
  assert.equal(alreadySettled(undefined, 1), false); // mai saldata
  assert.equal(alreadySettled(1, 1), true);          // già saldata questo round
  assert.equal(alreadySettled(1, 2), false);         // nuovo round
  assert.equal(alreadySettled(null, 1), false);
});

// ── 4) Due tavoli concorrenti della STESSA serata: niente sovrascrittura ─────────
test("save config serializzato (lock): due tavoli della stessa serata si preservano", () => {
  // Stato di partenza della serata: c'è solo il Tavolo 1.
  const base = { gameTables: { T1: { id: "T1", bets: 1 } } } as Record<string, unknown>;

  // SOTTO LOCK: le due operazioni sono serializzate ⇒ la seconda rilegge il config
  // FRESCO (con T2) e aggiunge/modifica T1. Risultato: entrambe presenti.
  let cfg = base;
  cfg = putTable(cfg, "gameTables", { id: "T2", bets: 5 });            // op A (aggiunge T2)
  cfg = putTable(cfg, "gameTables", { id: "T1", bets: 9 } as never);   // op B su config fresco
  const locked = cfg["gameTables"] as Record<string, { bets: number }>;
  assert.deepEqual(Object.keys(locked).sort(), ["T1", "T2"]);
  assert.equal(locked["T1"]!.bets, 9);
  assert.equal(locked["T2"]!.bets, 5);

  // SENZA LOCK (bug §5): entrambe leggono lo STESSO base e l'ultima scrittura
  // sovrascrive l'altra ⇒ un tavolo va perso.
  const staleA = putTable(base, "gameTables", { id: "T2", bets: 5 });   // legge base
  const staleB = putTable(base, "gameTables", { id: "T1", bets: 9 } as never); // legge base
  void staleA;                                                          // l'ultima vince
  const clobbered = staleB["gameTables"] as Record<string, unknown>;
  assert.deepEqual(Object.keys(clobbered).sort(), ["T1"]);              // T2 perso
});
