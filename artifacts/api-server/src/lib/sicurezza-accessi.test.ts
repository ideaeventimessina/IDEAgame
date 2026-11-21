/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Controlli d'accesso: casinò, serata Home, regia Live, archivio file.
   (La prova end-to-end con server e database usa e getta è nel resoconto.)
     pnpm --filter @workspace/api-server test */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ripulisci, accessoRichiesto, codiceRegiaValido, tettoDealer, accreditoDealerAmmesso } from "./casino-regia.ts";
import { creaGettoni, uguali, decidiPunteggio, serataConGettoni, MAX_AUMENTO_GIOCATORE } from "./gettoni-home.ts";
import { ruoloLive, puo, sessionePer } from "./live-accesso.ts";
import { caricamentoAmmesso, percorsoOggettoAmmesso, puoCambiareAudio, MAX_CARICAMENTO } from "./storage-regole.ts";

/* ── Casinò ─────────────────────────────────────────────────────────────── */
const statoCompleto = {
  session: { id: "s1", name: "Serata", joinCode: "JOIN01", masterCode: "MASTER1", status: "active",
    config: { gameTables: { t: { dealerCode: "DEAL01", seats: {} } }, bjTables: { b: { shoe: [{ r: "A" }] } }, suite: { eventToken: "x" } } },
  tables: [{ id: "t1", name: "Tavolo 1", dealerCode: "DEAL02" }],
  players: [{ id: "p1", nickname: "Ada", playerCode: "PLAY001", fishBalance: 500 }],
  tvCode: "TV0001",
};

test("casinò: la lettura pubblica non contiene codici regia/dealer/giocatore, mazzi o config", () => {
  const pub = ripulisci(statoCompleto);
  const testo = JSON.stringify(pub);
  for (const segreto of ["MASTER1", "DEAL01", "DEAL02", "PLAY001", "shoe", "eventToken", "config"]) assert.ok(!testo.includes(segreto), segreto);
  assert.equal(pub.session.joinCode, "JOIN01");     // il codice per entrare resta (è sul QR della TV)
  assert.equal(pub.players[0]!.fishBalance, 500);
  assert.equal(pub.tvCode, "TV0001");
});

test("casinò: solo l'iscrizione è pubblica, le letture sono ripulite, il resto è di regia", () => {
  assert.equal(accessoRichiesto("POST", "/players"), "pubblico");
  assert.equal(accessoRichiesto("GET", "/"), "pubblico-ripulito");
  assert.equal(accessoRichiesto("GET", "/bj-tables"), "pubblico-ripulito");
  for (const [m, p] of [["POST", "/setup"], ["POST", "/tables"], ["DELETE", "/tables/abc"], ["POST", "/end"], ["POST", "/bj-tables/x/dealer"], ["POST", "/game-tables"], ["PATCH", "/"]]) {
    assert.equal(accessoRichiesto(m!, p!), "regia", `${m} ${p}`);
  }
});

test("casinò: codice regia confrontato a tempo costante, maiuscole indifferenti", () => {
  assert.equal(codiceRegiaValido("master1", "MASTER1"), true);
  assert.equal(codiceRegiaValido("MASTER2", "MASTER1"), false);
  assert.equal(codiceRegiaValido("", "MASTER1"), false);
  assert.equal(codiceRegiaValido(undefined, "MASTER1"), false);
  assert.equal(codiceRegiaValido("MASTER1", null), false);
});

test("casinò: accrediti manuali del dealer con tetto (prima illimitati)", () => {
  assert.equal(tettoDealer(500), 2000);
  assert.equal(tettoDealer(100), 1000);
  assert.equal(accreditoDealerAmmesso(2000, 500), true);
  assert.equal(accreditoDealerAmmesso(2001, 500), false);
  assert.equal(accreditoDealerAmmesso(1_000_000, 500), false);
  assert.equal(accreditoDealerAmmesso(-5000, 500), true);   // i prelievi restano governati dal saldo
});

/* ── Serata Home ────────────────────────────────────────────────────────── */
test("Home: gettoni firmati, diversi per serata e per giocatore, non falsificabili", () => {
  const g = creaGettoni("segreto-di-prova"), altro = creaGettoni("altro-segreto");
  assert.notEqual(g.host("s1"), g.host("s2"));
  assert.notEqual(g.host("s1"), g.giocatore("s1"));
  assert.notEqual(g.host("s1"), altro.host("s1"));
  assert.equal(uguali(g.host("s1"), g.host("s1")), true);
  assert.equal(uguali("indovinato", g.host("s1")), false);
  assert.equal(uguali(undefined, g.host("s1")), false);
  assert.throws(() => creaGettoni(""));
});

test("Home: punteggi — TV libera, telefono solo i suoi pochi punti, estranei no", () => {
  const base = { conGettoni: true, attuale: 300 };
  assert.deepEqual(decidiPunteggio({ ...base, host: true, giocatore: false, nuovo: 0 }), { ok: true });
  assert.deepEqual(decidiPunteggio({ ...base, host: false, giocatore: true, nuovo: 400 }), { ok: true });
  assert.equal(decidiPunteggio({ ...base, host: false, giocatore: true, nuovo: 300 + MAX_AUMENTO_GIOCATORE + 1 }).ok, false);
  assert.equal(decidiPunteggio({ ...base, host: false, giocatore: true, nuovo: 0 }).ok, false);           // non si azzera
  assert.deepEqual(decidiPunteggio({ ...base, host: false, giocatore: false, nuovo: 999999 }), { ok: false, status: 401, error: "Serve il gettone dell'organizzatore o del giocatore" });
  assert.equal(decidiPunteggio({ ...base, host: true, giocatore: false, nuovo: -1 }).ok, false);
  // serate nate prima dei gettoni: comportamento di prima
  assert.equal(decidiPunteggio({ conGettoni: false, host: false, giocatore: false, attuale: 0, nuovo: 50 }).ok, true);
  assert.equal(serataConGettoni({ gettoni: 1 }), true);
  assert.equal(serataConGettoni({}), false);
});

/* ── Regia Live ─────────────────────────────────────────────────────────── */
const live = { tenantId: "T1", createdBy: "u1", tvCode: "TVTV01", presenterCode: "PRES01" };

test("Live: il codice TV guarda, il presentatore comanda, lo staff gestisce", () => {
  assert.equal(ruoloLive(live, null, "tvtv01"), "tv");
  assert.equal(ruoloLive(live, null, "PRES01"), "presenter");
  assert.equal(ruoloLive(live, null, "XXXX"), null);
  assert.equal(puo("tv", "lettura"), true);
  assert.equal(puo("tv", "comando"), false);
  assert.equal(puo("presenter", "comando"), true);
  assert.equal(puo("presenter", "gestione"), false);
  assert.equal(puo("staff", "gestione"), true);
});

test("Live: un utente loggato di un ALTRO tenant non comanda né cancella", () => {
  assert.equal(ruoloLive(live, { id: "u9", role: "tenant_owner", tenantId: "T2" }, null), null);
  assert.equal(ruoloLive(live, { id: "u9", role: "game_manager", tenantId: "T1" }, null), "staff");
  assert.equal(ruoloLive(live, { id: "u0", role: "super_admin", tenantId: null }, null), "staff");
  assert.equal(ruoloLive({ ...live, tenantId: null }, { id: "u1", role: "entertainer", tenantId: null }, null), "staff");
  assert.equal(ruoloLive({ ...live, tenantId: null }, { id: "u2", role: "entertainer", tenantId: null }, null), null);
});

test("Live: la TV non riceve il codice presentatore", () => {
  const s = { id: "x", ...live };
  assert.equal("presenterCode" in sessionePer(s, "tv"), false);
  assert.equal(sessionePer(s, "presenter").presenterCode, "PRES01");
  assert.equal(sessionePer(s, "staff").presenterCode, "PRES01");
});

/* ── Archivio file e audio ─────────────────────────────────────────────── */
test("caricamenti: tetto di dimensione e tipi ammessi", () => {
  assert.equal(caricamentoAmmesso(1024, "image/png").ok, true);
  assert.equal(caricamentoAmmesso(5_000_000, "video/mp4").ok, true);
  assert.equal(caricamentoAmmesso(MAX_CARICAMENTO + 1, "image/png").ok, false);
  assert.equal(caricamentoAmmesso(0, "image/png").ok, false);
  for (const t of ["text/html", "application/javascript", "image/svg+xml", "application/x-msdownload", ""]) assert.equal(caricamentoAmmesso(10, t).ok, false, t);
});

test("oggetti serviti: solo uploads/<uuid>[.ext]", () => {
  assert.equal(percorsoOggettoAmmesso("uploads/0b5c8a2e-1f3d-4c5e-9a7b-123456789abc.png"), true);
  assert.equal(percorsoOggettoAmmesso("uploads/0b5c8a2e-1f3d-4c5e-9a7b-123456789abc"), true);
  for (const p of ["uploads/../secret", "private/whatever", "uploads/abc", "uploads/0b5c8a2e-1f3d-4c5e-9a7b-123456789abc/../../x", "", "../uploads/0b5c8a2e-1f3d-4c5e-9a7b-123456789abc"]) {
    assert.equal(percorsoOggettoAmmesso(p), false, p);
  }
});

test("audio globali: li cambia solo il super_admin", () => {
  assert.equal(puoCambiareAudio("super_admin"), true);
  for (const r of ["tenant_owner", "game_manager", "entertainer", undefined]) assert.equal(puoCambiareAudio(r), false);
});
