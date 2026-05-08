import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Word sets ──────────────────────────────────────────────────────────── */

export const freestyleSetsTable = pgTable("freestyle_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("it"),
  beatUrl: text("beat_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Words ──────────────────────────────────────────────────────────────── */

export const freestyleWordsTable = pgTable("freestyle_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id").notNull().references(() => freestyleSetsTable.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Session state types ────────────────────────────────────────────────── */

export interface FreestyleWord {
  id: string;
  word: string;
  orderIndex: number;
  recognized: boolean;
}

export interface FreestyleBooking {
  id: string;
  playerId: string;
  nickname: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  status: "waiting" | "active" | "performing" | "done" | "skipped";
  orderIndex: number;
  wordsRecognized: string[];
}

export interface FreestyleTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export type FreestylePhase =
  | "idle"          // set selected, not started
  | "revealing"     // words appearing one by one
  | "thinking"      // all 15 words shown, 20s countdown
  | "booking"       // bookings open, waiting for performer
  | "performing"    // someone is on stage (speech recognition active)
  | "ended";        // game over

export interface FreestyleState {
  setId: string;
  setName: string;
  beatUrl: string | null;
  words: FreestyleWord[];
  revealedCount: number;         // how many words shown so far
  revealStartedAt: string | null;
  thinkingStartedAt: string | null;
  thinkingSeconds: number;       // default 20
  bookings: FreestyleBooking[];
  teams: FreestyleTeam[];
  phase: FreestylePhase;
  roundIndex: number;
  usedWordSetIds: string[];
}

/* ─── Sessions table ─────────────────────────────────────────────────────── */

export const freestyleSessionsTable = pgTable("freestyle_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  setId: uuid("set_id").references(() => freestyleSetsTable.id, { onDelete: "set null" }),
  state: jsonb("state").$type<FreestyleState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Bookings table ─────────────────────────────────────────────────────── */

export const freestyleBookingsTable = pgTable("freestyle_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => freestyleSessionsTable.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull(),
  teamId: uuid("team_id"),
  status: text("status").notNull().default("waiting"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FreestyleSet = typeof freestyleSetsTable.$inferSelect;
export type FreestyleWordRow = typeof freestyleWordsTable.$inferSelect;
export type FreestyleSessionRow = typeof freestyleSessionsTable.$inferSelect;
