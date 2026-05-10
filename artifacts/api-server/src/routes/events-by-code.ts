import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, eventsTable, teamsTable, playersTable } from "@workspace/db";

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

  if (event.status !== "live") {
    res.status(409).json({ error: "Event is not live", status: event.status });
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

export default router;
