import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface QuizRound {
  orderIndex: number;
  type: "multiple_choice" | "true_false" | "image_compare" | "guess_who" | "fast_answer" | "bonus_final";
  questionText: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  timeLimit: number;
  optionalMediaIds: string[];
}

export const quizPacksTable = pgTable("quiz_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  eventId: uuid("event_id"),
  title: text("title").notNull(),
  themePrompt: text("theme_prompt").notNull(),
  language: text("language").notNull().default("it"),
  difficulty: text("difficulty").notNull().default("medium"),
  targetAudience: text("target_audience").notNull().default("adulti"),
  tone: text("tone").notNull().default("divertente"),
  totalRounds: integer("total_rounds").notNull().default(20),
  useMediaLibrary: text("use_media_library").notNull().default("false"),
  status: text("status").notNull().default("draft"),
  generatedJson: jsonb("generated_json"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuizPackSchema = createInsertSchema(quizPacksTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true, generatedJson: true, errorMessage: true,
});
export type InsertQuizPack = z.infer<typeof insertQuizPackSchema>;
export type QuizPack = typeof quizPacksTable.$inferSelect;
