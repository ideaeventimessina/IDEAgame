import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, eventsTable, teamsTable, playersTable, scoresTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * Public endpoint — no auth required.
 * Used by the Player join flow to look up an event by its join code.
 */
router.get("/events/by-code/:code", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.joinCode, code));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.eventId, event.id));

  res.json({ event, teams });
});

/**
 * Public endpoint — no auth required.
 * Used by the projector Hub to show live players without a session.
 */
router.get("/events/by-code/:code/players", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.joinCode, code));
  if (!event || event.status !== "live") {
    res.status(404).json({ error: "Event not found or not live" });
    return;
  }
  const rows = await db.select().from(playersTable).where(eq(playersTable.eventId, event.id));
  res.json(rows);
});

/**
 * Public endpoint — no auth required.
 * Used by the Scoreboard projector to show live scores without a session.
 * Also accessible by event ID directly (for backward compat).
 */
router.get("/events/by-code/:code/scoreboard", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.joinCode, code));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, event.id));
  const scores = await db.select().from(scoresTable).where(eq(scoresTable.eventId, event.id));
  const out = teams.map(t => {
    const own = scores.filter(s => s.teamId === t.id);
    const byGame: Record<string, number> = {};
    for (const s of own) {
      const slug = s.gameSlug === 'freestyle-battle' ? 'karaoke-battle' : s.gameSlug;
      byGame[slug] = (byGame[slug] ?? 0) + s.points;
    }
    return { teamId: t.id, teamName: t.name, color: t.color, total: own.reduce((a, s) => a + s.points, 0) || t.score, byGame };
  }).sort((a, b) => b.total - a.total);
  res.json(out);
});

export default router;
