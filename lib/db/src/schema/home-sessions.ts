import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const homeSessionStatus = pgEnum("home_session_status", ["lobby", "playing", "ended"]);

/**
 * home_sessions — modalità HOME (Trivial Pursuit-style, senza tenant/auth).
 * Un "evento virtuale" temporaneo creato dalla TV/schermo principale.
 */
export const homeSessionsTable = pgTable("home_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  joinCode: text("join_code").notNull().unique(),
  hostName: text("host_name").notNull().default("Casa"),
  gameSlug: text("game_slug"),
  gameConfig: jsonb("game_config").$type<Record<string, unknown>>().default({}),
  status: homeSessionStatus("status").notNull().default("lobby"),
  currentRound: integer("current_round").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(10),
  roundPayload: jsonb("round_payload").$type<Record<string, unknown>>().default({}),
  scores: jsonb("scores").$type<Record<string, number>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const homePlayersTable = pgTable("home_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => homeSessionsTable.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  avatarColor: text("avatar_color").notNull().default("#F5B642"),
  score: integer("score").notNull().default(0),
  isConnected: boolean("is_connected").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHomeSessionSchema = createInsertSchema(homeSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHomeSession = z.infer<typeof insertHomeSessionSchema>;
export type HomeSession = typeof homeSessionsTable.$inferSelect;

export const insertHomePlayerSchema = createInsertSchema(homePlayersTable).omit({ id: true, createdAt: true });
export type InsertHomePlayer = z.infer<typeof insertHomePlayerSchema>;
export type HomePlayer = typeof homePlayersTable.$inferSelect;
