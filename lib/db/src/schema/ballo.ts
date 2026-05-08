import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Challenges catalog ─────────────────────────────────────────────────── */

export const DANCE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type DanceDifficulty = (typeof DANCE_DIFFICULTIES)[number];

export const danceChallengesTable = pgTable("dance_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  duration: integer("duration").notNull().default(60),
  difficulty: text("difficulty").notNull().default("medium"),
  musicHint: text("music_hint").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Session state types ────────────────────────────────────────────────── */

export interface DanceTeamInState {
  id: string;
  name: string;
  color: string;
  score: number;
  energy: number;
}

export interface DanceState {
  challengeId: string;
  challengeName: string;
  duration: number;
  musicHint: string;
  difficulty: string;
  teams: DanceTeamInState[];
  status: "idle" | "running" | "ended";
  startedAt: string | null;
}

/* ─── Sessions table ─────────────────────────────────────────────────────── */

export const danceSessionsTable = pgTable("dance_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  challengeId: uuid("challenge_id").references(() => danceChallengesTable.id, {
    onDelete: "set null",
  }),
  state: jsonb("state").$type<DanceState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/* ─── Zod schemas ────────────────────────────────────────────────────────── */

export const insertDanceChallengeSchema = createInsertSchema(
  danceChallengesTable,
).omit({ id: true, createdAt: true });
export type InsertDanceChallenge = z.infer<typeof insertDanceChallengeSchema>;
export type DanceChallenge = typeof danceChallengesTable.$inferSelect;

export const insertDanceSessionSchema = createInsertSchema(
  danceSessionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDanceSession = z.infer<typeof insertDanceSessionSchema>;
export type DanceSessionRow = typeof danceSessionsTable.$inferSelect;
