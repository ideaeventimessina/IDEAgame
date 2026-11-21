/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* #97 il link del ponte /join/<codice>?nome=<nome> compila il nome.  node --test src/lib/nome-link.test.ts */

import test from "node:test";
import assert from "node:assert/strict";
import { nomeDaLink } from "./nome-link.ts";

test("?nome= compila il campo, ripulito e al massimo 30 caratteri", () => {
  assert.equal(nomeDaLink("?nome=Marta"), "Marta");
  assert.equal(nomeDaLink("?nome=%20Anna%20%20Maria%20"), "Anna Maria");
  assert.equal(nomeDaLink(""), "");
  assert.equal(nomeDaLink("?nome=" + "x".repeat(50)).length, 30);
});
