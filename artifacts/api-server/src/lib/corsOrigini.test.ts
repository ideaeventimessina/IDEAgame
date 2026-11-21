/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Test del controllo CSRF (Origin/Referer) sulle richieste col cookie di sessione.
     node --test src/lib/corsOrigini.test.ts */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidiCsrf, COOKIE_SESSIONE } from "./corsOrigini.ts";

const COOKIE = `altro=1; ${COOKIE_SESSIONE}=s%3Aabc.def`;
const HOST = "ideagame.it";

test("GET/HEAD/OPTIONS passano sempre (non cambiano stato)", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.deepEqual(decidiCsrf({ method, cookie: COOKIE, origin: "https://cattivo.example", host: HOST }), { ok: true });
  }
});

test("senza cookie di sessione non c'è nulla da rubare: ponti e telefoni passano", () => {
  assert.equal(decidiCsrf({ method: "POST", origin: "https://cattivo.example", host: HOST }).ok, true);
  assert.equal(decidiCsrf({ method: "POST", cookie: "ideagame.sidx=1", origin: "https://cattivo.example", host: HOST }).ok, true);
});

test("POST col cookie dalla stessa origine → ok; da un altro sito → bloccato", () => {
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, origin: "https://ideagame.it", host: HOST }).ok, true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const e = decidiCsrf({ method, cookie: COOKIE, origin: "https://cattivo.example", host: HOST });
    assert.equal(e.ok, false, method);
  }
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, origin: "null", host: HOST }).ok, false);
  // stesso dominio ma porta/protocollo diversi = altra origine (host diverso)
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, origin: "https://ideagame.it.cattivo.example", host: HOST }).ok, false);
});

test("senza Origin vale il Referer", () => {
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, referer: "https://ideagame.it/admin/users", host: HOST }).ok, true);
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, referer: "https://cattivo.example/x", host: HOST }).ok, false);
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, referer: "non-un-url", host: HOST }).ok, false);
});

test("niente Origin né Referer: passa un programma, non un browser cross-site", () => {
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, host: HOST }).ok, true);
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, secFetchSite: "cross-site", host: HOST }).ok, false);
  assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, secFetchSite: "same-origin", host: HOST }).ok, true);
});

test("le origini del Secret CORS_ORIGINI sono ammesse", () => {
  const prima = process.env["CORS_ORIGINI"];
  process.env["CORS_ORIGINI"] = "https://www.ideagame.it/";
  try {
    assert.equal(decidiCsrf({ method: "POST", cookie: COOKIE, origin: "https://www.ideagame.it", host: HOST }).ok, true);
  } finally {
    if (prima === undefined) delete process.env["CORS_ORIGINI"]; else process.env["CORS_ORIGINI"] = prima;
  }
});
