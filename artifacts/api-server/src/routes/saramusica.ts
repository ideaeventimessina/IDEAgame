import { Router, type IRouter } from "express";
import { eq, asc, or, isNull } from "drizzle-orm";
import {
  db,
  saraMusicaSetsTable,
  saraMusicaTracksTable,
  saraMusicaSessionsTable,
  gameSessionsTable,
  teamsTable,
} from "@workspace/db";
import type { SaraMusicaState, SaraMusicaTeam, SaraMusicaTrack } from "@workspace/db";
import { type AuthedRequest, requireAuth, loadUser } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

function emit(eventId: string, event: string, payload: unknown) {
  emitToEvent(eventId, event, payload);
}

async function getEventIdForSession(sessionId: string): Promise<string | null> {
  const [gs] = await db
    .select({ eventId: gameSessionsTable.eventId })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId))
    .limit(1);
  return gs?.eventId ?? null;
}

async function getSMSession(sessionId: string) {
  const [row] = await db
    .select()
    .from(saraMusicaSessionsTable)
    .where(eq(saraMusicaSessionsTable.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}

async function saveState(smId: string, state: SaraMusicaState) {
  await db
    .update(saraMusicaSessionsTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(saraMusicaSessionsTable.id, smId));
}

function trackRowToTrack(r: typeof saraMusicaTracksTable.$inferSelect): SaraMusicaTrack {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    challengeType: r.challengeType as SaraMusicaTrack["challengeType"],
    snippetHint: r.snippetHint,
    audioUrl: r.audioUrl,
    durationSeconds: r.durationSeconds,
    points: r.points,
  };
}

async function buildFullState(sm: typeof saraMusicaSessionsTable.$inferSelect, eventId: string): Promise<SaraMusicaState> {
  const state = sm.state as SaraMusicaState;
  const dbTeams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color })
    .from(teamsTable)
    .where(eq(teamsTable.eventId, eventId));

  const scoreMap = new Map((state.teams ?? []).map((t) => [t.id, t.score]));
  const teams: SaraMusicaTeam[] = dbTeams.map((t) => ({ ...t, score: scoreMap.get(t.id) ?? 0 }));
  return { ...state, teams };
}

/* ── Sets CRUD ────────────────────────────────────────────────────────────── */

router.get("/saramusica/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const tenantId = ar.user!.role === "super_admin" ? undefined : ar.user!.tenantId;
  const rows = await db
    .select()
    .from(saraMusicaSetsTable)
    .where(tenantId ? or(eq(saraMusicaSetsTable.tenantId, tenantId), isNull(saraMusicaSetsTable.tenantId)) : undefined)
    .orderBy(asc(saraMusicaSetsTable.createdAt));
  res.json(rows);
});

router.post("/saramusica/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const { title, description = "" } = req.body as { title: string; description?: string };
  if (!title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  const tenantId = ar.user!.role === "super_admin" ? (req.body.tenantId ?? null) : ar.user!.tenantId;
  const [row] = await db.insert(saraMusicaSetsTable).values({ title: title.trim(), description, tenantId }).returning();
  res.status(201).json(row);
});

router.delete("/saramusica/sets/:id", requireAuth, async (req, res) => {
  await db.delete(saraMusicaSetsTable).where(eq(saraMusicaSetsTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── Tracks CRUD ──────────────────────────────────────────────────────────── */

router.get("/saramusica/sets/:id/tracks", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(saraMusicaTracksTable)
    .where(eq(saraMusicaTracksTable.setId, req.params.id as string))
    .orderBy(asc(saraMusicaTracksTable.orderIndex));
  res.json(rows);
});

router.post("/saramusica/sets/:id/tracks", requireAuth, async (req, res) => {
  const setId = req.params.id as string;
  const {
    title, artist,
    challengeType = "indovina",
    snippetHint = "",
    audioUrl = null,
    durationSeconds = 30,
    points = 100,
    orderIndex = 0,
  } = req.body as {
    title: string; artist: string; challengeType?: string;
    snippetHint?: string; audioUrl?: string | null;
    durationSeconds?: number; points?: number; orderIndex?: number;
  };
  if (!title?.trim() || !artist?.trim()) { res.status(400).json({ error: "title and artist required" }); return; }
  const [row] = await db
    .insert(saraMusicaTracksTable)
    .values({ setId, title: title.trim(), artist: artist.trim(), challengeType, snippetHint, audioUrl: audioUrl || null, durationSeconds, points, orderIndex })
    .returning();
  res.status(201).json(row);
});

router.patch("/saramusica/tracks/:id", requireAuth, async (req, res) => {
  const updates: Partial<typeof saraMusicaTracksTable.$inferInsert> = {};
  const fields = ["title","artist","challengeType","snippetHint","audioUrl","durationSeconds","points","orderIndex","isActive"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (updates as Record<string, unknown>)[f] = req.body[f]; }
  const [row] = await db.update(saraMusicaTracksTable).set(updates).where(eq(saraMusicaTracksTable.id, req.params.id as string)).returning();
  res.json(row);
});

router.delete("/saramusica/tracks/:id", requireAuth, async (req, res) => {
  await db.delete(saraMusicaTracksTable).where(eq(saraMusicaTracksTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── Session: init ────────────────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/init", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { setId, activeTeamId = null } = req.body as { setId: string; activeTeamId?: string | null };
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }

  const [smSet] = await db.select().from(saraMusicaSetsTable).where(eq(saraMusicaSetsTable.id, setId)).limit(1);
  if (!smSet) { res.status(404).json({ error: "Set not found" }); return; }

  const tracks = await db
    .select()
    .from(saraMusicaTracksTable)
    .where(eq(saraMusicaTracksTable.setId, setId))
    .orderBy(asc(saraMusicaTracksTable.orderIndex));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Session not found" }); return; }

  const dbTeams = await db.select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color }).from(teamsTable).where(eq(teamsTable.eventId, eventId));
  const firstTeamId = activeTeamId ?? dbTeams[0]?.id ?? null;

  const initialState: SaraMusicaState = {
    setId,
    setName: smSet.title,
    currentTrack: tracks[0] ? trackRowToTrack(tracks[0]) : null,
    activeTeamId: firstTeamId,
    teams: dbTeams.map((t) => ({ ...t, score: 0 })),
    status: "idle",
    trackStartedAt: null,
    noiseLevel: 0,
    usedTrackIds: [],
  };

  const existing = await getSMSession(sessionId);
  let smRow: typeof saraMusicaSessionsTable.$inferSelect;
  if (existing) {
    [smRow] = await db.update(saraMusicaSessionsTable).set({ setId, state: initialState, updatedAt: new Date() }).where(eq(saraMusicaSessionsTable.sessionId, sessionId)).returning();
  } else {
    [smRow] = await db.insert(saraMusicaSessionsTable).values({ sessionId, setId, state: initialState }).returning();
  }

  const fullState = await buildFullState(smRow, eventId);
  emit(eventId, "saramusica:started", { state: fullState });
  res.json(fullState);
});

/* ── Session: get state (public) ─────────────────────────────────────────── */

router.get("/saramusica/sessions/:id/state", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }
  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState(sm, eventId);
  res.json(fullState);
});

/* ── Session: start track ─────────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/start-track", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const newState: SaraMusicaState = { ...state, status: "playing", trackStartedAt: new Date().toISOString(), noiseLevel: 0 };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:track_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: next track ──────────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/next-track", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const usedIds = [...(state.usedTrackIds ?? [])];
  if (state.currentTrack) usedIds.push(state.currentTrack.id);

  const tracks = await db
    .select()
    .from(saraMusicaTracksTable)
    .where(eq(saraMusicaTracksTable.setId, sm.setId!))
    .orderBy(asc(saraMusicaTracksTable.orderIndex));

  const available = tracks.filter((t) => !usedIds.includes(t.id));
  const next = available[0] ?? null;

  const newState: SaraMusicaState = {
    ...state,
    currentTrack: next ? trackRowToTrack(next) : null,
    usedTrackIds: usedIds,
    status: next ? "idle" : "ended",
    trackStartedAt: null,
    noiseLevel: 0,
  };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:track_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: set active team ─────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/set-team", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { teamId } = req.body as { teamId: string };
  if (!teamId) { res.status(400).json({ error: "teamId required" }); return; }

  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const newState: SaraMusicaState = { ...state, activeTeamId: teamId };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:track_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: noise update (public — from player mic) ────────────────────── */

router.post("/saramusica/sessions/:id/noise", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const { level } = req.body as { level: number };
  if (level === undefined) { res.status(400).json({ error: "level required" }); return; }

  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const noiseLevel = Math.max(0, Math.min(100, level));
  const newState: SaraMusicaState = { ...state, noiseLevel };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:noise", { state: fullState });
  res.json({ ok: true, noiseLevel });
});

/* ── Session: score ───────────────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/score", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { teamId, points } = req.body as { teamId: string; points: number };
  if (!teamId || points === undefined) { res.status(400).json({ error: "teamId and points required" }); return; }

  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const newTeams = (state.teams ?? []).map((t) => t.id === teamId ? { ...t, score: t.score + points } : t);
  const newState: SaraMusicaState = { ...state, teams: newTeams };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:score_updated", { state: fullState });
  res.json(fullState);
});

/* ── Session: end ─────────────────────────────────────────────────────────── */

router.post("/saramusica/sessions/:id/end", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const sm = await getSMSession(sessionId);
  if (!sm) { res.status(404).json({ error: "Session not found" }); return; }

  const state = sm.state as SaraMusicaState;
  const newState: SaraMusicaState = { ...state, status: "ended" };
  await saveState(sm.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const fullState = await buildFullState({ ...sm, state: newState }, eventId);
  emit(eventId, "saramusica:ended", { state: fullState });
  res.json(fullState);
});

export default router;
