/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Difetti del giro 2 dello sciame (ideagame): regole pure, scritte prima della
   correzione e fallite col codice di prima. La prova sui server locali è nel
   resoconto del correttore.   pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bloccataDopoFine, bloccatoInDemo, verificaGiocatore, hannoRispostoTutti, riempiConGiaViste,
  limitaEnergia, vincitoreSolo, scadenzaMancheDaRiprendere, attiviAdult, registraRifiuti,
  sceltaTemaCoppie, decidiRientro,
} from "./regole-serata.ts";
import { stessoTenant, statoVoceValido, giaImportata, festeSenzaGettoni, stanzeVolume, isUuid } from "./regole-accessi.ts";
import { redactHomeSession } from "./home-redact.ts";

test("#196 serata chiusa: dopo /end niente end-game, start, ready, select-game", () => {
  for (const sotto of ["/end-game", "/start", "/ready", "/select-game", "/join"]) assert.equal(bloccataDopoFine("ended", "POST", sotto), true, sotto);
  assert.equal(bloccataDopoFine("ended", "POST", "/end"), false);
  assert.equal(bloccataDopoFine("ended", "GET", "/"), false);
  assert.equal(bloccataDopoFine("ended", "DELETE", "/"), false);
  assert.equal(bloccataDopoFine("playing", "POST", "/start"), false);
});

test("#183 /start in demo: stesso blocco di select-game", () => {
  assert.equal(bloccatoInDemo("demo", "adult-only", []), true);
  assert.equal(bloccatoInDemo("demo", "karaoke-battle", []), true);
  assert.equal(bloccatoInDemo("demo", "lockdown", ["lockdown"]), false);
  assert.equal(bloccatoInDemo("full", "adult-only", []), false);
  assert.equal(bloccatoInDemo("demo", "quizzone", []), false);
});

test("#118 #135 #136 #148 #132 playerId inventato o di un altro telefono", () => {
  const ids = ["anna", "bruno"];
  assert.equal(verificaGiocatore({ playerId: "finto-1", idSerata: ids, conGettoni: true, gettoneValido: false }).ok, false);
  assert.equal(verificaGiocatore({ playerId: "anna", idSerata: ids, conGettoni: true, gettoneValido: false }).ok, false);
  assert.equal(verificaGiocatore({ playerId: "anna", idSerata: ids, conGettoni: true, gettoneValido: true }).ok, true);
  assert.equal(verificaGiocatore({ playerId: "anna", idSerata: ids, conGettoni: false, gettoneValido: false }).ok, true);
  // la domanda si chiude solo con i giocatori veri
  assert.deepEqual(hannoRispostoTutti(["anna", "bruno", "carla"], ["anna", "finto-1", "bruno"]), { risposte: 2, tutti: false });
  assert.deepEqual(hannoRispostoTutti(["anna", "bruno"], ["anna", "bruno"]), { risposte: 2, tutti: true });
});

test("#117 Quizzone: col banco del gruppo finito si completa con domande già viste", () => {
  const tutte = Array.from({ length: 10 }, (_, i) => ({ k: `q${i}` }));
  const nuove = tutte.slice(0, 4);
  const scelte = riempiConGiaViste(nuove, tutte, 10, q => q.k);
  assert.equal(scelte.length, 10);
  assert.deepEqual(scelte.slice(0, 4), nuove);
  assert.equal(new Set(scelte.map(q => q.k)).size, 10);
  assert.equal(riempiConGiaViste([], tutte, 5, q => q.k).length, 5);
});

test("#104 #158 Quizzone: la risposta giusta non parte con lo stato", () => {
  const s = { id: "s", roundPayload: { mode: "home-quizzone", phase: "question", questions: [{ question: "?", answers: ["a", "b"], correctAnswerIndex: 1 }] } };
  const out = redactHomeSession(s) as typeof s;
  assert.equal(JSON.stringify(out).includes("correctAnswerIndex"), false);
  assert.deepEqual(out.roundPayload.questions[0]!.answers, ["a", "b"]);
  assert.equal(s.roundPayload.questions[0]!.correctAnswerIndex, 1); // il DB resta intatto
});

test("#179 #181 #190 Ballo: energia con tetto, vincitore vero, ripresa della manche", () => {
  assert.equal(limitaEnergia(999999), 100);
  assert.equal(limitaEnergia(-5), 0);
  assert.equal(limitaEnergia("x"), null);
  assert.equal(vincitoreSolo({ anna: 40, bruno: 90 }, ["anna", "bruno"]), "bruno");
  assert.equal(vincitoreSolo({ estraneo: 100 }, ["anna"]), null);
  const fine = new Date(Date.now() + 5000).toISOString();
  assert.equal(scadenzaMancheDaRiprendere({ mode: "home-ballo", balloPhase: "dancing", danceEndsAt: fine }), new Date(fine).getTime());
  assert.equal(scadenzaMancheDaRiprendere({ mode: "home-ballo", balloPhase: "result", danceEndsAt: fine }), null);
});

test("#150 Adult Only: chi rifiuta il livello resta fuori allo spin successivo", () => {
  const rifiuti = registraRifiuti({}, ["bruno", "carla"], 3);
  const { attivi, spettatori } = attiviAdult(["anna", "bruno", "carla"], {}, rifiuti, 3);
  assert.deepEqual(attivi, ["anna"]);
  assert.deepEqual(spettatori, ["bruno", "carla"]);
  // tornando sotto il livello rifiutato rientrano
  assert.deepEqual(attiviAdult(["anna", "bruno", "carla"], {}, rifiuti, 2).attivi, ["anna", "bruno", "carla"]);
  // il consenso "guardo" resta valido
  assert.deepEqual(attiviAdult(["anna", "bruno"], { anna: "watch" }, {}, 1).attivi, ["bruno"]);
});

test("#155 #168 Coppie: allo scadere si sceglie un tema anche dalle proposte {id,text}", () => {
  assert.deepEqual(sceltaTemaCoppie([{ text: "Cinema" }, { text: "Sport" }], []), { tipo: "testo", testo: "Sport" });
  assert.deepEqual(sceltaTemaCoppie([{ text: "Cinema" }, { text: "Sport" }, { text: "cinema" }], []), { tipo: "testo", testo: "Cinema" });
  assert.deepEqual(sceltaTemaCoppie([], [{ id: "s1", name: "Animali" }]), { tipo: "set", id: "s1", nome: "Animali" });
  assert.deepEqual(sceltaTemaCoppie([], []), { tipo: "casuale" });
});

test("#111 stesso nome: il gettone non va a chi non ce l'ha mentre l'altro gioca", () => {
  assert.equal(decidiRientro({ gettoneValido: false, connesso: true }), "occupato");
  assert.equal(decidiRientro({ gettoneValido: true, connesso: true }), "rientra");
  assert.equal(decidiRientro({ gettoneValido: false, connesso: false }), "rientra");
});

test("#54-#58 Jonny Creator: tenant, stato, import una volta sola", () => {
  const manager = { role: "game_manager", tenantId: "mango" };
  assert.equal(stessoTenant(manager, "mango"), true);
  assert.equal(stessoTenant(manager, "nightowl"), false);
  assert.equal(stessoTenant(manager, null), false);
  assert.equal(stessoTenant({ role: "super_admin", tenantId: null }, "nightowl"), true);
  assert.equal(statoVoceValido("approved"), true);
  assert.equal(statoVoceValido("qualsiasi-cosa"), false);
  assert.equal(statoVoceValido("imported"), false);
  assert.equal(giaImportata({ status: "imported", targetEntityId: "x" }), true);
  assert.equal(giaImportata({ status: "approved", targetEntityId: null }), false);
  assert.equal(isUuid("abc"), false);
});

test("#80 ponte Suite: l'elenco feste esce senza gettoni degli ospiti", () => {
  const out = festeSenzaGettoni({ feste: [{ eventoId: "e1", nome: "Luca & Sara", eventToken: "SEGRETO", feedUrl: "/f" }] });
  assert.equal(JSON.stringify(out).includes("SEGRETO"), false);
  assert.equal(JSON.stringify(out).includes("Luca & Sara"), true);
});

test("#91 volume: solo alle stanze della propria serata", () => {
  assert.deepEqual(stanzeVolume(new Set(["sock1", "home:s1"]), "sock1"), ["home:s1"]);
  assert.deepEqual(stanzeVolume(new Set(["sock1"]), "sock1"), []);
});
