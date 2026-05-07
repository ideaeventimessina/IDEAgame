import { Router, type IRouter, type Response } from "express";
import { and, eq, or, isNull } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import { ListSystemSettingsResponse, UpsertSystemSettingBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();

router.get("/system-settings", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(systemSettingsTable)
    : await db.select().from(systemSettingsTable).where(or(eq(systemSettingsTable.tenantId, me.tenantId!), isNull(systemSettingsTable.tenantId)));
  res.json(ListSystemSettingsResponse.parse(rows));
});

router.put("/system-settings", requireRole("super_admin", "tenant_owner"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = UpsertSystemSettingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const tenantId = me.role === "super_admin" ? null : me.tenantId!;
  // Manual upsert because (null, key) doesn't match unique index in PG
  const existing = await db.select().from(systemSettingsTable).where(
    and(eq(systemSettingsTable.key, parsed.data.key),
        tenantId == null ? isNull(systemSettingsTable.tenantId) : eq(systemSettingsTable.tenantId, tenantId)),
  );
  let row;
  if (existing.length > 0) {
    [row] = await db.update(systemSettingsTable)
      .set({ value: parsed.data.value as object, updatedBy: me.id })
      .where(eq(systemSettingsTable.id, existing[0]!.id))
      .returning();
  } else {
    [row] = await db.insert(systemSettingsTable).values({
      tenantId,
      key: parsed.data.key,
      value: parsed.data.value as object,
      updatedBy: me.id,
    }).returning();
  }
  await audit(req, "system_setting.upsert", "system_setting", row!.id, { key: parsed.data.key });
  res.json(row);
});

export default router;
