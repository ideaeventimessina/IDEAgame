import { pgTable, uuid, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── GameContentPack ────────────────────────────────────────────────────────────

export const gameContentPacksTable = pgTable("game_content_packs", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenantId:         uuid("tenant_id"),
  gameSlug:         text("game_slug").notNull(),
  modeAvailability: text("mode_availability").notNull().default("both"),
  title:            text("title").notNull(),
  description:      text("description"),
  theme:            text("theme"),
  difficulty:       text("difficulty").notNull().default("medium"),
  language:         text("language").notNull().default("it"),
  isActive:         boolean("is_active").notNull().default(true),
  createdBy:        text("created_by").notNull().default("admin"),
  status:           text("status").notNull().default("published"),
  version:          integer("version").notNull().default(1),
  tags:             text("tags").array(),
  itemCount:        integer("item_count").notNull().default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

// ── GameContentItem ────────────────────────────────────────────────────────────

export const gameContentItemsTable = pgTable("game_content_items", {
  id:         uuid("id").primaryKey().defaultRandom(),
  packId:     uuid("pack_id").notNull(),
  gameSlug:   text("game_slug").notNull(),
  type:       text("type").notNull().default("default"),
  title:      text("title").notNull().default(""),
  payloadJson: jsonb("payload_json"),
  mediaJson:  jsonb("media_json"),
  difficulty: text("difficulty").default("medium"),
  isActive:   boolean("is_active").notNull().default(true),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertGameContentPackSchema = createInsertSchema(gameContentPacksTable, {
  modeAvailability: z.enum(["home", "live", "both"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  createdBy: z.enum(["admin", "jonny"]),
  status: z.enum(["draft", "review", "published", "archived"]),
});

export const insertGameContentItemSchema = createInsertSchema(gameContentItemsTable);

// ── TypeScript types ──────────────────────────────────────────────────────────

export type GameContentPack = typeof gameContentPacksTable.$inferSelect;
export type GameContentItem = typeof gameContentItemsTable.$inferSelect;
export type InsertGameContentPack = typeof gameContentPacksTable.$inferInsert;
export type InsertGameContentItem = typeof gameContentItemsTable.$inferInsert;

export type ModeAvailability = "home" | "live" | "both";
export type PackDifficulty = "easy" | "medium" | "hard" | "mixed";
export type PackStatus = "draft" | "review" | "published" | "archived";
export type PackCreatedBy = "admin" | "jonny";
