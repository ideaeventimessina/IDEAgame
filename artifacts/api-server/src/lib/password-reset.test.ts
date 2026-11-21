/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Test delle parti pure del reset password.  node --test src/lib/password-reset.test.ts */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nuovoToken, hashToken, tokenBenFormato, controllaNuovaPassword, statoToken,
  linkReset, emailResetHtml, DURATA_TOKEN_MS,
} from "./password-reset.ts";

test("token: 43 caratteri base64url, ogni volta diverso; nel DB va solo l'hash", () => {
  const a = nuovoToken(), b = nuovoToken();
  assert.ok(tokenBenFormato(a) && tokenBenFormato(b));
  assert.notEqual(a, b);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(a), a);
  assert.equal(hashToken(a), hashToken(a));
});

test("token mal formati scartati subito", () => {
  for (const t of [undefined, 123, "", "corto", "x".repeat(44), "a".repeat(42) + "!"]) assert.equal(tokenBenFormato(t), false);
});

test("nuova password: almeno 10 caratteri, al massimo 200", () => {
  assert.match(String(controllaNuovaPassword("corta")), /10 caratteri/);
  assert.notEqual(controllaNuovaPassword(undefined), null);
  assert.notEqual(controllaNuovaPassword("x".repeat(201)), null);
  assert.equal(controllaNuovaPassword("una-password-buona"), null);
});

test("stato del token: inesistente, usato, scaduto, valido", () => {
  const adesso = new Date("2026-11-21T10:00:00Z");
  const fra = (ms: number) => new Date(adesso.getTime() + ms);
  assert.equal(statoToken(undefined, adesso), "inesistente");
  assert.equal(statoToken({ expiresAt: fra(DURATA_TOKEN_MS), usedAt: fra(-1000) }, adesso), "usato");
  assert.equal(statoToken({ expiresAt: fra(-1), usedAt: null }, adesso), "scaduto");
  assert.equal(statoToken({ expiresAt: adesso, usedAt: null }, adesso), "scaduto");
  assert.equal(statoToken({ expiresAt: fra(60_000), usedAt: null }, adesso), "valido");
});

test("link ed email: link verso /reset-password, HTML con link escapato", () => {
  const l = linkReset("https://ideagame.it/", "abc_DEF-123");
  assert.equal(l, "https://ideagame.it/reset-password?token=abc_DEF-123");
  const html = emailResetHtml('https://x.it/r?token=a"><script>');
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("30 minuti"));
});
