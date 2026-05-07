import { Router, type IRouter, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq, and, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  ListUsersResponse, CreateUserBody,
  UpdateUserBody, UpdateUserResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/users", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(usersTable)
    : await db.select().from(usersTable).where(or(eq(usersTable.tenantId, me.tenantId!), eq(usersTable.id, me.id)));
  res.json(ListUsersResponse.parse(rows.map(stripPwd)));
});

const TENANT_OWNER_ALLOWED_ROLES = new Set(["tenant_owner", "game_manager", "entertainer"]);

router.post("/users", requireRole("super_admin", "tenant_owner"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  if (me.role === "tenant_owner" && !TENANT_OWNER_ALLOWED_ROLES.has(parsed.data.role)) {
    res.status(403).json({ error: "Cannot assign this role" }); return;
  }
  const tenantId = me.role === "super_admin" ? (parsed.data.tenantId ?? null) : me.tenantId;
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [u] = await db.insert(usersTable).values({
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    role: parsed.data.role,
    locale: parsed.data.locale ?? "it",
    tenantId,
    passwordHash,
  }).returning();
  res.status(201).json(stripPwd(u!));
});

router.patch("/users/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  const isSelf = me.id === id;
  const isSameTenantOwner =
    me.role === "tenant_owner" &&
    !!me.tenantId &&
    !!target.tenantId &&
    target.tenantId === me.tenantId &&
    target.role !== "super_admin";
  if (me.role !== "super_admin" && !isSelf && !isSameTenantOwner) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name) updates["name"] = parsed.data.name;
  if (parsed.data.locale) updates["locale"] = parsed.data.locale;
  if (parsed.data.role && me.role === "super_admin") updates["role"] = parsed.data.role;
  if (parsed.data.password) updates["passwordHash"] = await bcrypt.hash(parsed.data.password, 10);
  const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateUserResponse.parse(stripPwd(u)));
});

router.delete("/users/:id", requireRole("super_admin", "tenant_owner"), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const me = req.user!;
  if (me.id === id) { res.status(400).json({ error: "Cannot delete self" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (me.role !== "super_admin") {
    if (!me.tenantId || !target.tenantId || target.tenantId !== me.tenantId || target.role === "super_admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

function stripPwd(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

// keep `and` import used (silences unused warnings if helper is added later)
void and;

export default router;
