import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const ALLOWED_EVENTS = new Set([
  "projector:black",
  "projector:black-off",
  "projector:close-overlays",
  "projector:go-scoreboard",
  "game:freeze-timer",
  "game:unfreeze-timer",
  "players:force-refresh",
  "hub:phase",
  "hub:game-preloaded",
]);

function guardEvent(req: AuthedRequest, event: { tenantId: string | null }): boolean {
  return req.user!.role === "super_admin" || event.tenantId === req.user!.tenantId;
}

/**
 * POST /panic/events/:id/emit
 * Body: { event: string, payload?: object }
 * Broadcasts a whitelisted socket event to all clients in the event room.
 * Auth: entertainer+ required (must own the event).
 */
router.post("/panic/events/:id/emit", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const body = req.body as Record<string, unknown>;
  const eventName = String(body["event"] ?? "");
  const payload = (body["payload"] ?? {}) as object;

  if (!ALLOWED_EVENTS.has(eventName)) {
    res.status(400).json({ error: `Evento non consentito: "${eventName}"` });
    return;
  }

  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Evento non trovato" }); return; }
  if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }

  emitToEvent(eventId, eventName, payload);
  res.json({ ok: true, event: eventName });
});

export default router;
