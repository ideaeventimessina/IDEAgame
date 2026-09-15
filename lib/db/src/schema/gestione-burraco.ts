/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — BURRACO ─────────────────────────────────────────────
   Serate di burraco a coppie fisse con tavoli a rotazione. Completamente separato
   dai party game: tabelle e rotte proprie. Punteggi in tempo reale + QR per tavolo.
──────────────────────────────────────────────────────────────────────────── */

import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

export const burracoSessionsTable = pgTable("burraco_sessions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id"),
  name:        text("name").notNull().default("Serata Burraco"),
  masterCode:  text("master_code").notNull().unique(),   // segreto: regia + TV
  joinCode:    text("join_code").notNull().unique(),      // pubblico: consultazione
  status:      text("status").notNull().default("lobby"), // lobby | playing | ended
  currentRound: integer("current_round").notNull().default(0),
  config:      jsonb("config").notNull().default({}),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
  expiresAt:   timestamp("expires_at").notNull(),
});

export const burracoPairsTable = pgTable("burraco_pairs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   uuid("session_id").notNull(),
  name:        text("name").notNull().default(""),        // nome coppia (opzionale)
  player1:     text("player1").notNull().default(""),
  player2:     text("player2").notNull().default(""),
  totalScore:  integer("total_score").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// Abbinamento coppia↔tavolo per una singola manche (2 coppie a tavolo).
export const burracoAssignmentsTable = pgTable("burraco_assignments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sessionId:   uuid("session_id").notNull(),
  roundNumber: integer("round_number").notNull(),
  tableNumber: integer("table_number").notNull(),
  tableCode:   text("table_code").notNull(),              // codice/QR del tavolo per questa manche
  pairAId:     uuid("pair_a_id"),
  pairBId:     uuid("pair_b_id"),                          // null = coppia in riposo (bye)
  scoreA:      integer("score_a"),
  scoreB:      integer("score_b"),
  submitted:   boolean("submitted").notNull().default(false),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("burraco_assign_session_round_table").on(t.sessionId, t.roundNumber, t.tableNumber),
]);

export type BurracoSession    = typeof burracoSessionsTable.$inferSelect;
export type BurracoPair        = typeof burracoPairsTable.$inferSelect;
export type BurracoAssignment  = typeof burracoAssignmentsTable.$inferSelect;
