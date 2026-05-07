import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, playersTable, eventsTable } from "@workspace/db";
import {
  ListPlayersResponse, JoinPlayerBody,
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function eventOwned(req: AuthedRequest, eventId: string): Promise<boolean> {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return false;
  return req.user!.role === "super_admin" || e.tenantId === req.user!.tenantId;
}

router.get("/events/:id/players", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(playersTable).where(eq(playersTable.eventId, eventId));
  res.json(ListPlayersResponse.parse(rows));
});

// POST stays public — players join by event id without auth (consumed by /play join code flow)
router.post("/events/:id/players", async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
  const parsed = JoinPlayerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Verify event exists before allowing join
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Event not found" }); return; }
  const [p] = await db.insert(playersTable).values({
    eventId,
    nickname: parsed.data.nickname,
    avatarColor: parsed.data.avatarColor ?? "#F5B642",
    teamId: parsed.data.teamId ?? null,
  }).returning();
  res.status(201).json(p);
});

router.delete("/players/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [existing] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await eventOwned(req, existing.eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(playersTable).where(eq(playersTable.id, id));
  res.sendStatus(204);
});

export default router;
