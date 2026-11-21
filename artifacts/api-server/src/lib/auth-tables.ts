/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Migrazione IDEMPOTENTE delle tabelle dell'accesso, eseguita all'avvio prima di
   aprire la porta. Solo CREATE … IF NOT EXISTS: nessun DROP, nessun rename, nessun
   ALTER di colonne esistenti. Il DDL combacia con lib/db/src/schema/auth-sessions.ts
   (stessi tipi e stessi nomi di vincoli e indici), così lo strumento di deploy non
   vede differenze. Prima `user_sessions` andava creata a mano dopo ogni reset del
   DB (connect-pg-simple non trova il suo table.sql dentro il bundle esbuild). */

export const DDL_USER_SESSIONS = [
  `CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" varchar PRIMARY KEY NOT NULL,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" USING btree ("expire")`,
];

export const DDL_PASSWORD_RESET = [
  `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "token_hash" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
  )`,
  `CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id")`,
];

/* Idempotenza delle scritture dei ponti (lib/db/src/schema/ponte-idempotenza.ts). */
export const DDL_PONTE_IDEMPOTENZA = [
  `CREATE TABLE IF NOT EXISTS "ponte_idempotenza" (
    "chiave" text PRIMARY KEY NOT NULL,
    "status" integer,
    "esito" jsonb,
    "creato_il" timestamp with time zone DEFAULT now() NOT NULL
  )`,
];

export const DDL_AUTH = [...DDL_USER_SESSIONS, ...DDL_PASSWORD_RESET, ...DDL_PONTE_IDEMPOTENZA];

type Eseguibile = { query: (sql: string) => Promise<unknown> };

/** Crea ciò che manca. Sicura da rilanciare a ogni avvio. */
export async function ensureAuthTables(pool: Eseguibile): Promise<void> {
  for (const sql of DDL_AUTH) await pool.query(sql);
}
