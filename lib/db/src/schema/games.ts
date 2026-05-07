import { pgTable, text, timestamp, uuid, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface GameSettings {
  rounds: number;
  timeLimit: number;
  scoringWeight: number;
}

export const gamesTable = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  accentColor: text("accent_color").notNull(),
  icon: text("icon").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  adultOnly: boolean("adult_only").notNull().default(false),
  settings: jsonb("settings").$type<GameSettings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({ id: true, createdAt: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
