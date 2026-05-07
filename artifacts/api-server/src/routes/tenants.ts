import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  ListTenantsResponse, CreateTenantBody,
  UpdateTenantBody, UpdateTenantResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/tenants", requireRole("super_admin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);
  res.json(ListTenantsResponse.parse(rows));
});

router.post("/tenants", requireRole("super_admin"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [t] = await db.insert(tenantsTable).values(parsed.data).returning();
  res.status(201).json(t);
});

router.patch("/tenants/:id", requireRole("super_admin"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [t] = await db.update(tenantsTable).set(parsed.data).where(eq(tenantsTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateTenantResponse.parse(t));
});

router.delete("/tenants/:id", requireRole("super_admin"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const [t] = await db.delete(tenantsTable).where(eq(tenantsTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
