/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Test del MOTORE Ippodromo Sprint — porting fedele di demo/test-engine.mjs (stessi
   casi: partenza/countdown, pronti, sprint/energia/cooldown, salto, collisione unica,
   salto riuscito, pausa, finale CPU, snapshot senza token) + test di RICOSTRUZIONE
   (projectRace deterministico e stabile; nessun ordine predeciso).
     node --test src/routes/gestione-sprint-engine.test.ts
   Nessun database, nessun server: motore puro. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh, action, step, jumpHeight, publicState, projectRace, snapToGrid, STEP_MS,
  type RaceState, type RaceInput, type Pilot,
} from "./gestione-sprint-engine.ts";

function running(): RaceState { const s = fresh(); action(s, "start"); for (let i = 0; i < 60; i++) step(s, 50); return s; }

test("partenza: fermo, countdown, poi gara", () => {
  const s = fresh(); assert.equal(s.horses[0]!.position, 0);
  action(s, "start"); step(s, 50); assert.equal(s.status, "countdown"); assert.equal(s.horses[0]!.position, 0);
  for (let i = 0; i < 60; i++) step(s, 50); assert.equal(s.status, "race");
});

test("pilota non pronto impedisce avvio", () => {
  const s = fresh(); s.horses[0]!.pilot = { name: "Test", token: "private" };
  assert.throws(() => action(s, "start"), /pronti/);
  action(s, "ready", 1); action(s, "start");
});

test("sprint consuma energia, limita frequenza e cambia velocità", () => {
  const s = running(); s.horses[0]!.pilot = { name: "Test" };
  action(s, "sprint", 1); assert.equal(s.horses[0]!.energy, 92);
  assert.throws(() => action(s, "sprint", 1), /frequente/);
  step(s, 50); assert.ok(s.horses[0]!.speed > 0);
  s.horses[0]!.energy = 0; s.time += 300; assert.throws(() => action(s, "sprint", 1), /insufficiente/);
});

test("salto reale ha altezza e recupero", () => {
  const s = running(); action(s, "jump", 1);
  assert.equal(jumpHeight(s.horses[0]!, s.time), 0);
  assert.ok(jumpHeight(s.horses[0]!, s.time + 550) > 0.99);
  assert.throws(() => action(s, "jump", 1), /recupero/);
});

test("ostacolo senza salto penalizza una sola volta", () => {
  const s = running(), h = s.horses[0]!; h.pilot = { name: "Test" }; h.position = 119.9; h.speed = 10;
  step(s, 50); assert.equal(h.hits, 1); step(s, 50); assert.equal(h.hits, 1); assert.equal(h.nextHurdle, 1);
});

test("salto al piano ostacolo evita penalità", () => {
  const s = running(), h = s.horses[0]!; h.pilot = { name: "Test" }; h.position = 119.9; h.speed = 10; h.jumpAt = s.time - 500;
  step(s, 50); assert.equal(h.cleared, 1); assert.equal(h.hits, 0);
});

test("pausa congela tempo e posizioni", () => {
  const s = running(); step(s, 50); const p = s.horses[0]!.position, t = s.time;
  action(s, "pause"); step(s, 50); assert.equal(s.time, t); assert.equal(s.horses[0]!.position, p);
  action(s, "resume"); step(s, 50); assert.ok(s.time > t);
});

test("CPU completa gara, risultati ordinati e finali stabili", () => {
  const s = running();
  for (let i = 0; i < 2500 && s.status !== "results"; i++) step(s, 50);
  assert.equal(s.status, "results"); assert.equal(s.results.length, 6);
  assert.ok(s.horses.every((h) => h.cleared + h.hits === 4));
  const result = JSON.stringify(s.results); step(s, 50); assert.equal(JSON.stringify(s.results), result);
  assert.throws(() => action(s, "sprint", 1), /fase/);
});

test("snapshot non rivela token privati", () => {
  const s = fresh(); s.horses[0]!.pilot = { name: "Test", token: "secret" };
  assert.ok(!JSON.stringify(publicState(s)).includes("secret"));
});

/* ── Ricostruzione (motore server) ── */
test("projectRace: deterministico e stabile, nessun ordine predeciso", () => {
  const pilots: Record<number, Pilot> = { 1: { name: "Ada" }, 2: { name: "Bea" } };
  const inputs: RaceInput[] = [
    { seq: 1, horseId: 1, action: "sprint", at: snapToGrid(500) },
    { seq: 2, horseId: 1, action: "jump", at: snapToGrid(11800) },
    { seq: 3, horseId: 2, action: "sprint", at: snapToGrid(900) },
  ];
  const a = projectRace(pilots, inputs, 70000);
  const b = projectRace(pilots, inputs, 70000);
  assert.equal(JSON.stringify(a), JSON.stringify(b));                 // stessa gara → stesso stato
  const later = projectRace(pilots, inputs, 90000);
  assert.equal(JSON.stringify(later.results), JSON.stringify(a.results)); // oltre l'arrivo: risultati stabili
  assert.equal(a.status, "results"); assert.equal(a.results.length, 6);
  assert.ok(a.horses.every((h) => h.cleared + h.hits === 4));
});

test("projectRace: più sprint fanno davvero andare più veloce (pilota > fermo)", () => {
  const spam: RaceInput[] = [];
  for (let t = 0; t < 40000; t += 300) spam.push({ seq: t, horseId: 1, action: "sprint", at: snapToGrid(t) });
  const piloted = projectRace({ 1: { name: "Spam" } }, spam, 6000);
  const idle = projectRace({ 1: { name: "Idle" } }, [], 6000);
  assert.ok(piloted.horses[0]!.position > idle.horses[0]!.position);
});

test("snapToGrid aggancia al passo fisso", () => {
  assert.equal(snapToGrid(123), 100); assert.equal(snapToGrid(50), 50); assert.equal(snapToGrid(-5), 0);
  assert.equal(STEP_MS, 50);
});
