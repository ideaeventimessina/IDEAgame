import { pgTable, text, timestamp, uuid, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Decks ──────────────────────────────────────────────────────────── */
export const adultOnlyDecksTable = pgTable("adult_only_decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Cards ──────────────────────────────────────────────────────────── */
export const ADULT_ONLY_CATEGORIES = [
  "domande-piccanti-leggere",
  "vero-falso",
  "mondo-animale-curioso",
  "coppie-challenge",
  "yoga-pose-ironiche",
  "imitazioni-vocali-soft",
] as const;
export type AdultOnlyCategory = (typeof ADULT_ONLY_CATEGORIES)[number];

export const ADULT_ONLY_LEVELS = ["soft", "spicy", "extreme"] as const;
export type AdultOnlyLevel = (typeof ADULT_ONLY_LEVELS)[number];

export const adultOnlyCardsTable = pgTable("adult_only_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => adultOnlyDecksTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("domande-piccanti-leggere"),
  points: integer("points").notNull().default(100),
  timeLimit: integer("time_limit").notNull().default(30),
  level: text("level").notNull().default("soft"),
  isActive: boolean("is_active").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Session state ──────────────────────────────────────────────────── */
export interface AdultOnlyCardInState {
  id: string;
  title: string;
  body: string;
  category: string;
  points: number;
  timeLimit: number;
  level: string;
  orderIndex: number;
}

export interface AdultOnlyTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface AdultOnlyState {
  deckId: string;
  deckName: string;
  cards: AdultOnlyCardInState[];
  currentCardIdx: number; // -1 = idle/not started
  teams: AdultOnlyTeam[];
  status: "idle" | "running" | "ended";
  timerStartedAt: string | null;
  skipped: number[];
}

/* ─── Sessions ───────────────────────────────────────────────────────── */
export const adultOnlySessionsTable = pgTable("adult_only_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  deckId: uuid("deck_id").references(() => adultOnlyDecksTable.id, {
    onDelete: "set null",
  }),
  state: jsonb("state").$type<AdultOnlyState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/* ─── Zod insert schemas ─────────────────────────────────────────────── */
export const insertAdultOnlyDeckSchema = createInsertSchema(adultOnlyDecksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdultOnlyDeck = z.infer<typeof insertAdultOnlyDeckSchema>;
export type AdultOnlyDeck = typeof adultOnlyDecksTable.$inferSelect;

export const insertAdultOnlyCardSchema = createInsertSchema(adultOnlyCardsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdultOnlyCard = z.infer<typeof insertAdultOnlyCardSchema>;
export type AdultOnlyCard = typeof adultOnlyCardsTable.$inferSelect;

export const insertAdultOnlySessionSchema = createInsertSchema(
  adultOnlySessionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdultOnlySession = z.infer<typeof insertAdultOnlySessionSchema>;
export type AdultOnlySessionRow = typeof adultOnlySessionsTable.$inferSelect;
