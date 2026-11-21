/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Scritture contemporanee nei giochi Home (Percorso a Risate, Karaoke).
   Un "database" in memoria con la stessa semantica del backend vero:
   - VECCHIO modo (com'era prima): leggi game_config → attesa → riscrivi tutto;
   - NUOVO modo: mutaStatoHome (lock di riga + scrittura della sola chiave).
   Le attese simulano la rete/il DB fra lettura e scrittura.
     pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mutaStatoHome, type BackendStatoHome, type Cfg } from "./stato-home.ts";
import { createBlankRisateState, advancePhase, applyBooking, applyVote, sincronizzaGiocatori } from "./risate-engine.ts";
import { createBlankKaraokeState, setMode, setDuration, submitVote, type KaraokeHomeState } from "./karaoke-home-engine.ts";
import type { RisateState } from "@workspace/db";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const casuale = () => Math.floor(Math.random() * 4);

function dbInMemoria(iniziale: Cfg) {
  let riga: Cfg = structuredClone(iniziale);
  let coda: Promise<unknown> = Promise.resolve();
  const backend: BackendStatoHome = {
    // Lock di riga: chi arriva aspetta che la transazione precedente finisca.
    conRigaBloccata(_id, fn) {
      const giro = coda.then(async () => {
        const letto = structuredClone(riga);
        await pausa(casuale());
        return fn(letto, async (chiave, valore) => { await pausa(casuale()); riga = { ...riga, [chiave]: structuredClone(valore) }; });
      });
      coda = giro.catch(() => undefined);
      return giro;
    },
  };
  return {
    backend,
    get riga() { return riga; },
    // Il modo VECCHIO: nessun lock, riscrive tutto game_config dalla copia letta.
    async vecchiaMutazione(chiave: string, fn: (v: unknown) => unknown) {
      const letto = structuredClone(riga);
      await pausa(casuale());
      const nuovo = fn(letto[chiave]);
      await pausa(casuale());
      riga = { ...letto, [chiave]: nuovo };
    },
  };
}

/* Missione 3 (indice 2): booking → active → voting → result, voto a stelle. */
function risateInVotazione(): RisateState {
  const giocatori = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, nickname: `G${i}`, avatarColor: "#fff", score: 0 }));
  let s = sincronizzaGiocatori(createBlankRisateState([], []), giocatori);
  s = { ...s, status: "running", missionIndex: 2, phase: "mission_intro" };
  s = advancePhase(s).state;                                   // booking
  s = applyBooking(s, "p0", "G0", "p0").state;
  s = applyBooking(s, "p1", "G1", "p1").state;
  s = advancePhase(s).state;                                   // active
  s = advancePhase(s).state;                                   // voting
  assert.equal(s.phase, "voting");
  return s;
}
const leggiRisate = (v: unknown) => (v as RisateState | null) ?? null;
const votiDi = (s: RisateState, id: string) => (s.votes[id] ?? []).length;

test("Percorso: 10 voti contemporanei — prima se ne perdevano, ora arrivano tutti", async () => {
  const voti = Array.from({ length: 10 }, (_, i) => `p${i + 2}`);

  const vecchio = dbInMemoria({ risateState: risateInVotazione(), phase: "playing" });
  await Promise.all(voti.map((v) => vecchio.vecchiaMutazione("risateState", (s) => applyVote(s as RisateState, "p0", 5, v).state)));
  assert.ok(votiDi(vecchio.riga["risateState"] as RisateState, "p0") < 10, "il modo vecchio dovrebbe perdere voti");

  const nuovo = dbInMemoria({ risateState: risateInVotazione(), phase: "playing" });
  await Promise.all(voti.map((v) => mutaStatoHome(nuovo.backend, "s1", "risateState", leggiRisate, (s) => {
    const r = applyVote(s!, "p0", 5, v);
    return { salva: r.state, risultato: r.error ?? "ok" };
  })));
  assert.equal(votiDi(nuovo.riga["risateState"] as RisateState, "p0"), 10);
});

test("Percorso: voto in ritardo contro il timer — prima la fase tornava a 'voting', ora resta 'result'", async () => {
  const chiudi = (s: RisateState) => advancePhase(s).state;   // il timer: voting → result
  const votaLento = async (s: RisateState) => applyVote(s, "p0", 4, "p9").state;

  // VECCHIO: il voto legge "voting", il timer chiude, il voto riscrive la copia vecchia.
  const vecchio = dbInMemoria({ risateState: risateInVotazione() });
  const lettoDalVoto = structuredClone(vecchio.riga["risateState"] as RisateState);
  await vecchio.vecchiaMutazione("risateState", (s) => chiudi(s as RisateState));
  const scrittoDalVoto = await votaLento(lettoDalVoto);
  await vecchio.vecchiaMutazione("risateState", () => scrittoDalVoto);
  assert.equal((vecchio.riga["risateState"] as RisateState).phase, "voting", "il modo vecchio fa tornare indietro la fase");

  // NUOVO: in fila; il voto arriva dopo la chiusura e viene rifiutato.
  const nuovo = dbInMemoria({ risateState: risateInVotazione() });
  const [, esitoVoto] = await Promise.all([
    mutaStatoHome(nuovo.backend, "s1", "risateState", leggiRisate, (s) => ({ salva: chiudi(s!), risultato: "chiuso" })),
    mutaStatoHome(nuovo.backend, "s1", "risateState", leggiRisate, (s) => {
      const r = applyVote(s!, "p0", 4, "p9");
      return r.error ? { risultato: r.error } : { salva: r.state, risultato: "ok" };
    }),
  ]);
  assert.equal((nuovo.riga["risateState"] as RisateState).phase, "result");
  assert.deepEqual(esitoVoto, { trovata: true, risultato: "Votazione non aperta" });
});

test("si riscrive SOLO la propria chiave: gli altri campi di game_config restano", async () => {
  const db = dbInMemoria({ risateState: risateInVotazione(), phase: "playing", gamesPlayed: ["quizzone"] });
  await mutaStatoHome(db.backend, "s1", "risateState", leggiRisate, (s) => ({ salva: applyVote(s!, "p0", 3, "p5").state, risultato: null }));
  assert.equal(db.riga["phase"], "playing");
  assert.deepEqual(db.riga["gamesPlayed"], ["quizzone"]);
});

test("Karaoke: 15 voti contemporanei — tutti contati", async () => {
  const base = (() => {
    let k = createBlankKaraokeState(Array.from({ length: 16 }, (_, i) => ({ id: `k${i}`, nickname: `K${i}`, avatarColor: "#000" })));
    k = setDuration(setMode(k, "karaoke-live"), 30);
    return { ...k, karaokePhase: "voting" as const, currentVotes: {} };
  })();
  const ballot = { voce: 5, presenza: 4, energia: 5 } as unknown as Parameters<typeof submitVote>[2];
  const voti = Array.from({ length: 15 }, (_, i) => `k${i + 1}`);

  const vecchio = dbInMemoria({ karaokeHomeState: base });
  await Promise.all(voti.map((v) => vecchio.vecchiaMutazione("karaokeHomeState", (s) => submitVote(s as KaraokeHomeState, v, ballot))));
  assert.ok(Object.keys((vecchio.riga["karaokeHomeState"] as KaraokeHomeState).currentVotes).length < 15);

  const nuovo = dbInMemoria({ karaokeHomeState: base });
  await Promise.all(voti.map((v) => mutaStatoHome(nuovo.backend, "s1", "karaokeHomeState", (x) => x as KaraokeHomeState,
    (s) => ({ salva: submitVote(s!, v, ballot), risultato: null }))));
  assert.equal(Object.keys((nuovo.riga["karaokeHomeState"] as KaraokeHomeState).currentVotes).length, 15);
});

test("sessione inesistente: trovata=false e nessuna scrittura", async () => {
  const backend: BackendStatoHome = { conRigaBloccata: (_id, fn) => fn(null, async () => { throw new Error("non deve scrivere"); }) };
  const out = await mutaStatoHome(backend, "x", "risateState", leggiRisate, () => ({ salva: risateInVotazione(), risultato: 1 }));
  assert.deepEqual(out, { trovata: false });
});
