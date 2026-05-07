import { Router, type IRouter, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, scoresTable, teamsTable, eventsTable } from "@workspace/db";
import { ListScoresResponse, RecordScoreBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

async function eventOwned(req: AuthedRequest, eventId: string): Promise<boolean> {
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return false;
  return req.user!.role === "super_admin" || e.tenantId === req.user!.tenantId;
}

router.get("/events/:id/scores", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(scoresTable).where(eq(scoresTable.eventId, eventId));
  res.json(ListScoresResponse.parse(rows));
});

router.post("/events/:id/scores", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
  if (!(await eventOwned(req, eventId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = RecordScoreBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [s] = await db.insert(scoresTable).values({
    eventId,
    teamId: parsed.data.teamId,
    gameSlug: parsed.data.gameSlug,
    round: parsed.data.round ?? 1,
    points: parsed.data.points,
  }).returning();

  // Bump aggregated team score
  const [team] = await db
    .update(teamsTable)
    .set({ score: sql`${teamsTable.score} + ${parsed.data.points}` })
    .where(eq(teamsTable.id, parsed.data.teamId))
    .returning();

  // Emit realtime events
  emitToEvent(eventId, "score:updated", { score: s, team });
  emitToEvent(eventId, "team:updated", team);

  res.status(201).json(s);
});

export default router;
