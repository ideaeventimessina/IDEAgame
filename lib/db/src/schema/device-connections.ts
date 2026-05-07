import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { eventsTable } from "./events";

export const deviceKind = pgEnum("device_kind", ["projector", "controller", "player_phone", "host_tablet"]);
export const deviceStatus = pgEnum("device_status", ["pending", "paired", "disconnected"]);

export const deviceConnectionsTable = pgTable("device_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  kind: deviceKind("kind").notNull(),
  label: text("label").notNull(),
  pairCode: text("pair_code").notNull().unique(),
  status: deviceStatus("status").notNull().default("pending"),
  pairedAt: timestamp("paired_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDeviceConnectionSchema = createInsertSchema(deviceConnectionsTable).omit({ id: true, createdAt: true, lastSeenAt: true });
export type InsertDeviceConnection = z.infer<typeof insertDeviceConnectionSchema>;
export type DeviceConnection = typeof deviceConnectionsTable.$inferSelect;
