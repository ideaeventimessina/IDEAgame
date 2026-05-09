import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamsTable, scoresTable, eventsTable } from "@workspace/db";
import { GetScoreboardResponse } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/events/:id/scoreboard", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, eventId));
  const scores = await db.select().from(scoresTable).where(eq(scoresTable.eventId, eventId));
  const out = teams.map(t => {
    const own = scores.filter(s => s.teamId === t.id);
    const byGame: Record<string, number> = {};
    for (const s of own) {
      // Normalise: freestyle-battle scores count under karaoke-battle
      const slug = s.gameSlug === 'freestyle-battle' ? 'karaoke-battle' : s.gameSlug;
      byGame[slug] = (byGame[slug] ?? 0) + s.points;
    }
    const summed = own.reduce((a, s) => a + s.points, 0);
    return { teamId: t.id, teamName: t.name, color: t.color, total: summed || t.score, byGame };
  }).sort((a, b) => b.total - a.total);
  res.json(GetScoreboardResponse.parse(out));
});

router.patch("/scores/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [s] = await db.select().from(scoresTable).where(eq(scoresTable.id, id));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, s.eventId));
  if (req.user!.role !== "super_admin" && e?.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.points === "number") patch["points"] = req.body.points;
  if (typeof req.body?.round === "number") patch["round"] = req.body.round;
  const [u] = await db.update(scoresTable).set(patch).where(eq(scoresTable.id, id)).returning();
  res.json(u);
});

router.delete("/scores/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [s] = await db.select().from(scoresTable).where(eq(scoresTable.id, id));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, s.eventId));
  if (req.user!.role !== "super_admin" && e?.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(scoresTable).where(eq(scoresTable.id, id));
  res.sendStatus(204);
});

export default router;
