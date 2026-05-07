import { pgTable, text, timestamp, uuid, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import type { LocalizedText } from "./questions";

export const cardKind = pgEnum("card_kind", ["truth", "dare", "question", "challenge"]);

export const cardSetsTable = pgTable("card_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  adultOnly: text("adult_only").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardsTable = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  cardSetId: uuid("card_set_id").notNull().references(() => cardSetsTable.id, { onDelete: "cascade" }),
  kind: cardKind("kind").notNull().default("question"),
  prompts: jsonb("prompts").$type<LocalizedText>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCardSetSchema = createInsertSchema(cardSetsTable).omit({ id: true, createdAt: true });
export type InsertCardSet = z.infer<typeof insertCardSetSchema>;
export type CardSet = typeof cardSetsTable.$inferSelect;

export const insertCardSchema = createInsertSchema(cardsTable).omit({ id: true, createdAt: true });
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
