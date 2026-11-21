/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Test del ponte IDEAeventi: rotte Express vere su una porta libera del sistema
 * (porta 0), archivio in memoria al posto del database.
 *   node --test src/routes/ponte-ideaeventi-lib.test.ts
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { creaRouterPonteIdeaeventi, maxGiocatori, SKILL_MANIFEST, type ArchivioPonte } from "./ponte-ideaeventi-lib.ts";

const KEY = "chiave-di-prova-lunga-abbastanza";

function archivioInMemoria() {
  const righe: Array<{ id: string; joinCode: string; riferimento: string; status: string; maxPlayers: number; festa: string }> = [];
  let n = 0;
  const a: ArchivioPonte = {
    async trovaAperta(rif) {
      const r = [...righe].reverse().find((x) => x.riferimento === rif && x.status !== "ended");
      return r ? { id: r.id, joinCode: r.joinCode } : null;
    },
    async crea({ festa, riferimento, maxPlayers }) {
      n += 1;
      const r = { id: `s${n}`, joinCode: `COD${n}`, riferimento, status: "lobby", maxPlayers, festa };
      righe.push(r);
      return { id: r.id, joinCode: r.joinCode };
    },
    async chiudi(rif) {
      let c = 0;
      for (const r of righe) if (r.riferimento === rif && r.status !== "ended") { r.status = "ended"; c++; }
      return c;
    },
  };
  return { a, righe };
}

let chiaveCorrente = KEY;
const mem = archivioInMemoria();
const app = express();
app.use(express.json());
app.use("/api", creaRouterPonteIdeaeventi({ chiave: () => chiaveCorrente, archivio: mem.a, log: () => undefined }));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ponte/ideaeventi`;
after(() => server.close());

async function chiama(path: string, opts: { metodo?: string; chiave?: string | null; corpo?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.chiave !== null) headers["x-ponte-key"] = opts.chiave ?? KEY;
  const r = await fetch(base + path, {
    method: opts.metodo ?? "POST", headers,
    body: (opts.metodo ?? "POST") === "GET" ? undefined : JSON.stringify(opts.corpo ?? {}),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

test("503 su tutte le rotte se manca PONTE_IDEAEVENTI_KEY", async () => {
  chiaveCorrente = "";
  try {
    for (const [p, m] of [["/partita", "POST"], ["/partita-home", "POST"], ["/partita/chiudi", "POST"], ["/skill", "GET"]] as const) {
      const r = await chiama(p, { metodo: m });
      assert.equal(r.status, 503, p);
      assert.match(String(r.body["error"]), /PONTE_IDEAEVENTI_KEY/);
    }
  } finally { chiaveCorrente = KEY; }
});

test("401 con chiave sbagliata, assente o di lunghezza diversa", async () => {
  for (const chiave of ["sbagliata-ma-lunga-uguale-xxxxxx", null, "x"]) {
    const r = await chiama("/partita", { chiave, corpo: { festa: "F", riferimento: "r" } });
    assert.equal(r.status, 401);
  }
  assert.equal((await chiama("/skill", { metodo: "GET", chiave: "no" })).status, 401);
});

test("400 senza festa o riferimento; chiudi senza riferimento", async () => {
  assert.equal((await chiama("/partita", { corpo: { festa: "Marta" } })).status, 400);
  assert.equal((await chiama("/partita-home", { corpo: { riferimento: "p-1" } })).status, 400);
  assert.equal((await chiama("/partita/chiudi", { corpo: {} })).status, 400);
});

test("200 sul manifest skill", async () => {
  const r = await chiama("/skill", { metodo: "GET" });
  assert.equal(r.status, 200);
  assert.equal(r.body["sistema"], SKILL_MANIFEST.sistema);
});

test("partita: 201 la prima volta, poi 200 giaCera con lo stesso codice (idempotente)", async () => {
  const a = await chiama("/partita", { corpo: { festa: "18° di Marta", riferimento: "preventivo-410", attesi: 30 } });
  assert.equal(a.status, 201);
  assert.equal(a.body["giaCera"], false);
  assert.equal(a.body["eventoId"], a.body["sessionId"]);
  const b = await chiama("/partita", { corpo: { festa: "18° di Marta", riferimento: "preventivo-410" } });
  assert.equal(b.status, 200);
  assert.equal(b.body["giaCera"], true);
  assert.equal(b.body["codice"], a.body["codice"]);
  // partita-home con lo stesso riferimento riusa la stessa partita
  const c = await chiama("/partita-home", { corpo: { festa: "18° di Marta", riferimento: "preventivo-410" } });
  assert.equal(c.body["codice"], a.body["codice"]);
  assert.equal(mem.righe.filter((x) => x.riferimento === "preventivo-410").length, 1);
});

test("chiudi: chiude la partita vera, è idempotente, e dopo si riapre una partita nuova", async () => {
  const a = await chiama("/partita-home", { corpo: { festa: "Marta e Luca", riferimento: "preventivo-411" } });
  const c1 = await chiama("/partita/chiudi", { corpo: { riferimento: "preventivo-411" } });
  assert.deepEqual([c1.status, c1.body], [200, { ok: true, chiuse: 1 }]);
  const c2 = await chiama("/partita/chiudi", { corpo: { riferimento: "preventivo-411" } });
  assert.deepEqual([c2.status, c2.body], [200, { ok: true, chiuse: 0 }]);
  const b = await chiama("/partita-home", { corpo: { festa: "Marta e Luca", riferimento: "preventivo-411" } });
  assert.equal(b.status, 201);
  assert.equal(b.body["giaCera"], false);
  assert.notEqual(b.body["codice"], a.body["codice"]);
});

test("attesi: default 20, limiti 2–200", () => {
  assert.equal(maxGiocatori(undefined), 20);
  assert.equal(maxGiocatori(1), 2);
  assert.equal(maxGiocatori(5000), 200);
  assert.equal(maxGiocatori("abc"), 20);
});
