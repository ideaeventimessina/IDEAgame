/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Percorso a Risate: chi entra a missioni già iniziate prende i punti delle
   missioni successive.  pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlankRisateState, advancePhase, applyBooking, applyAutoBook, applyVote, sincronizzaGiocatori } from "./risate-engine.ts";
import type { RisateState } from "@workspace/db";

const iniziali = [
  { id: "p1", nickname: "Ada", avatarColor: "#f00", score: 50 },
  { id: "p2", nickname: "Bea", avatarColor: "#0f0", score: 0 },
];
const ritardatario = { id: "p3", nickname: "Ciro", avatarColor: "#00f", score: 120 };

function avviato(): RisateState {
  const teams = iniziali.map((p) => ({ id: p.id, name: p.nickname, color: p.avatarColor, score: p.score }));
  const players = iniziali.map((p) => ({ id: p.id, nickname: p.nickname, teamId: p.id, teamName: p.nickname, teamColor: p.avatarColor }));
  let s = createBlankRisateState(teams, players);
  s = { ...s, status: "running", missionIndex: 2, phase: "mission_intro" };   // missione a voto
  return advancePhase(s).state;                                               // booking
}

test("prima: il ritardatario si prenotava ma i suoi punti si perdevano (nessuna squadra)", () => {
  let s = avviato();
  s = applyBooking(s, "p3", "Ciro", "p3").state;
  s = applyBooking(s, "p1", "Ada", "p1").state;
  s = advancePhase(advancePhase(s).state).state;          // active → voting
  s = applyVote(s, "p3", 5, "p2").state;
  const r = advancePhase(s);                               // result
  // Il motore calcolava i punti ma non c'era una squadra a cui darli: la rotta
  // scrive il punteggio della squadra, quindi per lui non si scriveva nulla.
  assert.equal(r.state.teams.find((t) => t.id === "p3"), undefined);
});

test("ora: sincronizzato, il ritardatario ha la sua squadra e prende i punti", () => {
  let s = sincronizzaGiocatori(avviato(), [...iniziali, ritardatario]);
  assert.equal(s.teams.find((t) => t.id === "p3")?.score, 120);              // parte dai punti della serata
  s = applyBooking(s, "p3", "Ciro", "p3").state;
  s = applyBooking(s, "p1", "Ada", "p1").state;
  s = advancePhase(advancePhase(s).state).state;
  s = applyVote(s, "p3", 5, "p2").state;
  const r = advancePhase(s);
  assert.equal(r.state.phase, "result");
  assert.deepEqual(r.scores.find((x) => x.teamId === "p3"), { teamId: "p3", pts: 100, round: 3 });
  assert.equal(r.state.teams.find((t) => t.id === "p3")?.score, 220);
});

test("l'auto-prenotazione vede anche il ritardatario", () => {
  const s = sincronizzaGiocatori(avviato(), [...iniziali, ritardatario]);
  const ids = new Set<string>();
  for (let i = 0; i < 30; i++) for (const b of applyAutoBook(s).state.bookings) ids.add(b.playerId);
  assert.ok(ids.has("p3"));
});

test("sincronizzare è idempotente e non tocca chi c'era già", () => {
  const s = avviato();
  const a = sincronizzaGiocatori(s, iniziali);
  assert.equal(a, s);                                       // nessun nuovo: stesso stato
  const b = sincronizzaGiocatori(sincronizzaGiocatori(s, [...iniziali, ritardatario]), [...iniziali, ritardatario]);
  assert.equal(b.players.length, 3);
  assert.equal(b.teams.length, 3);
  assert.equal(b.teams.find((t) => t.id === "p1")?.score, 50);
});
