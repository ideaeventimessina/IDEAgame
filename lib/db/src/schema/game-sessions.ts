import { pgTable, text, timestamp, uuid, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const gameSessionStatus = pgEnum("game_session_status", ["idle", "running", "paused", "ended"]);

export const gameSessionsTable = pgTable("game_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  gameSlug: text("game_slug").notNull(),
  status: gameSessionStatus("status").notNull().default("idle"),
  currentRound: integer("current_round").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roundStatus = pgEnum("round_status", ["pending", "running", "completed"]);

export const roundsTable = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameSessionId: uuid("game_session_id").notNull().references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  status: roundStatus("status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameSessionSchema = createInsertSchema(gameSessionsTable).omit({ id: true, createdAt: true });
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type GameSession = typeof gameSessionsTable.$inferSelect;

export const insertRoundSchema = createInsertSchema(roundsTable).omit({ id: true, createdAt: true });
export type InsertRound = z.infer<typeof insertRoundSchema>;
export type Round = typeof roundsTable.$inferSelect;
