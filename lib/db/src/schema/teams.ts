import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const teamsTable = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  score: integer("score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true, score: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
