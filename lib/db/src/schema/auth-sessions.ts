/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Tabelle dell'accesso: sessioni di login e reset password ────────────────
   `user_sessions` la usa connect-pg-simple (express-session). Prima esisteva solo
   perché qualcuno l'aveva creata a mano (replit.md, Gotchas): non stava nello
   schema, quindi lo strumento di deploy la considerava "in più" e poteva proporre
   di DROPparla (= tutti scollegati). Ora è dichiarata qui IDENTICA al DDL storico
   (sid varchar PK, sess json, expire timestamp(6), indice IDX_user_sessions_expire)
   e il server la crea comunque all'avvio se manca (api-server/src/lib/auth-tables.ts).

   `password_reset_tokens` è NUOVA (solo aggiunta): un token monouso per il reset
   via email. Nel DB si salva solo l'HASH del token, mai il token.

   Se cambi qualcosa qui, cambia anche il DDL in auth-tables.ts (un test li confronta).
──────────────────────────────────────────────────────────────────────────── */

import { pgTable, varchar, json, timestamp, index, uuid, text } from "drizzle-orm/pg-core";

export const userSessionsTable = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("IDX_user_sessions_expire").on(t.expire)]);

/* Riferimento a users(id) senza importare users.ts: così questo file resta
   importabile da solo nei test (node --test), senza il resto dello schema. */
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("password_reset_tokens_user_idx").on(t.userId)]);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
