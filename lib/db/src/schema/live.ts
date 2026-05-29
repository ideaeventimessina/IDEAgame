import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * live_sessions — Live Mode show sessions.
 * Created by authenticated presenter/admin, accessed by TV/presenter via code.
 */
export const liveSessionsTable = pgTable("live_sessions", {
  id:              uuid("id").primaryKey().defaultRandom(),
  title:           text("title").notNull().default("Serata Live"),
  status:          text("status").notNull().default("draft"), // draft|active|paused|ended
  currentGameSlug: text("current_game_slug"),
  currentPhase:    text("current_phase").notNull().default("standby"),
  tvCode:          text("tv_code").notNull().unique(),
  presenterCode:   text("presenter_code").notNull().unique(),
  tenantId:        uuid("tenant_id"),
  createdBy:       uuid("created_by"),
  metadata:        jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * live_runtime_state — ephemeral runtime state for a live session.
 * Upserted on every command/phase change.
 */
export const liveRuntimeStateTable = pgTable("live_runtime_state", {
  liveSessionId:   uuid("live_session_id").primaryKey(),
  currentGameSlug: text("current_game_slug"),
  currentPhase:    text("current_phase"),
  payload:         jsonb("payload").$type<Record<string, unknown>>().default({}),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * live_game_assets — media assets linked to a live session.
 * Used by Coppie Live (photos), Karaoke Live (audio), etc.
 */
export const liveGameAssetsTable = pgTable("live_game_assets", {
  id:            uuid("id").primaryKey().defaultRandom(),
  liveSessionId: uuid("live_session_id").notNull(),
  gameSlug:      text("game_slug").notNull(),
  assetType:     text("asset_type").notNull(), // photo|audio|video|deck
  label:         text("label"),
  url:           text("url"),
  metadata:      jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdBy:     uuid("created_by"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLiveSessionSchema = createInsertSchema(liveSessionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessionsTable.$inferSelect;

export const insertLiveGameAssetSchema = createInsertSchema(liveGameAssetsTable).omit({
  id: true, createdAt: true,
});
export type InsertLiveGameAsset = z.infer<typeof insertLiveGameAssetSchema>;
export type LiveGameAsset = typeof liveGameAssetsTable.$inferSelect;

export type LiveRuntimeState = typeof liveRuntimeStateTable.$inferSelect;
