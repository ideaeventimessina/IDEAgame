import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const difficulty = pgEnum("difficulty", ["easy", "medium", "hard"]);

export type LocalizedText = Partial<Record<"it" | "en" | "es" | "fr", string>>;

export const questionsTable = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  difficulty: difficulty("difficulty").notNull().default("medium"),
  timeLimit: integer("time_limit").notNull().default(25),
  prompts: jsonb("prompts").$type<LocalizedText>().notNull(),
  options: jsonb("options").$type<LocalizedText[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
