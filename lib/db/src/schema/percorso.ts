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

/* ─── RisateState — Missioni Improvvise v2 (JSONB in laughing_path_sessions) ─ */

export type RisatePhase =
  | 'mission_intro'
  | 'booking'
  | 'public_choice'
  | 'active'
  | 'voting'
  | 'result';

export interface RisateTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface RisatePlayer {
  id: string;
  nickname: string;
  teamId: string;
  teamName: string;
  teamColor: string;
}

export interface RisateBooking {
  playerId: string;
  nickname: string;
  role: string;
  teamId: string;
}

export interface RisateMissionResult {
  text: string;
  scores: { playerId: string; nickname: string; teamId: string; pts: number }[];
}

export interface RisateState {
  version: 2;
  status: 'idle' | 'running' | 'ended';
  missionIndex: number;        // -1 = not started, 0-9 = current mission
  phase: RisatePhase;
  teams: RisateTeam[];
  players: RisatePlayer[];     // all connected players
  bookings: RisateBooking[];   // up to playerCount for current mission
  publicChoiceOptions: string[];
  publicChoice: string | null;
  votingOpen: boolean;
  votes: Record<string, { voterId: string; score: number }[]>;
  missionStartedAt: string | null;
  lastFlash: { text: string; type: string } | null;
  missionResult: RisateMissionResult | null;
  // mission 1 — journalist
  questionIndex: number;
  errorCount: number;
  validations: { playerId: string; nickname: string; ts: number }[];
  // mission 2 — yoga
  currentPoseId: string | null;
  poseChangesUsed: number;
  // mission 5 — scioglilingua
  repeatVoteCount: number;
  repeatTriggered: boolean;
  // mission 8 — trova l'oggetto
  foundConfirmations: Record<string, { count: number; firstTs: number; nickname: string }>;
  // mission 9/10 — head2head / cambio stile
  cambioStileVoteCount: number;
  cambioStileTriggered: boolean;
  // public event log — reactions stream on TV
  publicEvents: { emoji: string; nickname: string; ts: number }[];
  // mission 4 — love target
  loveTarget: string | null;
  // server timestamps for client-side timer alignment
  bookingStartedAt: string | null;
  publicChoiceStartedAt: string | null;
  // per-player choices: index matches booking slot (venditore, sfilata)
  perPlayerChoices: string[];
}

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
