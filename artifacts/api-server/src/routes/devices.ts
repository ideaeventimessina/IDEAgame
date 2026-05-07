import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deviceConnectionsTable } from "@workspace/db";
import { ListDevicesResponse, CreateDeviceBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();

function makeCode(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s.slice(0, 3) + "-" + s.slice(3);
}

router.get("/devices", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(deviceConnectionsTable)
    : await db.select().from(deviceConnectionsTable).where(eq(deviceConnectionsTable.tenantId, me.tenantId!));
  res.json(ListDevicesResponse.parse(rows));
});

router.post("/devices", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  if (!me.tenantId) { res.status(400).json({ error: "User has no tenant" }); return; }
  const [d] = await db.insert(deviceConnectionsTable).values({
    tenantId: me.tenantId,
    eventId: parsed.data.eventId ?? null,
    kind: parsed.data.kind,
    label: parsed.data.label,
    pairCode: makeCode(),
  }).returning();
  await audit(req, "device.create", "device", d!.id, { kind: d!.kind, label: d!.label });
  res.status(201).json(d);
});

router.delete("/devices/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [d] = await db.select().from(deviceConnectionsTable).where(eq(deviceConnectionsTable.id, id));
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && d.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(deviceConnectionsTable).where(eq(deviceConnectionsTable.id, id));
  await audit(req, "device.delete", "device", id);
  res.sendStatus(204);
});

export default router;
