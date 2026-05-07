import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const translationsTable = pgTable("translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  locale: text("locale").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  keyLocaleIdx: uniqueIndex("translations_key_locale_idx").on(t.key, t.locale),
}));

export const insertTranslationSchema = createInsertSchema(translationsTable).omit({ id: true, updatedAt: true });
export type InsertTranslation = z.infer<typeof insertTranslationSchema>;
export type Translation = typeof translationsTable.$inferSelect;
