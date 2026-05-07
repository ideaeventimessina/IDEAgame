import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, tenantsTable, eventsTable, playersTable } from "@workspace/db";
import { GetKpisResponse } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/kpis", requireRole("super_admin"), async (_req, res): Promise<void> => {
  const [{ count: tenants } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` }).from(tenantsTable);
  const [{ count: sessionsToday } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` }).from(eventsTable)
    .where(sql`${eventsTable.startsAt}::date = current_date`);
  const [{ count: playersWeek } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` }).from(playersTable)
    .where(sql`${playersTable.createdAt} > now() - interval '7 days'`);
  const [{ sum: mrr } = { sum: 0 }] = await db
    .select({ sum: sql<number>`coalesce(sum(${tenantsTable.mrr}),0)::int` }).from(tenantsTable);

  res.json(GetKpisResponse.parse({ tenants, sessionsToday, playersWeek, mrr }));
});

export default router;
