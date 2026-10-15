/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Test del rimescolamento risposte di SaraMusica — riproduce il bug reale "praticamente
   ingiocabile" (Andrea) e prova il fix alla radice:
     RC1: nel banco OGNI round è scritto con c:0 → la risposta giusta era SEMPRE il primo
     pulsante ("A"). Dopo il fix shuffleRoundAnswers mescola le risposte e rimappa l'indice.
   Logica pura: nessun DB, nessun server, nessuna chiave.
     node --test src/lib/saramusica-generator.test.ts
*/

import test from "node:test";
import assert from "node:assert/strict";
import { shuffleRoundAnswers, shuffleArr } from "./saramusica-shuffle.ts";

// Round modellato come quelli del banco: la risposta giusta è SEMPRE all'indice 0 (il bug).
function bankRound(answers: string[]) {
  return { id: "t", type: "guess_artist", theme: "anni80", question: "q", answers, correctAnswerIndex: 0, points: 100, timeLimit: 20 };
}

test("shuffleArr: conserva gli elementi (nessuno perso o aggiunto)", () => {
  const a = [1, 2, 3, 4, 5];
  for (let i = 0; i < 50; i++) assert.deepEqual([...shuffleArr(a)].sort((x, y) => x - y), a);
});

test("shuffleRoundAnswers: conserva il VALORE della risposta giusta e l'insieme delle risposte", () => {
  const r = bankRound(["GIUSTA", "b", "c", "d"]);
  for (let i = 0; i < 300; i++) {
    const s = shuffleRoundAnswers(r);
    assert.equal(s.answers[s.correctAnswerIndex], "GIUSTA"); // l'indice punta sempre al valore giusto
    assert.deepEqual([...s.answers].sort(), ["GIUSTA", "b", "c", "d"].sort()); // nessuna risposta alterata
  }
});

test("shuffleRoundAnswers: la giusta NON resta sempre a 0 (riproduce e supera il bug 'sempre A')", () => {
  const r = bankRound(["GIUSTA", "b", "c", "d"]);
  const positions = new Set<number>();
  for (let i = 0; i < 400; i++) positions.add(shuffleRoundAnswers(r).correctAnswerIndex);
  assert.ok(positions.size > 1, "BUG: la risposta giusta è sempre nella stessa posizione (sempre A)");
  assert.ok(positions.size >= 3, `distribuzione troppo stretta: posizioni=${[...positions]}`);
});

test("shuffleRoundAnswers: regge il song_vs_song a 2 risposte", () => {
  const r = bankRound(["Billie Jean (1983)", "Like a Virgin (1984)"]);
  const positions = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const s = shuffleRoundAnswers(r);
    assert.equal(s.answers[s.correctAnswerIndex], "Billie Jean (1983)");
    positions.add(s.correctAnswerIndex);
  }
  assert.ok(positions.size === 2, "con 2 risposte la giusta deve finire in entrambe le posizioni");
});

test("shuffleRoundAnswers: round senza vera scelta multipla restano intatti (singing_duel / 1 sola)", () => {
  const duel = { id: "duel", type: "singing_duel", theme: "duello", question: "SFIDA", answers: [] as string[], correctAnswerIndex: -1, points: 300, timeLimit: 30 };
  assert.deepEqual(shuffleRoundAnswers(duel), duel);
  const single = bankRound(["sola"]);
  assert.deepEqual(shuffleRoundAnswers(single), single);
});

test("shuffleRoundAnswers: indice corretto fuori range non rompe (restituisce il round)", () => {
  const broken = { id: "x", type: "guess_song", theme: "t", question: "q", answers: ["a", "b"], correctAnswerIndex: 7, points: 100, timeLimit: 20 };
  const s = shuffleRoundAnswers(broken);
  assert.ok(Array.isArray(s.answers) && s.answers.length === 2);
});
