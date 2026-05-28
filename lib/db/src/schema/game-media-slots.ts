import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";

export const gameMediaSlotsTable = pgTable("game_media_slots", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id"),
  gameSlug:  text("game_slug").notNull(),
  slotKey:   text("slot_key").notNull(),
  value:     text("value").notNull().default(""),
  valueType: text("value_type").notNull().default("youtube"),
  label:     text("label").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("game_media_slots_tenant_slug_key").on(t.tenantId, t.gameSlug, t.slotKey),
]);

export type GameMediaSlot = typeof gameMediaSlotsTable.$inferSelect;
export type InsertGameMediaSlot = typeof gameMediaSlotsTable.$inferInsert;
