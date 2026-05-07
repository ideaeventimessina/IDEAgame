import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const eventStatus = pgEnum("event_status", ["draft", "scheduled", "live", "ended"]);

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  venue: text("venue").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  status: eventStatus("status").notNull().default("draft"),
  brandColor: text("brand_color").notNull().default("#F5B642"),
  expectedPlayers: integer("expected_players").notNull().default(20),
  enabledGames: text("enabled_games").array().notNull().default([]),
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
