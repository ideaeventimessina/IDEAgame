import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";
import { teamsTable } from "./teams";

export const playersTable = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  nickname: text("nickname").notNull(),
  avatarColor: text("avatar_color").notNull().default("#F5B642"),
  isConnected: boolean("is_connected").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
