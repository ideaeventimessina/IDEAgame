import { Router, type IRouter, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, gameSessionsTable, eventsTable } from "@workspace/db";
import { ListGameSessionsResponse, CreateGameSessionBody, UpdateGameSessionBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();

async function eventOwned(req: AuthedRequest, eventId: string) {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId) return null;
  return e;
}

router.get("/events/:id/sessions", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.eventId, eventId)).orderBy(desc(gameSessionsTable.createdAt));
  res.json(ListGameSessionsResponse.parse(rows));
});

router.post("/events/:id/sessions", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = CreateGameSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [s] = await db.insert(gameSessionsTable).values({
    eventId,
    gameSlug: parsed.data.gameSlug,
    totalRounds: parsed.data.totalRounds ?? 1,
  }).returning();
  await audit(req, "game_session.create", "game_session", s!.id, { gameSlug: s!.gameSlug });
  res.status(201).json(s);
});

router.patch("/sessions/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = UpdateGameSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [s] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, id));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await eventOwned(req, s.eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "running" && !s.startedAt) patch["startedAt"] = new Date();
  if (parsed.data.status === "ended") patch["endedAt"] = new Date();
  const [u] = await db.update(gameSessionsTable).set(patch).where(eq(gameSessionsTable.id, id)).returning();
  await audit(req, "game_session.update", "game_session", id, parsed.data);
  res.json(u);
});

export default router;
