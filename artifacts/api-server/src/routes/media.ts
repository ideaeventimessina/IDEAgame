import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, mediaTable } from "@workspace/db";
import {
  ListMediaResponse, CreateMediaBody
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/media", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(mediaTable)
    : await db.select().from(mediaTable).where(eq(mediaTable.tenantId, me.tenantId!));
  res.json(ListMediaResponse.parse(rows));
});

router.post("/media", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateMediaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  if (!me.tenantId) { res.status(400).json({ error: "User has no tenant" }); return; }
  const [m] = await db.insert(mediaTable).values({
    tenantId: me.tenantId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    url: parsed.data.url,
    sizeBytes: parsed.data.sizeBytes ?? 0,
    tags: parsed.data.tags ?? [],
  }).returning();
  res.status(201).json(m);
});

router.delete("/media/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [target] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && target.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  res.sendStatus(204);
});

export default router;
