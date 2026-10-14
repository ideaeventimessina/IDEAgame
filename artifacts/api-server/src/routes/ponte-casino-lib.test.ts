/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Test della logica PURA del ponte casinò. Si lanciano senza database e senza
 * server: `node --test` (Node ≥ 23 esegue il TypeScript cancellando i tipi).
 *   pnpm --filter @workspace/api-server test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chiaveCombacia,
  baseGiaConcessa,
  giocatoreLegato,
  nicknameDaSuite,
  fichesInizialiSane,
  urlSenzaGettone,
  erroreDaSuite,
  type SuitePlayerMap,
} from "./ponte-casino-lib.ts";

test("chiaveCombacia: confronto a tempo costante", () => {
  assert.equal(chiaveCombacia("segreto-123", "segreto-123"), true);
  assert.equal(chiaveCombacia("segreto-123", "segreto-124"), false);
  assert.equal(chiaveCombacia("corta", "molto-piu-lunga"), false); // lunghezze diverse
  assert.equal(chiaveCombacia("qualcosa", ""), false);             // segreto non configurato
  assert.equal(chiaveCombacia("", ""), false);
});

test("base delle fiche: UNA sola volta per playerId", () => {
  const map: SuitePlayerMap = { "plr_A": { casinoPlayerId: "uuid-A", baseGranted: true } };
  assert.equal(baseGiaConcessa(map, "plr_A"), true);   // già data: niente seconda base
  assert.equal(baseGiaConcessa(map, "plr_B"), false);  // mai vista: base dovuta
  assert.equal(baseGiaConcessa(undefined, "plr_A"), false);
  assert.equal(baseGiaConcessa({ "plr_C": { casinoPlayerId: "x", baseGranted: false } }, "plr_C"), false);
});

test("giocatoreLegato: stesso ospite = stesso account", () => {
  const map: SuitePlayerMap = { "plr_A": { casinoPlayerId: "uuid-A", baseGranted: true } };
  assert.equal(giocatoreLegato(map, "plr_A"), "uuid-A");
  assert.equal(giocatoreLegato(map, "plr_Z"), null);
  assert.equal(giocatoreLegato(undefined, "plr_A"), null);
});

test("nicknameDaSuite: nome presente vs privacy (null)", () => {
  assert.equal(nicknameDaSuite("Chiara"), "Chiara");
  assert.equal(nicknameDaSuite("  Luca  "), "Luca");
  assert.equal(nicknameDaSuite(null), null);
  assert.equal(nicknameDaSuite(""), null);
  assert.equal(nicknameDaSuite("   "), null);
  assert.equal(nicknameDaSuite("x".repeat(50))?.length, 30); // troncato a 30
});

test("fichesInizialiSane: intero, non negativo, con tetto", () => {
  assert.equal(fichesInizialiSane(500), 500);
  assert.equal(fichesInizialiSane("500"), 500);
  assert.equal(fichesInizialiSane(-10), 0);
  assert.equal(fichesInizialiSane(999999), 100000);
  assert.equal(fichesInizialiSane(undefined), 500);
  assert.equal(fichesInizialiSane("boh", 300), 300);
  assert.equal(fichesInizialiSane(250.7), 251);
});

test("urlSenzaGettone: toglie il gettone, tiene il resto", () => {
  assert.equal(urlSenzaGettone("https://ideagame.it/gestione/casino?g=ABC123"), "/gestione/casino");
  assert.equal(urlSenzaGettone("https://ideagame.it/gestione/casino?g=ABC&x=1"), "/gestione/casino?x=1");
  assert.equal(urlSenzaGettone("https://ideagame.it/gestione/casino?x=1&g=ABC"), "/gestione/casino?x=1");
  assert.equal(urlSenzaGettone("https://ideagame.it/gestione/casino"), "/gestione/casino");
  // relativo / malformato
  assert.equal(urlSenzaGettone("/gestione/casino?g=XYZ"), "/gestione/casino");
  assert.equal(urlSenzaGettone("/gestione/casino?a=1&g=XYZ"), "/gestione/casino?a=1");
});

test("erroreDaSuite: mappa i codici del contratto", () => {
  assert.equal(erroreDaSuite(401).status, 401);
  assert.equal(erroreDaSuite(404).status, 404);
  assert.equal(erroreDaSuite(410).status, 410);
  assert.equal(erroreDaSuite(409).status, 409);
  assert.equal(erroreDaSuite(429).status, 429);
  assert.equal(erroreDaSuite(500).status, 502); // tutto il resto = Suite KO
  assert.equal(erroreDaSuite(418).errore, "suite_ko");
});
