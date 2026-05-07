import { Router, type IRouter, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, scoresTable, teamsTable } from "@workspace/db";
import {
  ListScoresResponse, RecordScoreBody
} from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/events/:id/scores", async (req, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const rows = await db.select().from(scoresTable).where(eq(scoresTable.eventId, eventId));
  res.json(ListScoresResponse.parse(rows));
});

router.post("/events/:id/scores", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const eventId = String(req.params["id"]);
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
  await db.update(teamsTable)
    .set({ score: sql`${teamsTable.score} + ${parsed.data.points}` })
    .where(eq(teamsTable.id, parsed.data.teamId));

  res.status(201).json(s);
});

export default router;
