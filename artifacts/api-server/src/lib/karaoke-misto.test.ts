/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Karaoke in modo MISTO: i telefoni prenotano il freestyle mentre la TV resta sulla
   coda karaoke; l'host passa al freestyle e poi torna alla coda.
     pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBlankKaraokeState, setMode, setDuration, startNext, bookSong,
  freestyleBook, freestyleStartBattle, freestyleEndBattle,
  freestyleRiapri, mistoVaiAlFreestyle, mistoTornaAlKaraoke, type KaraokeHomeState,
} from "./karaoke-home-engine.ts";

function misto(): KaraokeHomeState {
  const k = createBlankKaraokeState([
    { id: "a", nickname: "Ada", avatarColor: "#f00" },
    { id: "b", nickname: "Bea", avatarColor: "#0f0" },
    { id: "c", nickname: "Cri", avatarColor: "#00f" },
  ]);
  return setDuration(setMode(k, "mixed"), 30);
}

test("misto: una prenotazione freestyle NON porta via la TV dalla coda karaoke", () => {
  const s = misto();
  assert.equal(s.freestylePhase, "idle");
  const r = freestyleBook(s, "a", "Ada", "#f00");
  assert.equal(r.error, undefined);
  assert.equal(r.state.freestylePhase, "idle");                 // la TV resta sul karaoke
  assert.equal(r.state.subMode, "mixed");
  assert.equal(r.state.freestyleBookings.filter((b) => b.status === "waiting").length, 1);
});

test("misto: karaoke → freestyle → battle → risultato → di nuovo coda karaoke", () => {
  let s = freestyleBook(misto(), "a", "Ada", "#f00").state;
  s = mistoVaiAlFreestyle(s).state;
  assert.equal(s.freestylePhase, "booking");
  s = freestyleStartBattle(s).state;
  assert.equal(s.freestylePhase, "battling");
  assert.ok(mistoTornaAlKaraoke(s).error, "durante la battle non si torna indietro");
  s = freestyleEndBattle(s);
  assert.equal(s.freestylePhase, "battle_result");
  s = mistoTornaAlKaraoke(s).state;
  assert.equal(s.freestylePhase, "idle");
  assert.equal(s.subMode, "mixed");
  assert.equal(s.karaokePhase, "queue_open");                    // la coda karaoke è di nuovo quella della TV
});

test("misto: niente freestyle mentre qualcuno canta", () => {
  let s = misto();
  s = bookSong(s, { playerId: "b", nickname: "Bea", avatarColor: "#0f0", videoId: "v1", title: "Canzone", channel: "", thumbnailUrl: "", durationSeconds: 120, dedicationTargetPlayerId: null, dedicationTargetNickname: null }).state;
  s = startNext(s).state;
  assert.equal(s.karaokePhase, "playing");
  assert.ok(mistoVaiAlFreestyle(s).error);
});

test("le transizioni miste valgono solo in modo misto", () => {
  const solo = setMode(createBlankKaraokeState([{ id: "a", nickname: "A", avatarColor: "#fff" }]), "freestyle");
  assert.ok(mistoVaiAlFreestyle(solo).error);
  assert.ok(mistoTornaAlKaraoke(solo).error);
});

test("Ancora battle: riapre le prenotazioni SENZA cambiare modo (prima il misto diventava solo freestyle)", () => {
  let s = mistoVaiAlFreestyle(freestyleBook(misto(), "a", "Ada", "#f00").state).state;
  s = freestyleEndBattle(freestyleStartBattle(s).state);
  const r = freestyleRiapri(s);
  assert.equal(r.state.freestylePhase, "booking");
  assert.equal(r.state.subMode, "mixed");
  // il rapper che ha già fatto la sua battle può riprenotarsi
  assert.equal(freestyleBook(r.state, "a", "Ada", "#f00").error, undefined);
});

test("una prenotazione durante la battle non interrompe la battle (anche in modo freestyle puro)", () => {
  let s = setMode(createBlankKaraokeState([{ id: "a", nickname: "A", avatarColor: "#fff" }, { id: "b", nickname: "B", avatarColor: "#fff" }]), "freestyle");
  s = freestyleBook(s, "a", "A", "#fff").state;
  s = freestyleStartBattle(s).state;
  s = freestyleBook(s, "b", "B", "#fff").state;
  assert.equal(s.freestylePhase, "battling");
  assert.ok(s.currentBattle);
  assert.ok(freestyleRiapri(s).error);
});
