/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* I gettoni partono solo verso le rotte della serata giusta.  node --test src/lib/gettoni.test.ts */

import test from "node:test";
import assert from "node:assert/strict";
import { headerPer, ricordaRegiaCasino, ricordaHostHome, ricordaPlayerHome } from "./gettoni.ts";

const S1 = "11111111-2222-3333-4444-555555555555";
const S2 = "99999999-2222-3333-4444-555555555555";

test("casinò: x-master-code solo per la serata di cui si ha il codice regia", () => {
  ricordaRegiaCasino(S1, "abcdef");
  assert.deepEqual(headerPer(`/api/gestione/casino/sessions/${S1}/setup`), { "x-master-code": "ABCDEF" });
  assert.deepEqual(headerPer(`/api/gestione/casino/sessions/${S2}/setup`), {});
  assert.deepEqual(headerPer(`/api/gestione/casino/player/XYZ`), {});
});

test("Home: gettone organizzatore e giocatore sulle rotte della loro serata", () => {
  ricordaHostHome(S1, "host-tok");
  ricordaPlayerHome(S1, "pl-tok");
  assert.deepEqual(headerPer(`/api/home/sessions/${S1}/champion`), { "x-host-token": "host-tok", "x-player-token": "pl-tok" });
  assert.deepEqual(headerPer(`/api/home/sessions/${S2}/score`), {});
  assert.deepEqual(headerPer(`/api/home/quiz-topics`), {});
});
