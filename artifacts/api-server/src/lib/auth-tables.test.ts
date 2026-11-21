/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* La migrazione a runtime (auth-tables.ts) e lo schema Drizzle (auth-sessions.ts)
   devono descrivere LE STESSE tabelle: se divergono, lo strumento di deploy vede
   differenze e propone ALTER/DROP. Qui si confrontano nomi, tipi e vincoli.
     node --test src/lib/auth-tables.test.ts */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { DDL_AUTH, DDL_USER_SESSIONS, DDL_PASSWORD_RESET, ensureAuthTables } from "./auth-tables.ts";
import { userSessionsTable, passwordResetTokensTable } from "../../../../lib/db/src/schema/auth-sessions.ts";

function colonneDdl(ddl: string): Record<string, string> {
  const corpo = ddl.slice(ddl.indexOf("(") + 1, ddl.lastIndexOf(")"));
  const out: Record<string, string> = {};
  for (const riga of corpo.split("\n").map((r) => r.trim().replace(/,$/, "")).filter(Boolean)) {
    const m = /^"([a-z_]+)"\s+(.+)$/.exec(riga);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

test("solo CREATE … IF NOT EXISTS: niente DROP, ALTER o RENAME", () => {
  for (const sql of DDL_AUTH) {
    assert.match(sql, /^CREATE (TABLE|INDEX) IF NOT EXISTS /);
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|TRUNCATE|DELETE)\b/i);
  }
});

test("user_sessions: stesse colonne, tipi e indice dello schema Drizzle (e del DDL storico)", () => {
  const cfg = getTableConfig(userSessionsTable);
  const ddl = colonneDdl(DDL_USER_SESSIONS[0]!);
  assert.deepEqual(Object.keys(ddl).sort(), cfg.columns.map((c) => c.name).sort());
  for (const c of cfg.columns) {
    assert.ok(ddl[c.name]!.startsWith(c.getSQLType().replace(" (", "(")), `${c.name}: ${ddl[c.name]} vs ${c.getSQLType()}`);
    assert.equal(ddl[c.name]!.includes("NOT NULL"), c.notNull, `${c.name} notNull`);
    assert.equal(ddl[c.name]!.includes("PRIMARY KEY"), c.primary, `${c.name} pk`);
  }
  assert.deepEqual(cfg.indexes.map((i) => i.config.name), ["IDX_user_sessions_expire"]);
  assert.match(DDL_USER_SESSIONS[1]!, /"IDX_user_sessions_expire" ON "user_sessions" USING btree \("expire"\)/);
});

test("password_reset_tokens: stesse colonne, tipi, unique e indice dello schema Drizzle", () => {
  const cfg = getTableConfig(passwordResetTokensTable);
  const ddl = colonneDdl(DDL_PASSWORD_RESET[0]!);
  assert.deepEqual(Object.keys(ddl).sort(), cfg.columns.map((c) => c.name).sort());
  for (const c of cfg.columns) {
    assert.ok(ddl[c.name]!.startsWith(c.getSQLType().replace(" (", "(")), `${c.name}: ${ddl[c.name]} vs ${c.getSQLType()}`);
    assert.equal(ddl[c.name]!.includes("NOT NULL"), c.notNull, `${c.name} notNull`);
  }
  const unico = cfg.columns.find((c) => c.isUnique)!;
  assert.equal(unico.name, "token_hash");
  assert.match(DDL_PASSWORD_RESET[0]!, new RegExp(`CONSTRAINT "${unico.uniqueName}" UNIQUE\\("token_hash"\\)`));
  assert.deepEqual(cfg.indexes.map((i) => i.config.name), ["password_reset_tokens_user_idx"]);
});

test("ensureAuthTables esegue tutto il DDL, nell'ordine, ed è rilanciabile", async () => {
  const eseguite: string[] = [];
  const finto = { query: async (s: string) => { eseguite.push(s); } };
  await ensureAuthTables(finto);
  await ensureAuthTables(finto);
  assert.deepEqual(eseguite, [...DDL_AUTH, ...DDL_AUTH]);
});
