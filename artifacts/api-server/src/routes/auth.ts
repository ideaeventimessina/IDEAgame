import { Router, type IRouter, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function meFor(userId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return null;
  let tenantName: string | null = null;
  if (u.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, u.tenantId));
    tenantName = t?.name ?? null;
  }
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale,
    tenantId: u.tenantId, tenantName,
  };
}

router.post("/auth/login", async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }

  req.session.userId = user.id;
  const me = await meFor(user.id);
  res.json(LoginResponse.parse(me));
});

router.post("/auth/logout", (req: AuthedRequest, res: Response): void => {
  req.session.destroy(() => {
    res.clearCookie("ideagame.sid");
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const me = await meFor(req.user!.id);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(GetMeResponse.parse(me));
});

export default router;
