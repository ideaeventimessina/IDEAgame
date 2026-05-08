import { pgTable, text, timestamp, uuid, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { tenantsTable } from "./tenants";

/* ─── Challenge types ─────────────────────────────────────────────────────── */

export const SARAMUSICA_CHALLENGE_TYPES = ["indovina", "canta", "rumore"] as const;
export type SaraMusicaChallengeType = (typeof SARAMUSICA_CHALLENGE_TYPES)[number];

/* ─── Sets ────────────────────────────────────────────────────────────────── */

export const saraMusicaSetsTable = pgTable("saramusica_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Tracks ──────────────────────────────────────────────────────────────── */

export const saraMusicaTracksTable = pgTable("saramusica_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id").notNull().references(() => saraMusicaSetsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  challengeType: text("challenge_type").notNull().default("indovina"),
  snippetHint: text("snippet_hint").notNull().default(""),
  audioUrl: text("audio_url"),
  durationSeconds: integer("duration_seconds").notNull().default(30),
  points: integer("points").notNull().default(100),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/* ─── State types ─────────────────────────────────────────────────────────── */

export interface SaraMusicaTrack {
  id: string;
  title: string;
  artist: string;
  challengeType: SaraMusicaChallengeType;
  snippetHint: string;
  audioUrl: string | null;
  durationSeconds: number;
  points: number;
}

export interface SaraMusicaTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface SaraMusicaState {
  setId: string;
  setName: string;
  currentTrack: SaraMusicaTrack | null;
  activeTeamId: string | null;
  teams: SaraMusicaTeam[];
  status: "idle" | "playing" | "ended";
  trackStartedAt: string | null;
  noiseLevel: number;
  usedTrackIds: string[];
}

/* ─── Sessions table ──────────────────────────────────────────────────────── */

export const saraMusicaSessionsTable = pgTable("saramusica_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().unique().references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  setId: uuid("set_id").references(() => saraMusicaSetsTable.id, { onDelete: "set null" }),
  state: jsonb("state").$type<SaraMusicaState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Zod schemas ─────────────────────────────────────────────────────────── */

export const insertSaraMusicaSetSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().optional(),
});

export const insertSaraMusicaTrackSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  challengeType: z.enum(SARAMUSICA_CHALLENGE_TYPES).optional(),
  snippetHint: z.string().optional(),
  audioUrl: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  points: z.number().int().optional(),
  orderIndex: z.number().int().optional(),
});

export type SaraMusicaSet = typeof saraMusicaSetsTable.$inferSelect;
export type SaraMusicaTrackRow = typeof saraMusicaTracksTable.$inferSelect;
export type SaraMusicaSessionRow = typeof saraMusicaSessionsTable.$inferSelect;
