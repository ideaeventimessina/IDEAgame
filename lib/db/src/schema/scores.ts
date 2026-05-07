import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";
import { teamsTable } from "./teams";

export const scoresTable = pgTable("scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  gameSlug: text("game_slug").notNull(),
  round: integer("round").notNull().default(1),
  points: integer("points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScoreSchema = createInsertSchema(scoresTable).omit({ id: true, createdAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scoresTable.$inferSelect;
