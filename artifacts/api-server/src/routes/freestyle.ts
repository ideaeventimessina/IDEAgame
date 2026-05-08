import { Router, type IRouter } from "express";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import {
  db,
  freestyleSetsTable,
  freestyleWordsTable,
  freestyleSessionsTable,
  freestyleBookingsTable,
  gameSessionsTable,
  teamsTable,
  playersTable,
} from "@workspace/db";
import type {
  FreestyleState,
  FreestyleTeam,
  FreestyleBooking,
  FreestyleWord,
} from "@workspace/db";
import { type AuthedRequest, requireAuth, loadUser } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

/* ── helpers ─────────────────────────────────────────────────────────────── */

function emit(eventId: string, event: string, payload: unknown) {
  emitToEvent(eventId, event, payload);
}

async function getEventIdForSession(sessionId: string | string[]): Promise<string | null> {
  const sid = Array.isArray(sessionId) ? sessionId[0]! : sessionId;
  const [gs] = await db
    .select({ eventId: gameSessionsTable.eventId })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sid))
    .limit(1);
  return gs?.eventId ?? null;
}

async function getFreestyleSession(sessionId: string | string[]) {
  const sid = Array.isArray(sessionId) ? sessionId[0]! : sessionId;
  const [fs] = await db
    .select()
    .from(freestyleSessionsTable)
    .where(eq(freestyleSessionsTable.sessionId, sid))
    .limit(1);
  return fs ?? null;
}

async function saveState(fsId: string, state: FreestyleState) {
  await db
    .update(freestyleSessionsTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(freestyleSessionsTable.id, fsId));
}

async function buildState(
  fs: typeof freestyleSessionsTable.$inferSelect,
  bookings: typeof freestyleBookingsTable.$inferSelect[],
  eventId: string,
): Promise<FreestyleState> {
  const state = fs.state as FreestyleState;

  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color })
    .from(teamsTable)
    .where(eq(teamsTable.eventId, eventId));

  const teamScoreMap = new Map((state.teams ?? []).map((t) => [t.id, t.score]));
  const fullTeams: FreestyleTeam[] = teams.map((t) => ({
    ...t,
    score: teamScoreMap.get(t.id) ?? 0,
  }));

  const enrichedBookings: FreestyleBooking[] = await Promise.all(
    bookings
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(async (b) => {
        const [player] = await db
          .select({ nickname: playersTable.nickname, teamId: playersTable.teamId })
          .from(playersTable)
          .where(eq(playersTable.id, b.playerId))
          .limit(1);
        const team = fullTeams.find((t) => t.id === (b.teamId ?? player?.teamId));
        const stateBooking = (state.bookings ?? []).find((sb) => sb.id === b.id);
        return {
          id: b.id,
          playerId: b.playerId,
          nickname: player?.nickname ?? "Unknown",
          teamId: b.teamId ?? player?.teamId ?? "",
          teamName: team?.name ?? "",
          teamColor: team?.color ?? "#f97316",
          status: b.status as FreestyleBooking["status"],
          orderIndex: b.orderIndex,
          wordsRecognized: stateBooking?.wordsRecognized ?? [],
        };
      }),
  );

  return {
    ...state,
    bookings: enrichedBookings,
    teams: fullTeams,
  };
}

/* ── Sets CRUD ───────────────────────────────────────────────────────────── */

router.get("/freestyle/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const user = ar.user!;
  const tenantId = user.role === "super_admin" ? undefined : user.tenantId;
  const rows = await db
    .select()
    .from(freestyleSetsTable)
    .where(
      tenantId
        ? or(eq(freestyleSetsTable.tenantId, tenantId), isNull(freestyleSetsTable.tenantId))
        : undefined,
    )
    .orderBy(asc(freestyleSetsTable.createdAt));
  res.json(rows);
});

router.post("/freestyle/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const { title, description = "", language = "it", beatUrl } = req.body as {
    title: string; description?: string; language?: string; beatUrl?: string;
  };
  if (!title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  const user = ar.user!;
  const tenantId = user.role === "super_admin" ? (req.body.tenantId ?? null) : user.tenantId;
  const [row] = await db
    .insert(freestyleSetsTable)
    .values({ title: title.trim(), description, language, beatUrl: beatUrl || null, tenantId })
    .returning();
  res.status(201).json(row);
});

router.patch("/freestyle/sets/:id", requireAuth, async (req, res) => {
  const { title, description, language, beatUrl, isActive } = req.body as {
    title?: string; description?: string; language?: string; beatUrl?: string; isActive?: boolean;
  };
  const updates: Partial<typeof freestyleSetsTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (language !== undefined) updates.language = language;
  if (beatUrl !== undefined) updates.beatUrl = beatUrl;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db
    .update(freestyleSetsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(freestyleSetsTable.id, req.params.id as string))
    .returning();
  res.json(row);
});

router.delete("/freestyle/sets/:id", requireAuth, async (req, res) => {
  await db.delete(freestyleSetsTable).where(eq(freestyleSetsTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── Words CRUD ──────────────────────────────────────────────────────────── */

router.get("/freestyle/sets/:id/words", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(freestyleWordsTable)
    .where(eq(freestyleWordsTable.setId, req.params.id as string))
    .orderBy(asc(freestyleWordsTable.orderIndex));
  res.json(rows);
});

router.post("/freestyle/sets/:id/words", requireAuth, async (req, res) => {
  const setId = req.params.id as string;
  const { word, orderIndex = 0 } = req.body as { word: string; orderIndex?: number };
  if (!word?.trim()) { res.status(400).json({ error: "word required" }); return; }
  const [row] = await db
    .insert(freestyleWordsTable)
    .values({ setId, word: word.trim(), orderIndex })
    .returning();
  res.status(201).json(row);
});

router.delete("/freestyle/words/:id", requireAuth, async (req, res) => {
  await db.delete(freestyleWordsTable).where(eq(freestyleWordsTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── Session: init ───────────────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/init", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { setId, thinkingSeconds = 20 } = req.body as { setId: string; thinkingSeconds?: number };
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }

  const [fsSet] = await db.select().from(freestyleSetsTable).where(eq(freestyleSetsTable.id, setId)).limit(1);
  if (!fsSet) { res.status(404).json({ error: "Set not found" }); return; }

  const allWords = await db
    .select()
    .from(freestyleWordsTable)
    .where(and(eq(freestyleWordsTable.setId, setId), eq(freestyleWordsTable.isActive, true)))
    .orderBy(asc(freestyleWordsTable.orderIndex));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Session not found" }); return; }

  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color })
    .from(teamsTable)
    .where(eq(teamsTable.eventId, eventId));

  // Pick 15 random words
  const shuffled = [...allWords].sort(() => Math.random() - 0.5).slice(0, 15);
  const words: FreestyleWord[] = shuffled.map((w, i) => ({
    id: w.id,
    word: w.word,
    orderIndex: i,
    recognized: false,
  }));

  const initialState: FreestyleState = {
    setId,
    setName: fsSet.title,
    beatUrl: fsSet.beatUrl,
    words,
    revealedCount: 0,
    revealStartedAt: null,
    thinkingStartedAt: null,
    thinkingSeconds,
    bookings: [],
    teams: teams.map((t) => ({ ...t, score: 0 })),
    phase: "idle",
    roundIndex: 0,
    usedWordSetIds: [],
  };

  const existing = await getFreestyleSession(sessionId);
  let fsRow: typeof freestyleSessionsTable.$inferSelect;
  if (existing) {
    [fsRow] = await db
      .update(freestyleSessionsTable)
      .set({ setId, state: initialState, updatedAt: new Date() })
      .where(eq(freestyleSessionsTable.sessionId, sessionId))
      .returning();
    await db.delete(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, existing.id));
  } else {
    [fsRow] = await db
      .insert(freestyleSessionsTable)
      .values({ sessionId, setId, state: initialState })
      .returning();
  }

  const fullState = await buildState(fsRow, [], eventId);
  emit(eventId, "freestyle:started", { state: fullState });
  res.json(fullState);
});

/* ── Session: get state ──────────────────────────────────────────────────── */

router.get("/freestyle/sessions/:id/state", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }
  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState(fs, bookings, eventId);
  res.json(fullState);
});

/* ── Session: start reveal (words appear one by one) ────────────────────── */

router.post("/freestyle/sessions/:id/start-reveal", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;
  const newState: FreestyleState = {
    ...state,
    phase: "revealing",
    revealStartedAt: new Date().toISOString(),
    revealedCount: 0,
  };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:reveal_started", { state: fullState });
  res.json(fullState);
});

/* ── Session: reveal next word ───────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/reveal-word", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;
  const newCount = Math.min((state.revealedCount ?? 0) + 1, state.words.length);
  const isLast = newCount >= state.words.length;

  const newState: FreestyleState = {
    ...state,
    revealedCount: newCount,
    phase: isLast ? "thinking" : "revealing",
    thinkingStartedAt: isLast ? new Date().toISOString() : state.thinkingStartedAt,
  };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, isLast ? "freestyle:thinking" : "freestyle:word_revealed", { state: fullState });
  res.json(fullState);
});

/* ── Session: open bookings ──────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/open-bookings", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;
  const newState: FreestyleState = { ...state, phase: "booking" };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:bookings_open", { state: fullState });
  res.json(fullState);
});

/* ── Session: book ───────────────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/book", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const { playerId } = req.body as { playerId: string };
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const existing = await db
    .select()
    .from(freestyleBookingsTable)
    .where(
      and(
        eq(freestyleBookingsTable.sessionId, fs.id),
        eq(freestyleBookingsTable.playerId, playerId),
        or(eq(freestyleBookingsTable.status, "waiting"), eq(freestyleBookingsTable.status, "active")),
      ),
    )
    .limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Already booked" }); return; }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);
  const waitingList = await db
    .select()
    .from(freestyleBookingsTable)
    .where(and(eq(freestyleBookingsTable.sessionId, fs.id), eq(freestyleBookingsTable.status, "waiting")));

  const [booking] = await db
    .insert(freestyleBookingsTable)
    .values({ sessionId: fs.id, playerId, teamId: player?.teamId ?? null, status: "waiting", orderIndex: waitingList.length })
    .returning();

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const allBookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState(fs, allBookings, eventId);

  emit(eventId, "freestyle:booking_added", { state: fullState });
  res.status(201).json(booking);
});

/* ── Session: cancel booking ─────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/cancel-booking", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const { bookingId } = req.body as { bookingId: string };
  if (!bookingId) { res.status(400).json({ error: "bookingId required" }); return; }

  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  await db.update(freestyleBookingsTable).set({ status: "skipped" }).where(eq(freestyleBookingsTable.id, bookingId));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState(fs, bookings, eventId);

  emit(eventId, "freestyle:booking_removed", { state: fullState });
  res.json({ ok: true });
});

/* ── Session: set active performer ──────────────────────────────────────── */

router.post("/freestyle/sessions/:id/set-performer", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { bookingId } = req.body as { bookingId: string };
  if (!bookingId) { res.status(400).json({ error: "bookingId required" }); return; }

  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  await db
    .update(freestyleBookingsTable)
    .set({ status: "done" })
    .where(and(eq(freestyleBookingsTable.sessionId, fs.id), eq(freestyleBookingsTable.status, "active")));
  await db.update(freestyleBookingsTable).set({ status: "active" }).where(eq(freestyleBookingsTable.id, bookingId));

  const state = fs.state as FreestyleState;
  const newState: FreestyleState = { ...state, phase: "performing" };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:performer_set", { state: fullState });
  res.json(fullState);
});

/* ── Session: word recognized (from Speech API) ──────────────────────────── */

router.post("/freestyle/sessions/:id/word-recognized", loadUser, async (req, res) => {
  const sessionId = req.params.id as string;
  const { wordId, bookingId } = req.body as { wordId: string; bookingId: string };
  if (!wordId || !bookingId) { res.status(400).json({ error: "wordId and bookingId required" }); return; }

  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;

  // Mark word as recognized
  const newWords = state.words.map((w) =>
    w.id === wordId ? { ...w, recognized: true } : w,
  );

  // Track recognized words per booking
  const newBookings = (state.bookings ?? []).map((b) =>
    b.id === bookingId
      ? { ...b, wordsRecognized: [...new Set([...(b.wordsRecognized ?? []), wordId])] }
      : b,
  );

  const newState: FreestyleState = { ...state, words: newWords, bookings: newBookings };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:word_recognized", { state: fullState, wordId });
  res.json(fullState);
});

/* ── Session: score ──────────────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/score", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { teamId, points } = req.body as { teamId: string; points: number };
  if (!teamId || points === undefined) { res.status(400).json({ error: "teamId and points required" }); return; }

  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;
  const newTeams = (state.teams ?? []).map((t) =>
    t.id === teamId ? { ...t, score: t.score + points } : t,
  );

  // Reset words for next round
  const newWords = state.words.map((w) => ({ ...w, recognized: false }));
  const newState: FreestyleState = {
    ...state,
    teams: newTeams,
    words: newWords,
    phase: "booking",
  };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:score_updated", { state: fullState });
  res.json(fullState);
});

/* ── Session: next round (new 15 words) ─────────────────────────────────── */

router.post("/freestyle/sessions/:id/next-round", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;

  // Get all words for the set and pick 15 new ones (different from current)
  const usedIds = state.words.map((w) => w.id);
  const allWords = await db
    .select()
    .from(freestyleWordsTable)
    .where(and(eq(freestyleWordsTable.setId, state.setId), eq(freestyleWordsTable.isActive, true)));

  const available = allWords.filter((w) => !usedIds.includes(w.id));
  const pool = available.length >= 15 ? available : allWords; // fallback: reuse all if too few
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 15);
  const words: FreestyleWord[] = shuffled.map((w, i) => ({
    id: w.id, word: w.word, orderIndex: i, recognized: false,
  }));

  const newState: FreestyleState = {
    ...state,
    words,
    revealedCount: 0,
    revealStartedAt: null,
    thinkingStartedAt: null,
    phase: "idle",
    roundIndex: (state.roundIndex ?? 0) + 1,
  };
  await saveState(fs.id, newState);

  // Clear bookings for new round
  await db
    .update(freestyleBookingsTable)
    .set({ status: "done" })
    .where(and(eq(freestyleBookingsTable.sessionId, fs.id), or(eq(freestyleBookingsTable.status, "waiting"), eq(freestyleBookingsTable.status, "active"))));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:next_round", { state: fullState });
  res.json(fullState);
});

/* ── Session: end ────────────────────────────────────────────────────────── */

router.post("/freestyle/sessions/:id/end", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const fs = await getFreestyleSession(sessionId);
  if (!fs) { res.status(404).json({ error: "Session not found" }); return; }

  const state = fs.state as FreestyleState;
  const newState: FreestyleState = { ...state, phase: "ended" };
  await saveState(fs.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(freestyleBookingsTable).where(eq(freestyleBookingsTable.sessionId, fs.id)).orderBy(asc(freestyleBookingsTable.orderIndex));
  const fullState = await buildState({ ...fs, state: newState }, bookings, eventId);

  emit(eventId, "freestyle:ended", { state: fullState });
  res.json(fullState);
});

export default router;
