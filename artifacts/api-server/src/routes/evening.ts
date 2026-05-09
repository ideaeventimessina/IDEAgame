import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  eveningModesTable,
  eventsTable,
  gameSessionsTable,
  teamsTable,
  scoresTable,
} from "@workspace/db";
import type { EveningGame } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

/**
 * In-memory lock to prevent concurrent /advance calls for the same event.
 * Prevents duplicate game sessions when two admins click "Avanti" simultaneously.
 */
const _advanceLocks = new Set<string>();

const BASE_PLAYLIST: EveningGame[] = [
  { slug: "percorso-a-risate", label: "Percorso a Risate", emoji: "🎭", sessionId: null, status: "pending" },
  { slug: "gioco-coppie",      label: "Gioco delle Coppie", emoji: "🃏", sessionId: null, status: "pending" },
  { slug: "quizzone",          label: "Quizzone",           emoji: "❓", sessionId: null, status: "pending" },
];
const ADULT_ONLY_GAME: EveningGame = {
  slug: "adult-only", label: "Adult Only", emoji: "🔞", sessionId: null, status: "pending",
};

function buildPlaylist(includeAdultOnly: boolean): EveningGame[] {
  return includeAdultOnly ? [...BASE_PLAYLIST, ADULT_ONLY_GAME] : [...BASE_PLAYLIST];
}

function guardEvent(req: AuthedRequest, event: { tenantId: string | null }): boolean {
  return req.user!.role === "super_admin" || event.tenantId === req.user!.tenantId;
}

// GET /events/:id/evening
router.get("/events/:id/evening", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [mode] = await db.select().from(eveningModesTable).where(eq(eveningModesTable.eventId, eventId));
  res.json(mode ?? null);
});

// POST /events/:id/evening/init  — create or reset playlist (optionally include Adult Only)
router.post("/events/:id/evening/init", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }
  const includeAdultOnly = Boolean((req.body as Record<string, unknown>)?.includeAdultOnly);
  const playlist = buildPlaylist(includeAdultOnly);
  await db.delete(eveningModesTable).where(eq(eveningModesTable.eventId, eventId));
  const [mode] = await db.insert(eveningModesTable).values({
    eventId,
    playlist: playlist as unknown as EveningGame[],
    status: "idle",
  }).returning();
  emitToEvent(eventId, "evening:updated", { evening: mode, session: null });
  res.status(201).json(mode);
});

// POST /events/:id/evening/advance  — mark current game done, start next
router.post("/events/:id/evening/advance", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);

  // Prevent concurrent advances for the same event (two admins clicking simultaneously)
  if (_advanceLocks.has(eventId)) {
    res.status(409).json({ error: "Avanzamento già in corso, riprova" });
    return;
  }
  _advanceLocks.add(eventId);

  try {
    const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }
    const [mode] = await db.select().from(eveningModesTable).where(eq(eveningModesTable.eventId, eventId));
    if (!mode) { res.status(404).json({ error: "Evening mode not initialized" }); return; }

    const playlist = [...(mode.playlist as EveningGame[])];

    // Mark any running game as done
    const runningIdx = playlist.findIndex(g => g.status === "running");
    if (runningIdx >= 0) {
      playlist[runningIdx] = { ...playlist[runningIdx]!, status: "done" };
    }

    // Find next pending game
    const nextIdx = playlist.findIndex(g => g.status === "pending");
    let newSession: typeof gameSessionsTable.$inferSelect | null = null;
    let newStatus = "running";

    if (nextIdx >= 0) {
      const slug = playlist[nextIdx]!.slug;
      const totalRounds = slug === "quizzone" ? 5 : 1;
      const [s] = await db.insert(gameSessionsTable).values({
        eventId, gameSlug: slug, status: "idle", currentRound: 0, totalRounds,
      }).returning();
      newSession = s ?? null;
      if (newSession) {
        playlist[nextIdx] = { ...playlist[nextIdx]!, sessionId: newSession.id, status: "running" };
      }
    } else {
      newStatus = "ended";
    }

    const [updated] = await db.update(eveningModesTable)
      .set({ playlist: playlist as unknown as EveningGame[], status: newStatus, updatedAt: new Date() })
      .where(eq(eveningModesTable.id, mode.id))
      .returning();

    emitToEvent(eventId, "evening:updated", { evening: updated, session: newSession });
    res.json({ evening: updated, session: newSession });
  } finally {
    _advanceLocks.delete(eventId);
  }
});

// DELETE /events/:id/evening  — reset
router.delete("/events/:id/evening", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(eveningModesTable).where(eq(eveningModesTable.eventId, eventId));
  res.sendStatus(204);
});

// GET /events/:id/evening/scoreboard  — per-team, per-game breakdown (slugs from playlist)
router.get("/events/:id/evening/scoreboard", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const eventId = String(req.params["id"]);
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (!guardEvent(req, e)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [mode] = await db.select().from(eveningModesTable).where(eq(eveningModesTable.eventId, eventId));
  // Derive slugs from the actual playlist so Adult Only is included when present
  const SLUGS: string[] = mode
    ? (mode.playlist as EveningGame[]).map((g: EveningGame) => g.slug)
    : ["percorso-a-risate", "gioco-coppie", "quizzone"];
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, eventId));
  const scores = await db.select().from(scoresTable).where(eq(scoresTable.eventId, eventId));
  const result = teams.map(t => {
    const own = scores.filter(s => s.teamId === t.id);
    const byGame: Record<string, number> = {};
    for (const slug of SLUGS) {
      byGame[slug] = own.filter(s => s.gameSlug === slug).reduce((a, s) => a + s.points, 0);
    }
    const total = own.reduce((a, s) => a + s.points, 0) || t.score;
    return { id: t.id, name: t.name, color: t.color, byGame, total };
  }).sort((a, b) => b.total - a.total);
  res.json(result);
});

export default router;
