import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Word-back sets (mazzi di parole) ───────────────────────────────────── */

export const wordBackSetsTable = pgTable("word_back_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("it"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Cards ──────────────────────────────────────────────────────────────── */

export const WORD_BACK_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type WordBackDifficulty = (typeof WORD_BACK_DIFFICULTIES)[number];

export const WORD_BACK_CATEGORIES = [
  "animali",
  "oggetti",
  "film",
  "personaggi",
  "azioni",
  "mestieri",
  "eventi",
  "parole assurde",
] as const;
export type WordBackCategory = (typeof WORD_BACK_CATEGORIES)[number];

export const wordBackCardsTable = pgTable("word_back_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => wordBackSetsTable.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  hint: text("hint"),
  category: text("category").notNull().default("oggetti"),
  difficulty: text("difficulty").notNull().default("medium"),
  points: integer("points").notNull().default(150),
  timeLimit: integer("time_limit").notNull().default(45),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/* ─── Session state types ────────────────────────────────────────────────── */

export interface WordBackCard {
  id: string;
  word: string;
  hint: string | null;
  category: string;
  difficulty: string;
  points: number;
  timeLimit: number;
}

export interface WordBackBooking {
  id: string;
  playerId: string;
  nickname: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  status: "waiting" | "active" | "completed" | "skipped";
  orderIndex: number;
}

export interface WordBackTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface WordBackState {
  setId: string;
  setName: string;
  currentCard: WordBackCard | null;
  bookings: WordBackBooking[];
  teams: WordBackTeam[];
  status: "idle" | "running" | "revealed" | "ended";
  timerStartedAt: string | null;
  usedCardIds: string[];
}

/* ─── Sessions table ─────────────────────────────────────────────────────── */

export const wordBackSessionsTable = pgTable("word_back_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  setId: uuid("set_id").references(() => wordBackSetsTable.id, {
    onDelete: "set null",
  }),
  state: jsonb("state").$type<WordBackState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Bookings table ─────────────────────────────────────────────────────── */

export const wordBackBookingsTable = pgTable("word_back_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => wordBackSessionsTable.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull(),
  teamId: uuid("team_id"),
  status: text("status").notNull().default("waiting"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Zod schemas ────────────────────────────────────────────────────────── */

export const insertWordBackSetSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  language: z.string().optional(),
  tenantId: z.string().optional(),
});

export const insertWordBackCardSchema = z.object({
  word: z.string().min(1),
  hint: z.string().optional(),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  points: z.number().int().optional(),
  timeLimit: z.number().int().optional(),
  orderIndex: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type WordBackSet = typeof wordBackSetsTable.$inferSelect;
export type WordBackCardRow = typeof wordBackCardsTable.$inferSelect;
export type WordBackSessionRow = typeof wordBackSessionsTable.$inferSelect;
