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

/* ─── Karaoke sets (playlist) ────────────────────────────────────────────── */

export const karaokeSetsTable = pgTable("karaoke_sets", {
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

/* ─── Tracks ─────────────────────────────────────────────────────────────── */

export const KARAOKE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type KaraokeDifficulty = (typeof KARAOKE_DIFFICULTIES)[number];

export const KARAOKE_CATEGORIES = [
  "pop",
  "rock",
  "dance",
  "classica",
  "anni80",
  "anni90",
  "italiana",
  "internazionale",
] as const;
export type KaraokeCategory = (typeof KARAOKE_CATEGORIES)[number];

export const karaokeTracksTable = pgTable("karaoke_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  setId: uuid("set_id")
    .notNull()
    .references(() => karaokeSetsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  lyricSnippet: text("lyric_snippet").notNull().default(""),
  audioUrl: text("audio_url"),
  durationSeconds: integer("duration_seconds").notNull().default(60),
  points: integer("points").notNull().default(150),
  category: text("category").notNull().default("pop"),
  difficulty: text("difficulty").notNull().default("medium"),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/* ─── Session state types ────────────────────────────────────────────────── */

export interface KaraokeTrack {
  id: string;
  title: string;
  artist: string;
  lyricSnippet: string;
  audioUrl: string | null;
  durationSeconds: number;
  points: number;
  category: string;
  difficulty: string;
}

export interface KaraokeBooking {
  id: string;
  playerId: string;
  nickname: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  status: "waiting" | "active" | "completed" | "skipped";
  orderIndex: number;
}

export interface KaraokeTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface KaraokeState {
  setId: string;
  setName: string;
  currentTrack: KaraokeTrack | null;
  bookings: KaraokeBooking[];
  teams: KaraokeTeam[];
  status: "idle" | "singing" | "ended";
  trackStartedAt: string | null;
  usedTrackIds: string[];
}

/* ─── Sessions table ─────────────────────────────────────────────────────── */

export const karaokeSessionsTable = pgTable("karaoke_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  setId: uuid("set_id").references(() => karaokeSetsTable.id, {
    onDelete: "set null",
  }),
  state: jsonb("state").$type<KaraokeState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Bookings table ─────────────────────────────────────────────────────── */

export const karaokeBookingsTable = pgTable("karaoke_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => karaokeSessionsTable.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull(),
  teamId: uuid("team_id"),
  status: text("status").notNull().default("waiting"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Zod schemas ────────────────────────────────────────────────────────── */

export const insertKaraokeSetSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  language: z.string().optional(),
  tenantId: z.string().optional(),
});

export const insertKaraokeTrackSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  lyricSnippet: z.string().optional(),
  audioUrl: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  points: z.number().int().optional(),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  orderIndex: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type KaraokeSet = typeof karaokeSetsTable.$inferSelect;
export type KaraokeTrackRow = typeof karaokeTracksTable.$inferSelect;
export type KaraokeSessionRow = typeof karaokeSessionsTable.$inferSelect;
