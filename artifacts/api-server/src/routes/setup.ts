import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, tenantsTable, usersTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const SETUP_TOKEN = "ideaeventime-setup-2026";

router.post("/setup/ideaeventime", async (req, res) => {
  if (req.headers["x-setup-token"] !== SETUP_TOKEN) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const existing = await db.select().from(usersTable)
    .where(eq(usersTable.email, "ideaeventime@gmail.com"))
    .limit(1);

  if (existing.length > 0) {
    res.json({ ok: true, message: "user already exists", user: existing[0] });
    return;
  }

  const [tenant] = await db.insert(tenantsTable).values({
    slug: "ideaeventime",
    name: "IDEAeventime",
    plan: "pro",
    brandColor: "#F5B642",
    locale: "it",
    mrr: 0,
  }).returning();

  const pwd = await bcrypt.hash("ideagame", 10);
  const [user] = await db.insert(usersTable).values({
    email: "ideaeventime@gmail.com",
    name: "IDEAeventime Owner",
    role: "tenant_owner",
    locale: "it",
    passwordHash: pwd,
    tenantId: tenant!.id,
  }).returning();

  await db.insert(eventsTable).values({
    tenantId: tenant!.id,
    name: "Demo IDEAeventime",
    venue: "Demo Venue",
    startsAt: new Date(),
    status: "live",
    brandColor: "#F5B642",
    expectedPlayers: 20,
    enabledGames: ["percorso-a-risate", "gioco-delle-coppie", "quizzone"],
    joinCode: "IDEA01",
  });

  res.json({ ok: true, message: "ideaeventime tenant + user + event created", userId: user!.id, tenantId: tenant!.id });
});

export default router;
