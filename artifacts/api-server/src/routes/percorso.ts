import { Router, type IRouter, type Response, type Request } from "express";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import {
  db,
  laughingPathSetsTable,
  laughingPathStepsTable,
  laughingPathSessionsTable,
  gameSessionsTable,
  eventsTable,
  teamsTable,
  scoresTable,
} from "@workspace/db";
import type { PercorsoState, PercorsoStepInState, PercorsoTeam } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string): boolean { return UUID_RE.test(s); }

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function getSessionEventId(sessionId: string): Promise<string | null> {
  if (!isUUID(sessionId)) return null;
  const [s] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, sessionId));
  return s?.eventId ?? null;
}

async function guardSessionAuth(req: AuthedRequest, sessionId: string): Promise<string | null> {
  const eventId = await getSessionEventId(sessionId);
  if (!eventId) return null;
  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId) return null;
  return eventId;
}

async function getPercorsoState(sessionId: string): Promise<PercorsoState | null> {
  const [row] = await db
    .select()
    .from(laughingPathSessionsTable)
    .where(eq(laughingPathSessionsTable.sessionId, sessionId));
  return row?.state ?? null;
}

async function savePercorsoState(sessionId: string, state: PercorsoState): Promise<void> {
  await db
    .update(laughingPathSessionsTable)
    .set({ state })
    .where(eq(laughingPathSessionsTable.sessionId, sessionId));
}

/* ══════════════════════════════════════════════════════════════════════════
   SETS CRUD
══════════════════════════════════════════════════════════════════════════ */

/* GET /percorso/sets */
router.get("/percorso/sets", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const where =
    req.user!.role === "super_admin"
      ? undefined
      : or(eq(laughingPathSetsTable.tenantId, req.user!.tenantId!), isNull(laughingPathSetsTable.tenantId));
  const rows = where
    ? await db.select().from(laughingPathSetsTable).where(where).orderBy(laughingPathSetsTable.createdAt)
    : await db.select().from(laughingPathSetsTable).orderBy(laughingPathSetsTable.createdAt);
  res.json(rows);
});

/* POST /percorso/sets */
router.post("/percorso/sets", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name obbligatorio" }); return; }
  const [row] = await db
    .insert(laughingPathSetsTable)
    .values({
      name: name.trim(),
      description: description?.trim() ?? "",
      tenantId: req.user!.role === "super_admin" ? null : req.user!.tenantId ?? null,
    })
    .returning();
  res.status(201).json(row);
});

/* PATCH /percorso/sets/:id */
router.patch("/percorso/sets/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [row] = await db.select().from(laughingPathSetsTable).where(eq(laughingPathSetsTable.id, id));
  if (!row) { res.status(404).json({ error: "Set non trovato" }); return; }
  if (req.user!.role !== "super_admin" && row.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { name, description } = req.body as { name?: string; description?: string };
  const patch: Record<string, unknown> = {};
  if (name?.trim()) patch["name"] = name.trim();
  if (description !== undefined) patch["description"] = description.trim();
  const [updated] = await db
    .update(laughingPathSetsTable)
    .set(patch)
    .where(eq(laughingPathSetsTable.id, id))
    .returning();
  res.json(updated);
});

/* DELETE /percorso/sets/:id */
router.delete("/percorso/sets/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [row] = await db.select().from(laughingPathSetsTable).where(eq(laughingPathSetsTable.id, id));
  if (!row) { res.status(404).json({ error: "Set non trovato" }); return; }
  if (req.user!.role !== "super_admin" && row.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(laughingPathSetsTable).where(eq(laughingPathSetsTable.id, id));
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   STEPS CRUD
══════════════════════════════════════════════════════════════════════════ */

/* GET /percorso/sets/:id/steps */
router.get("/percorso/sets/:id/steps", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const rows = await db
    .select()
    .from(laughingPathStepsTable)
    .where(eq(laughingPathStepsTable.setId, id))
    .orderBy(asc(laughingPathStepsTable.orderIndex));
  res.json(rows);
});

/* POST /percorso/sets/:id/steps */
router.post("/percorso/sets/:id/steps", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const body = req.body as {
    title?: string; description?: string; challengeType?: string;
    points?: number; timeLimit?: number; optionalMediaUrl?: string; orderIndex?: number; isActive?: boolean;
  };
  if (!body.title?.trim()) { res.status(400).json({ error: "title obbligatorio" }); return; }

  // Auto-assign orderIndex if not provided
  let orderIndex = body.orderIndex ?? 0;
  if (body.orderIndex === undefined) {
    const existing = await db
      .select()
      .from(laughingPathStepsTable)
      .where(eq(laughingPathStepsTable.setId, id))
      .orderBy(asc(laughingPathStepsTable.orderIndex));
    orderIndex = existing.length > 0 ? (existing[existing.length - 1]!.orderIndex + 1) : 0;
  }

  const [row] = await db
    .insert(laughingPathStepsTable)
    .values({
      setId: id,
      title: body.title.trim(),
      description: body.description?.trim() ?? "",
      challengeType: body.challengeType ?? "sfida",
      points: body.points ?? 100,
      timeLimit: body.timeLimit ?? 30,
      optionalMediaUrl: body.optionalMediaUrl ?? null,
      orderIndex,
      isActive: body.isActive ?? true,
    })
    .returning();
  res.status(201).json(row);
});

/* PATCH /percorso/steps/:id */
router.patch("/percorso/steps/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [row] = await db.select().from(laughingPathStepsTable).where(eq(laughingPathStepsTable.id, id));
  if (!row) { res.status(404).json({ error: "Step non trovato" }); return; }

  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body["title"] !== undefined) patch["title"] = String(body["title"]).trim();
  if (body["description"] !== undefined) patch["description"] = String(body["description"]).trim();
  if (body["challengeType"] !== undefined) patch["challengeType"] = String(body["challengeType"]);
  if (body["points"] !== undefined) patch["points"] = Number(body["points"]);
  if (body["timeLimit"] !== undefined) patch["timeLimit"] = Number(body["timeLimit"]);
  if (body["optionalMediaUrl"] !== undefined) patch["optionalMediaUrl"] = body["optionalMediaUrl"] ? String(body["optionalMediaUrl"]) : null;
  if (body["orderIndex"] !== undefined) patch["orderIndex"] = Number(body["orderIndex"]);
  if (body["isActive"] !== undefined) patch["isActive"] = Boolean(body["isActive"]);

  const [updated] = await db
    .update(laughingPathStepsTable)
    .set(patch)
    .where(eq(laughingPathStepsTable.id, id))
    .returning();
  res.json(updated);
});

/* DELETE /percorso/steps/:id */
router.delete("/percorso/steps/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  await db.delete(laughingPathStepsTable).where(eq(laughingPathStepsTable.id, id));
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   GAME SESSION CONTROL
══════════════════════════════════════════════════════════════════════════ */

/* GET /percorso/sessions/:id/state — PUBLIC (projector + player phones) */
router.get("/percorso/sessions/:id/state", async (req: Request, res): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }
  const state = await getPercorsoState(sessionId);
  if (!state) { res.status(404).json({ error: "Sessione non inizializzata" }); return; }
  res.json(state);
});

/* POST /percorso/sessions/:id/init */
router.post("/percorso/sessions/:id/init", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }

  const eventId = await guardSessionAuth(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { setId } = req.body as { setId?: string };
  if (!setId || !isUUID(setId)) { res.status(400).json({ error: "setId obbligatorio" }); return; }

  // Load set
  const [set] = await db.select().from(laughingPathSetsTable).where(eq(laughingPathSetsTable.id, setId));
  if (!set) { res.status(404).json({ error: "Set non trovato" }); return; }

  // Load active steps sorted by orderIndex
  const dbSteps = await db
    .select()
    .from(laughingPathStepsTable)
    .where(and(eq(laughingPathStepsTable.setId, setId), eq(laughingPathStepsTable.isActive, true)))
    .orderBy(asc(laughingPathStepsTable.orderIndex));

  if (dbSteps.length === 0) {
    res.status(422).json({ error: "Il set non ha step attivi" }); return;
  }

  // Load teams for the event
  const dbTeams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, eventId));
  const teams: PercorsoTeam[] = dbTeams.map(t => ({ id: t.id, name: t.name, color: t.color, score: 0 }));

  const steps: PercorsoStepInState[] = dbSteps.map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    challengeType: s.challengeType,
    points: s.points,
    timeLimit: s.timeLimit,
    optionalMediaUrl: s.optionalMediaUrl ?? null,
    orderIndex: s.orderIndex,
  }));

  const state: PercorsoState = {
    setId,
    setName: set.name,
    steps,
    currentStepIdx: -1,
    teams,
    status: "idle",
    lastFlash: null,
    timerStartedAt: null,
  };

  // Upsert
  await db.delete(laughingPathSessionsTable).where(eq(laughingPathSessionsTable.sessionId, sessionId));
  await db.insert(laughingPathSessionsTable).values({ sessionId, setId, state });

  emitToEvent(eventId, "path:started", { state });
  res.status(201).json(state);
});

/* POST /percorso/sessions/:id/next */
router.post("/percorso/sessions/:id/next", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }

  const eventId = await guardSessionAuth(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const state = await getPercorsoState(sessionId);
  if (!state) { res.status(404).json({ error: "Sessione non inizializzata" }); return; }
  if (state.status === "ended") { res.status(409).json({ error: "Gioco già terminato" }); return; }

  const nextIdx = state.currentStepIdx + 1;
  if (nextIdx >= state.steps.length) {
    res.status(409).json({ error: "Sei già all'ultima sfida" }); return;
  }

  const updated: PercorsoState = {
    ...state,
    currentStepIdx: nextIdx,
    status: "running",
    lastFlash: nextIdx === 0 ? { text: "🎉 Inizia il percorso!", type: "step" } : { text: "➡ Prossima sfida!", type: "step" },
    timerStartedAt: new Date().toISOString(),
  };

  await savePercorsoState(sessionId, updated);
  if (nextIdx === 0) {
    // Also update game_sessions status
    await db.update(gameSessionsTable).set({ status: "running", startedAt: new Date() }).where(eq(gameSessionsTable.id, sessionId));
  }

  emitToEvent(eventId, "path:step_changed", { state: updated, stepIdx: nextIdx });
  res.json(updated);
});

/* POST /percorso/sessions/:id/skip */
router.post("/percorso/sessions/:id/skip", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }

  const eventId = await guardSessionAuth(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const state = await getPercorsoState(sessionId);
  if (!state) { res.status(404).json({ error: "Sessione non inizializzata" }); return; }
  if (state.status === "ended") { res.status(409).json({ error: "Gioco già terminato" }); return; }

  const nextIdx = state.currentStepIdx + 1;
  if (nextIdx >= state.steps.length) {
    res.status(409).json({ error: "Sei già all'ultima sfida" }); return;
  }

  const updated: PercorsoState = {
    ...state,
    currentStepIdx: nextIdx,
    status: "running",
    lastFlash: { text: "⏭ Sfida saltata", type: "step" },
    timerStartedAt: new Date().toISOString(),
  };

  await savePercorsoState(sessionId, updated);
  emitToEvent(eventId, "path:step_changed", { state: updated, stepIdx: nextIdx });
  res.json(updated);
});

/* POST /percorso/sessions/:id/score */
router.post("/percorso/sessions/:id/score", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }

  const eventId = await guardSessionAuth(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const state = await getPercorsoState(sessionId);
  if (!state) { res.status(404).json({ error: "Sessione non inizializzata" }); return; }

  const { teamId, points } = req.body as { teamId?: string; points?: number };
  if (!teamId || !isUUID(teamId)) { res.status(400).json({ error: "teamId obbligatorio" }); return; }
  const pts = typeof points === "number" ? points : 100;

  const teamIdx = state.teams.findIndex(t => t.id === teamId);
  if (teamIdx < 0) { res.status(404).json({ error: "Squadra non trovata in questa sessione" }); return; }

  const updatedTeams = state.teams.map((t, i) =>
    i === teamIdx ? { ...t, score: t.score + pts } : t
  );
  const teamName = state.teams[teamIdx]!.name;
  const updated: PercorsoState = {
    ...state,
    teams: updatedTeams,
    lastFlash: { text: `🎉 +${pts} pt — ${teamName}!`, type: "score" },
  };

  await savePercorsoState(sessionId, updated);

  // Persist to scores table
  const currentStep = state.steps[state.currentStepIdx];
  await db.insert(scoresTable).values({
    eventId,
    teamId,
    gameSlug: "percorso-a-risate",
    points: pts,
    round: state.currentStepIdx + 1,
  }).catch(() => {});

  emitToEvent(eventId, "path:score_updated", { state: updated, teamId, points: pts });
  res.json(updated);
  void currentStep;
});

/* POST /percorso/sessions/:id/end */
router.post("/percorso/sessions/:id/end", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const sessionId = String(req.params["id"]);
  if (!isUUID(sessionId)) { res.status(400).json({ error: "sessionId non valido" }); return; }

  const eventId = await guardSessionAuth(req, sessionId);
  if (!eventId) { res.status(403).json({ error: "Forbidden" }); return; }

  const state = await getPercorsoState(sessionId);
  if (!state) { res.status(404).json({ error: "Sessione non inizializzata" }); return; }

  const updated: PercorsoState = {
    ...state,
    status: "ended",
    lastFlash: { text: "🏆 Fine percorso!", type: "end" },
  };

  await savePercorsoState(sessionId, updated);
  await db.update(gameSessionsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(gameSessionsTable.id, sessionId));

  emitToEvent(eventId, "path:ended", { state: updated });
  res.json(updated);
});

export default router;
