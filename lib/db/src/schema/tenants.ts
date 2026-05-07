import { pgTable, text, timestamp, integer, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended", "trial"]);

export const tenantsTable = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  status: tenantStatus("status").notNull().default("active"),
  brandColor: text("brand_color").notNull().default("#F5B642"),
  locale: text("locale").notNull().default("it"),
  mrr: integer("mrr").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
