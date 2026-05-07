import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { ListAuditLogResponse } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/audit-log", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(200)
    : await db.select().from(auditLogTable).where(eq(auditLogTable.tenantId, me.tenantId!)).orderBy(desc(auditLogTable.createdAt)).limit(200);
  res.json(ListAuditLogResponse.parse(rows));
});

export default router;
