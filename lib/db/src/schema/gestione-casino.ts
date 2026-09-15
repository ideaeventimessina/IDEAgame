/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — CASINO (fish virtuali) ──────────────────────────────
   Gestione fish tra dealer e giocatori ai tavoli: il dealer inquadra il QR del
   giocatore e paga/preleva fish. Cassa fish + classifiche per tavolo e serata,
   in mano al Master. Fish SOLO virtuali (nessun denaro reale). Ledger completo.
──────────────────────────────────────────────────────────────────────────── */

import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const casinoSessionsTable = pgTable("casino_sessions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id"),
  name:        text("name").notNull().default("Serata Casinò"),
  masterCode:  text("master_code").notNull().unique(),   // segreto: Master Casinò + TV
  joinCode:    text("join_code").notNull().unique(),      // pubblico: iscrizione giocatori
  status:      text("status").notNull().default("active"),// active | ended
  config:      jsonb("config").notNull().default({}),     // es. etichetta valuta, buy-in default
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
  expiresAt:   timestamp("expires_at").notNull(),
});

export const casinoTablesTable = pgTable("casino_tables", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   uuid("session_id").notNull(),
  tableNumber: integer("table_number").notNull(),
  name:        text("name").notNull().default(""),
  dealerCode:  text("dealer_code").notNull().unique(),    // segreto: accesso dealer al tavolo
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const casinoPlayersTable = pgTable("casino_players", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   uuid("session_id").notNull(),
  nickname:    text("nickname").notNull(),
  playerCode:  text("player_code").notNull().unique(),    // il QR che il dealer inquadra
  fishBalance: integer("fish_balance").notNull().default(0),
  tableId:     uuid("table_id"),                          // tavolo di appartenenza (opzionale)
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// Registro movimenti (ledger): ogni pagamento/prelievo del dealer resta tracciato.
export const casinoTransactionsTable = pgTable("casino_transactions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  sessionId:    uuid("session_id").notNull(),
  tableId:      uuid("table_id"),
  dealerCode:   text("dealer_code").notNull().default(""),
  playerId:     uuid("player_id").notNull(),
  delta:        integer("delta").notNull(),               // +paga / −preleva
  kind:         text("kind").notNull(),                   // pay | take | buyin | cashout | adjust
  balanceAfter: integer("balance_after").notNull(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export type CasinoSession     = typeof casinoSessionsTable.$inferSelect;
export type CasinoTable        = typeof casinoTablesTable.$inferSelect;
export type CasinoPlayer       = typeof casinoPlayersTable.$inferSelect;
export type CasinoTransaction  = typeof casinoTransactionsTable.$inferSelect;
