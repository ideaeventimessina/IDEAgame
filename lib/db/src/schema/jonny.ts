import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

/* ─── Generation job ─────────────────────────────────────────────────── */

export const JONNY_STATUSES = ["draft", "generating", "generated", "approved", "failed"] as const;
export type JonnyStatus = (typeof JONNY_STATUSES)[number];

export const JONNY_AUDIENCES = ["bambini", "famiglie", "adulti", "aziendale", "matrimonio", "compleanno", "diciottesimo"] as const;
export const JONNY_TONES = ["elegante", "comico", "trash-controllato", "luxury", "competitivo", "romantico", "ironico"] as const;
export const JONNY_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const jonnyGenerationsTable = pgTable("jonny_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  eventId: uuid("event_id"),
  title: text("title").notNull(),
  theme: text("theme").notNull(),
  targetAudience: text("target_audience").notNull().default("adulti"),
  tone: text("tone").notNull().default("comico"),
  language: text("language").notNull().default("it"),
  difficulty: text("difficulty").notNull().default("medium"),
  durationMinutes: text("duration_minutes").notNull().default("120"),
  numberOfTeams: text("number_of_teams").notNull().default("4"),
  selectedGames: jsonb("selected_games").notNull().default([]),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("draft"),
  generatedJson: jsonb("generated_json"),
  errorMessage: text("error_message"),
  createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJonnyGenerationSchema = createInsertSchema(jonnyGenerationsTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true, generatedJson: true, errorMessage: true,
});
export type InsertJonnyGeneration = z.infer<typeof insertJonnyGenerationSchema>;
export type JonnyGeneration = typeof jonnyGenerationsTable.$inferSelect;

/* ─── Generated items (one per game-section) ─────────────────────────── */

export const JONNY_ITEM_STATUSES = ["draft", "approved", "rejected", "imported"] as const;
export type JonnyItemStatus = (typeof JONNY_ITEM_STATUSES)[number];

export const jonnyGeneratedItemsTable = pgTable("jonny_generated_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id").notNull().references(() => jonnyGenerationsTable.id, { onDelete: "cascade" }),
  gameSlug: text("game_slug").notNull(),
  itemType: text("item_type").notNull().default("set"),
  title: text("title").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("draft"),
  targetEntityId: uuid("target_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type JonnyGeneratedItem = typeof jonnyGeneratedItemsTable.$inferSelect;
