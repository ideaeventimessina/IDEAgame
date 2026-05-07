import { pgTable, uuid, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gameSessionsTable } from "./game-sessions";
import { quizPacksTable } from "./quiz-packs";
import { playersTable } from "./players";
import { teamsTable } from "./teams";

export const quizzoneResponsesTable = pgTable("quizzone_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => gameSessionsTable.id, { onDelete: "cascade" }),
  packId: uuid("pack_id").notNull().references(() => quizPacksTable.id, { onDelete: "cascade" }),
  roundIndex: integer("round_index").notNull(),
  playerId: uuid("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  selectedAnswer: integer("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  points: integer("points").notNull().default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("quizzone_responses_unique").on(t.sessionId, t.roundIndex, t.playerId)]);

export const insertQuizzoneResponseSchema = createInsertSchema(quizzoneResponsesTable).omit({ id: true, submittedAt: true, isCorrect: true, points: true });
export type InsertQuizzoneResponse = z.infer<typeof insertQuizzoneResponseSchema>;
export type QuizzoneResponse = typeof quizzoneResponsesTable.$inferSelect;
