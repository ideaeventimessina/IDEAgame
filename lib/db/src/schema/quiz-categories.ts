import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { questionsTable, type LocalizedText } from "./questions";
import { playersTable } from "./players";
import { gameSessionsTable } from "./game-sessions";

export const quizCategoriesTable = pgTable("quiz_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: jsonb("name").$type<LocalizedText>().notNull(),
  color: text("color").notNull().default("#F5B642"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizResponsesTable = pgTable("quiz_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  gameSessionId: uuid("game_session_id").references(() => gameSessionsTable.id, { onDelete: "set null" }),
  chosenIndex: integer("chosen_index").notNull(),
  isCorrect: text("is_correct").notNull().default("false"),
  responseMs: integer("response_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuizCategorySchema = createInsertSchema(quizCategoriesTable).omit({ id: true, createdAt: true });
export type InsertQuizCategory = z.infer<typeof insertQuizCategorySchema>;
export type QuizCategory = typeof quizCategoriesTable.$inferSelect;

export const insertQuizResponseSchema = createInsertSchema(quizResponsesTable).omit({ id: true, createdAt: true });
export type InsertQuizResponse = z.infer<typeof insertQuizResponseSchema>;
export type QuizResponse = typeof quizResponsesTable.$inferSelect;
