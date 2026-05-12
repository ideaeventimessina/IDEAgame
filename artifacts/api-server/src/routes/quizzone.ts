import { Router, type IRouter, type Response } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db, gameSessionsTable, roundsTable, quizPacksTable,
  playersTable, scoresTable, quizzoneResponsesTable, teamsTable, eventsTable,
} from "@workspace/db";
import type { QuizRound } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizzoneRoundPayload {
  mode: "quizzone";
  packId: string;
  roundIndex: number;
  revealed: boolean;
  questionStartedAt: string;
  type: string;
  questionText: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  points: number;
  timeLimit: number;
  totalRounds: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSession(sessionId: string) {
  const [s] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, sessionId));
  return s ?? null;
}

async function getCurrentRound(sessionId: string): Promise<{
  round: typeof roundsTable.$inferSelect | null;
  payload: QuizzoneRoundPayload | null;
}> {
  const rows = await db.select().from(roundsTable)
    .where(eq(roundsTable.gameSessionId, sessionId))
    .orderBy(desc(roundsTable.index), desc(roundsTable.createdAt))
    .limit(1);
  const round = rows[0] ?? null;
  if (!round?.payload || (round.payload as { mode?: string }).mode !== "quizzone") {
    return { round: null, payload: null };
  }
  return { round, payload: round.payload as unknown as QuizzoneRoundPayload };
}

async function getResponseCount(sessionId: string, roundIndex: number): Promise<number> {
  const [row] = await db.select({ n: count() }).from(quizzoneResponsesTable)
    .where(and(
      eq(quizzoneResponsesTable.sessionId, sessionId),
      eq(quizzoneResponsesTable.roundIndex, roundIndex),
    ));
  return row?.n ?? 0;
}

// Strip correctAnswer for public broadcast
function publicQuestion(payload: QuizzoneRoundPayload, sessionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { correctAnswer, ...pub } = payload;
  return { ...pub, sessionId };
}

// ─── Shared reveal helper ─────────────────────────────────────────────────────
// Used by both the manual /reveal endpoint and the auto-reveal on all-answered.
// Returns null if already revealed or no active round.
async function runReveal(sessionId: string): Promise<null | {
  roundIndex: number; correctAnswer: number; explanation: string;
  scores: { teamId: string; name: string; color: string; roundPoints: number; total: number }[];
}> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const { round, payload } = await getCurrentRound(sessionId);
  if (!payload || !round || payload.revealed) return null;

  const { roundIndex, correctAnswer, points: roundPoints } = payload;

  // Load responses for this round
  const responses = await db.select().from(quizzoneResponsesTable)
    .where(and(
      eq(quizzoneResponsesTable.sessionId, sessionId),
      eq(quizzoneResponsesTable.roundIndex, roundIndex),
    ));

  const questionStarted = new Date(payload.questionStartedAt).getTime();
  const teamPointsMap = new Map<string, number>();

  for (const resp of responses) {
    const elapsedMs = resp.submittedAt.getTime() - questionStarted;
    const inTime = elapsedMs <= (payload.timeLimit + 2) * 1000;
    const correct = resp.selectedAnswer === correctAnswer;
    const earned = correct && inTime ? roundPoints : 0;

    await db.update(quizzoneResponsesTable)
      .set({ isCorrect: correct, points: earned })
      .where(eq(quizzoneResponsesTable.id, resp.id));

    if (resp.teamId && earned > 0) {
      teamPointsMap.set(resp.teamId, (teamPointsMap.get(resp.teamId) ?? 0) + earned);
    }
  }

  // Write score entries per team
  for (const [teamId, pts] of teamPointsMap) {
    await db.insert(scoresTable).values({
      eventId: session.eventId,
      teamId,
      gameSlug: "quizzone",
      round: roundIndex + 1,
      points: pts,
    });
  }

  // Mark round revealed + completed
  await db.update(roundsTable)
    .set({
      payload: { ...payload, revealed: true } as Record<string, unknown>,
      status: "completed",
      endedAt: new Date(),
    })
    .where(eq(roundsTable.id, round.id));

  // Build scoreboard
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, session.eventId));
  const scoreRows = await db.select({
    teamId: scoresTable.teamId,
    total: sql<number>`SUM(${scoresTable.points})`,
  }).from(scoresTable)
    .where(and(eq(scoresTable.eventId, session.eventId), eq(scoresTable.gameSlug, "quizzone")))
    .groupBy(scoresTable.teamId);

  const scoreMap = new Map(scoreRows.map(r => [r.teamId, Number(r.total)]));
  const scores = teams.map(t => ({
    teamId: t.id,
    name: t.name,
    color: t.color,
    roundPoints: teamPointsMap.get(t.id) ?? 0,
    total: scoreMap.get(t.id) ?? 0,
  }));

  emitToEvent(session.eventId, "quiz:reveal", {
    sessionId,
    roundIndex,
    correctAnswer,
    explanation: payload.explanation,
    packId: payload.packId,
    scores,
  });
  emitToEvent(session.eventId, "score:updated", { eventId: session.eventId });

  return { roundIndex, correctAnswer, explanation: payload.explanation, scores };
}

// ─── POST /quizzone/sessions/:id/init ─────────────────────────────────────────
// Auth — host links a quiz pack to the session (called by LiveControl / Serata Completa)
router.post("/quizzone/sessions/:id/init", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const me = req.user!;
  if (me.role !== "super_admin") {
    const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, session.eventId));
    if (!ev || ev.tenantId !== me.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const body = req.body as { packId?: string };
  const packId = String(body.packId ?? "");
  if (!isUUID(packId)) { res.status(400).json({ error: "packId obbligatorio" }); return; }

  const [pack] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, packId));
  if (!pack) { res.status(404).json({ error: "Quiz pack non trovato" }); return; }

  const totalRounds = Array.isArray(pack.generatedJson) ? (pack.generatedJson as unknown[]).length : 0;

  await db.update(gameSessionsTable)
    .set({
      gameSettings: { packId, packTitle: pack.title, totalRounds },
      totalRounds,
      status: "running",
      startedAt: new Date(),
    })
    .where(eq(gameSessionsTable.id, id));

  emitToEvent(session.eventId, "quiz:started", { sessionId: id, packId, packTitle: pack.title, totalRounds });

  res.json({ ok: true, sessionId: id, packId, packTitle: pack.title, totalRounds });
});

// ─── GET /quizzone/sessions/:id/state ─────────────────────────────────────────
// Public — projector, player phone
router.get("/quizzone/sessions/:id/state", async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const settings = (session.gameSettings ?? {}) as { packId?: string; packTitle?: string; totalRounds?: number };
  const { round, payload } = await getCurrentRound(id);

  if (!payload) {
    res.json({
      sessionId: id,
      status: session.status,
      hasQuestion: false,
      packId: settings.packId ?? null,
      packTitle: settings.packTitle ?? null,
      totalRounds: settings.totalRounds ?? 0,
    });
    return;
  }

  const responseCount = await getResponseCount(id, payload.roundIndex);

  const base = publicQuestion(payload, id);
  res.json({
    ...base,
    hasQuestion: true,
    status: session.status,
    roundId: round!.id,
    responseCount,
    packId: settings.packId ?? payload.packId ?? null,
    packTitle: settings.packTitle ?? null,
  });
});

// ─── POST /quizzone/sessions/:id/question ─────────────────────────────────────
// Auth — host starts a question
router.post("/quizzone/sessions/:id/question", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const me = req.user!;
  if (me.role !== "super_admin") {
    const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, session.eventId));
    if (!ev || ev.tenantId !== me.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const body = req.body as { packId?: string; roundIndex?: number };
  const packId = String(body.packId ?? "");
  const roundIndex = Number(body.roundIndex ?? 0);

  if (!isUUID(packId)) { res.status(400).json({ error: "packId obbligatorio" }); return; }

  // Load pack
  const [pack] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, packId));
  if (!pack) { res.status(404).json({ error: "Quiz pack non trovato" }); return; }
  if (!Array.isArray(pack.generatedJson)) { res.status(400).json({ error: "Pack senza domande generate" }); return; }

  const rounds = pack.generatedJson as QuizRound[];
  if (roundIndex < 0 || roundIndex >= rounds.length) {
    res.status(400).json({ error: "Indice round non valido" }); return;
  }

  const qr = rounds[roundIndex]!;
  const questionStartedAt = new Date().toISOString();

  // Complete any currently running rounds for this session
  await db.update(roundsTable)
    .set({ status: "completed", endedAt: new Date() })
    .where(and(eq(roundsTable.gameSessionId, id), eq(roundsTable.status, "running")));

  const payload: QuizzoneRoundPayload = {
    mode: "quizzone",
    packId,
    roundIndex,
    revealed: false,
    questionStartedAt,
    type: qr.type,
    questionText: qr.questionText,
    answers: qr.answers,
    correctAnswer: qr.correctAnswer,
    explanation: qr.explanation,
    points: qr.points,
    timeLimit: qr.timeLimit,
    totalRounds: rounds.length,
  };

  // Insert round
  const [newRound] = await db.insert(roundsTable).values({
    gameSessionId: id,
    index: roundIndex,
    status: "running",
    payload: payload as unknown as Record<string, unknown>,
    startedAt: new Date(),
  }).returning();

  // Update session currentRound
  await db.update(gameSessionsTable)
    .set({ currentRound: roundIndex + 1, status: "running" })
    .where(eq(gameSessionsTable.id, id));

  // Emit quiz:question (without correctAnswer)
  emitToEvent(session.eventId, "quiz:question", publicQuestion(payload, id));
  if (roundIndex === 0) {
    emitToEvent(session.eventId, "quiz:started", { sessionId: id, packId, totalRounds: rounds.length });
  }

  res.status(201).json({ roundId: newRound!.id, ...publicQuestion(payload, id) });
});

// ─── POST /quizzone/sessions/:id/answer ───────────────────────────────────────
// Public — player submits answer (no auth required)
router.post("/quizzone/sessions/:id/answer", async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  if (session.status !== "running") { res.status(409).json({ error: "Sessione non in esecuzione" }); return; }

  const { round, payload } = await getCurrentRound(id);
  if (!payload || !round) { res.status(409).json({ error: "Nessuna domanda attiva" }); return; }
  if (payload.revealed) { res.status(409).json({ error: "Risposta già rivelata" }); return; }

  const body = req.body as { playerId?: string; selectedAnswer?: number };
  const playerId = String(body.playerId ?? "");
  const selectedAnswer = Number(body.selectedAnswer ?? -1);

  if (!isUUID(playerId)) { res.status(400).json({ error: "playerId obbligatorio" }); return; }
  if (selectedAnswer < 0 || selectedAnswer >= payload.answers.length) {
    res.status(400).json({ error: "Risposta non valida" }); return;
  }

  // Validate player exists and belongs to this event
  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.eventId, session.eventId)));
  if (!player) { res.status(403).json({ error: "Giocatore non appartiene a questo evento" }); return; }

  // Check time limit
  const questionStarted = new Date(payload.questionStartedAt).getTime();
  const elapsed = (Date.now() - questionStarted) / 1000;
  const inTime = elapsed <= payload.timeLimit + 2; // 2s grace

  // Insert response (catch duplicate)
  try {
    await db.insert(quizzoneResponsesTable).values({
      sessionId: id,
      packId: payload.packId,
      roundIndex: payload.roundIndex,
      playerId,
      teamId: player.teamId ?? null,
      selectedAnswer,
    });
  } catch (err) {
    const e = err as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string } };
    const pgCode = e.code ?? e.cause?.code ?? "";
    const pgConstraint = e.constraint ?? e.cause?.constraint ?? e.message ?? "";
    if (pgCode === "23505" || pgConstraint.includes("unique") || pgConstraint.includes("quizzone_responses_unique")) {
      res.status(409).json({ error: "Hai già risposto a questa domanda", alreadyAnswered: true });
      return;
    }
    throw err;
  }

  const responseCount = await getResponseCount(id, payload.roundIndex);
  emitToEvent(session.eventId, "quiz:answer_received", {
    sessionId: id, roundIndex: payload.roundIndex, count: responseCount,
  });

  // Auto-reveal if all connected players have answered
  const [{ n: playerCount }] = await db.select({ n: count() }).from(playersTable)
    .where(and(eq(playersTable.eventId, session.eventId), eq(playersTable.isConnected, true)));
  if (responseCount >= playerCount && playerCount > 0) {
    // Fire-and-forget: don't block the player response
    void runReveal(id).catch(() => { /* already revealed or no round — ignore */ });
  }

  res.json({ saved: true, inTime, roundIndex: payload.roundIndex, responseCount });
});

// ─── POST /quizzone/sessions/:id/reveal ───────────────────────────────────────
// Auth — host reveals answer and calculates scores
router.post("/quizzone/sessions/:id/reveal", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const me = req.user!;
  if (me.role !== "super_admin") {
    const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, session.eventId));
    if (!ev || ev.tenantId !== me.tenantId) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  // Use shared reveal helper (idempotent if already revealed)
  const result = await runReveal(id);
  if (!result) { res.status(409).json({ error: "Nessuna domanda attiva o già rivelata" }); return; }
  res.json({ ...result, responseCount: result.scores.reduce((s, t) => s + (t.roundPoints > 0 ? 1 : 0), 0) });
});


// ─── POST /quizzone/sessions/:id/end ──────────────────────────────────────────
// Auth — host ends quiz
router.post("/quizzone/sessions/:id/end", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  await db.update(roundsTable)
    .set({ status: "completed", endedAt: new Date() })
    .where(and(eq(roundsTable.gameSessionId, id), eq(roundsTable.status, "running")));

  await db.update(gameSessionsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(gameSessionsTable.id, id));

  // Build final podium
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.eventId, session.eventId));
  const scoreRows = await db.select({
    teamId: scoresTable.teamId,
    total: sql<number>`SUM(${scoresTable.points})`,
  }).from(scoresTable)
    .where(and(eq(scoresTable.eventId, session.eventId), eq(scoresTable.gameSlug, "quizzone")))
    .groupBy(scoresTable.teamId);
  const scoreMap = new Map(scoreRows.map(r => [r.teamId, Number(r.total)]));
  const podium = teams
    .map(t => ({ teamId: t.id, teamName: t.name, color: t.color, totalPoints: scoreMap.get(t.id) ?? 0 }))
    .filter(t => t.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Count rounds played
  const [{ totalRounds }] = await db.select({ totalRounds: count() }).from(roundsTable)
    .where(eq(roundsTable.gameSessionId, id));

  emitToEvent(session.eventId, "quiz:ended", { sessionId: id, podium });
  emitToEvent(session.eventId, "game:ended", { session: { ...session, status: "ended" }, eventId: session.eventId });

  res.json({ ended: true, totalRounds, podium });
});

export default router;
