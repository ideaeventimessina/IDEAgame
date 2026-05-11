import { pgTable, text, timestamp, uuid, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Sets (named collections of challenges) ─────────────────────────── */
export const laughingPathSetsTable = pgTable("laughing_path_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Steps (individual challenges in a set) ─────────────────────────── */
export const laughingPathStepsTable = pgTable("laughing_path_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id").notNull().references(() => laughingPathSetsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  challengeType: text("challenge_type").notNull().default("sfida"),
  points: integer("points").notNull().default(100),
  timeLimit: integer("time_limit").notNull().default(30),
  optionalMediaUrl: text("optional_media_url"),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── State shapes stored in JSONB ───────────────────────────────────── */
export interface PercorsoStepInState {
  id: string;
  title: string;
  description: string;
  challengeType: string;
  points: number;
  timeLimit: number;
  optionalMediaUrl: string | null;
  orderIndex: number;
}

export interface PercorsoTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface PercorsoFlash {
  text: string;
  type: "score" | "step" | "end";
}

export interface PercorsoVoteEntry {
  voterId: string;
  score: number; // 1-5
}

export interface PercorsoState {
  setId: string;
  setName: string;
  steps: PercorsoStepInState[];
  currentStepIdx: number; // -1 = idle / not started
  teams: PercorsoTeam[];
  status: "idle" | "running" | "ended";
  lastFlash: PercorsoFlash | null;
  timerStartedAt: string | null; // ISO — for client-side countdown
  // Audience voting
  performingTeamIds: string[];   // which teams are performing this step
  votingOpen: boolean;           // true while audience can vote
  votes: Record<string, PercorsoVoteEntry[]>; // performingTeamId → entries
}

/* ─── Live session state ─────────────────────────────────────────────── */
export const laughingPathSessionsTable = pgTable("laughing_path_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  setId: uuid("set_id").references(() => laughingPathSetsTable.id, { onDelete: "set null" }),
  state: jsonb("state").$type<PercorsoState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/* ─── Zod insert schemas ─────────────────────────────────────────────── */
export const insertLaughingPathSetSchema = createInsertSchema(laughingPathSetsTable).omit({ id: true, createdAt: true });
export type InsertLaughingPathSet = z.infer<typeof insertLaughingPathSetSchema>;
export type LaughingPathSet = typeof laughingPathSetsTable.$inferSelect;

export const insertLaughingPathStepSchema = createInsertSchema(laughingPathStepsTable).omit({ id: true, createdAt: true });
export type InsertLaughingPathStep = z.infer<typeof insertLaughingPathStepSchema>;
export type LaughingPathStep = typeof laughingPathStepsTable.$inferSelect;

export const insertLaughingPathSessionSchema = createInsertSchema(laughingPathSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLaughingPathSession = z.infer<typeof insertLaughingPathSessionSchema>;
export type LaughingPathSessionRow = typeof laughingPathSessionsTable.$inferSelect;
