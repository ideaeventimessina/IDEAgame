import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const mediaKind = pgEnum("media_kind", ["image", "audio", "video"]);

export const mediaTable = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: mediaKind("kind").notNull(),
  url: text("url").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, createdAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
