/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Idempotenza delle scritture dei ponti (giro roulette di Jarvis).
     pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import { conIdempotenza, leggiIdempotenza, statoRiga, SCADENZA_PRENOTAZIONE_MS, type ArchivioIdempotenza, type RigaIdempotenza } from "./idempotenza.ts";

function archivio() {
  const righe = new Map<string, RigaIdempotenza>();
  const a: ArchivioIdempotenza = {
    async prenota(k) { if (righe.has(k)) return false; righe.set(k, { status: null, esito: null, creatoIl: new Date() }); return true; },
    async leggi(k) { return righe.get(k) ?? null; },
    async libera(k, prima) {
      const r = righe.get(k);
      if (!r) return;
      if (prima && (r.status != null || r.creatoIl >= prima)) return;
      righe.delete(k);
    },
  };
  // Il "giro": salva l'esito sulla riga (come fa la transazione vera) e conta le esecuzioni.
  let giri = 0;
  const giro = (k: string) => async () => {
    giri += 1;
    await new Promise((r) => setTimeout(r, 5));
    const body = { numero: giri * 7 % 37, giri };
    righe.set(k, { ...righe.get(k)!, status: 200, esito: body });
    return { status: 200, body, registrato: true };
  };
  return { a, righe, giro, get giri() { return giri; } };
}

test("stesso valore → stesso esito, nessun secondo giro", async () => {
  const m = archivio();
  const primo = await conIdempotenza(m.a, "k1", m.giro("k1"));
  const secondo = await conIdempotenza(m.a, "k1", m.giro("k1"));
  assert.equal(m.giri, 1);
  assert.deepEqual(secondo.body, primo.body);
  assert.equal(secondo.status, 200);
  assert.equal(primo.ripetuta, false);
  assert.equal(secondo.ripetuta, true);
});

test("richieste parallele con lo stesso valore: un solo giro", async () => {
  const m = archivio();
  const esiti = await Promise.all(Array.from({ length: 8 }, () => conIdempotenza(m.a, "k2", m.giro("k2"))));
  assert.equal(m.giri, 1);
  for (const e of esiti) assert.ok(e.status === 200 || e.status === 409);      // 409 = la prima è ancora in corso
  const dopo = await conIdempotenza(m.a, "k2", m.giro("k2"));
  assert.deepEqual(dopo.body, esiti.find((e) => !e.ripetuta)!.body);
});

test("valori diversi → giri diversi", async () => {
  const m = archivio();
  await conIdempotenza(m.a, "x", m.giro("x"));
  await conIdempotenza(m.a, "y", m.giro("y"));
  assert.equal(m.giri, 2);
});

test("se il giro fallisce la prenotazione si libera e si può riprovare", async () => {
  const m = archivio();
  await assert.rejects(conIdempotenza(m.a, "k3", async () => { throw new Error("db giù"); }));
  assert.equal(m.righe.has("k3"), false);
  const ok = await conIdempotenza(m.a, "k3", m.giro("k3"));
  assert.equal(ok.status, 200);
  // esito non registrato (es. errore di validazione): libera la chiave
  await conIdempotenza(m.a, "k4", async () => ({ status: 400, body: { error: "x" }, registrato: false }));
  assert.equal(m.righe.has("k4"), false);
});

test("prenotazione rimasta vuota oltre la scadenza: si riprende", async () => {
  const m = archivio();
  m.righe.set("k5", { status: null, esito: null, creatoIl: new Date(Date.now() - SCADENZA_PRENOTAZIONE_MS - 1000) });
  const e = await conIdempotenza(m.a, "k5", m.giro("k5"));
  assert.equal(e.status, 200);
  assert.equal(m.giri, 1);
});

test("campo idempotenza: assente, vuoto, non stringa, troppo lungo", () => {
  assert.deepEqual(leggiIdempotenza(undefined), { ok: true, chiave: null });
  assert.deepEqual(leggiIdempotenza("  "), { ok: true, chiave: null });
  assert.deepEqual(leggiIdempotenza(" abc "), { ok: true, chiave: "abc" });
  assert.equal(leggiIdempotenza(42).ok, false);
  assert.equal(leggiIdempotenza("x".repeat(201)).ok, false);
  const adesso = new Date();
  assert.equal(statoRiga(null, adesso), "libera");
  assert.equal(statoRiga({ status: 200, esito: {}, creatoIl: adesso }, adesso), "completata");
  assert.equal(statoRiga({ status: null, esito: null, creatoIl: adesso }, adesso), "in_corso");
});
