import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { homeSessionsTable } from "./home-sessions";

export const liveSessionStatus = pgEnum("live_session_status", ["active", "ended"]);

/**
 * live_sessions — modalità LIVE (eventi con presentatore/regia).
 * Sottile layer di comando sopra una home_session: la TV Live renderizza
 * la Home runtime collegata, Presenter/Regia la comandano tramite i codici.
 * homeSessionId è "set null" (non cascade): il cleanup delle home session
 * scadute non deve distruggere la stanza Live, che si ricollega da sola.
 */
export const liveSessionsTable = pgTable("live_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  homeSessionId: uuid("home_session_id").references(() => homeSessionsTable.id, { onDelete: "set null" }),
  tvCode: text("tv_code").notNull().unique(),
  presenterCode: text("presenter_code").notNull().unique(),
  status: liveSessionStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertLiveSessionSchema = createInsertSchema(liveSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessionsTable.$inferSelect;
