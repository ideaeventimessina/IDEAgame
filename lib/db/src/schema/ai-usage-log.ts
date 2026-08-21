/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { pgTable, text, timestamp, uuid, integer, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

/* Log di ogni chiamata a un provider AI/paid a pagamento (oggi solo OpenAI,
   struttura pronta per altri provider in futuro). Alimenta la dashboard
   superadmin di costi/utilizzo in artifacts/ideagame/src/admin/Billing.tsx. */
export const aiUsageLogTable = pgTable("ai_usage_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull(),
  // es. "chat.completions", "images.generate", "images.edit", "audio.transcriptions", "audio.speech"
  endpoint: text("endpoint").notNull(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  // spesa stimata in USD, precisione alta perché le singole chiamate costano frazioni di centesimo
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  // contesto libero: route di origine, size/quality immagine, durata audio, se il costo è stimato, ecc.
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("ai_usage_log_tenant_idx").on(t.tenantId, t.createdAt),
  userIdx: index("ai_usage_log_user_idx").on(t.userId, t.createdAt),
  providerIdx: index("ai_usage_log_provider_idx").on(t.provider, t.createdAt),
}));

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogTable).omit({ id: true, createdAt: true });
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogTable.$inferSelect;
