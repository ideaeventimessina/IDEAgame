import { Router, type IRouter } from "express";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import {
  db,
  wordBackSetsTable,
  wordBackCardsTable,
  wordBackSessionsTable,
  wordBackBookingsTable,
  gameSessionsTable,
  eventsTable,
  teamsTable,
  playersTable,
  scoresTable,
} from "@workspace/db";
import type { WordBackState, WordBackTeam, WordBackBooking, WordBackCard } from "@workspace/db";
import { type AuthedRequest, requireAuth, loadUser } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string) {
  return UUID_RE.test(s);
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function getEventIdForSession(sessionId: string): Promise<string | null> {
  if (!isUUID(sessionId)) return null;
  const [s] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));
  return s?.eventId ?? null;
}

async function getWbState(gameSessionId: string): Promise<WordBackState | null> {
  const [row] = await db
    .select()
    .from(wordBackSessionsTable)
    .where(eq(wordBackSessionsTable.sessionId, gameSessionId));
  return row?.state ?? null;
}

async function saveWbState(
  gameSessionId: string,
  state: WordBackState,
): Promise<void> {
  await db
    .update(wordBackSessionsTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(wordBackSessionsTable.sessionId, gameSessionId));
}

async function emitWb(
  eventName: string,
  gameSessionId: string,
  state: WordBackState,
) {
  const eventId = await getEventIdForSession(gameSessionId);
  if (eventId) emitToEvent(eventId, eventName, { state });
}

/* ── Sets CRUD ───────────────────────────────────────────────────────────── */

router.get("/word-back/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const user = ar.user!;
  const tenantId = user.role === "super_admin" ? undefined : user.tenantId;
  const rows = await db
    .select()
    .from(wordBackSetsTable)
    .where(
      tenantId
        ? or(eq(wordBackSetsTable.tenantId, tenantId), isNull(wordBackSetsTable.tenantId))
        : undefined,
    )
    .orderBy(asc(wordBackSetsTable.createdAt));
  res.json(rows);
});

router.post("/word-back/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const { title, description = "", language = "it" } = req.body as {
    title: string; description?: string; language?: string;
  };
  if (!title?.trim()) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const user2 = ar.user!;
  const tenantId = user2.role === "super_admin" ? (req.body.tenantId ?? null) : user2.tenantId;
  const [row] = await db
    .insert(wordBackSetsTable)
    .values({ title: title.trim(), description, language, tenantId })
    .returning();
  res.status(201).json(row);
});

router.patch("/word-back/sets/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  const { title, description, isActive } = req.body as {
    title?: string; description?: string; isActive?: boolean;
  };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db
    .update(wordBackSetsTable)
    .set(updates)
    .where(eq(wordBackSetsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/word-back/sets/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(wordBackSetsTable).where(eq(wordBackSetsTable.id, id));
  res.json({ ok: true });
});

/* ── Cards CRUD ──────────────────────────────────────────────────────────── */

router.get("/word-back/sets/:id/cards", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  const rows = await db
    .select()
    .from(wordBackCardsTable)
    .where(eq(wordBackCardsTable.setId, id))
    .orderBy(asc(wordBackCardsTable.orderIndex), asc(wordBackCardsTable.word));
  res.json(rows);
});

router.post("/word-back/sets/:id/cards", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  const { word, hint, category = "oggetti", difficulty = "medium", points = 150, timeLimit = 45, orderIndex = 0 } = req.body as {
    word: string; hint?: string; category?: string; difficulty?: string;
    points?: number; timeLimit?: number; orderIndex?: number;
  };
  if (!word?.trim()) { res.status(400).json({ error: "word required" }); return; }
  const [row] = await db
    .insert(wordBackCardsTable)
    .values({ setId: id, word: word.trim(), hint: hint?.trim() ?? null, category, difficulty, points, timeLimit, orderIndex })
    .returning();
  res.status(201).json(row);
});

router.patch("/word-back/cards/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  const { word, hint, category, difficulty, points, timeLimit, isActive } = req.body as {
    word?: string; hint?: string | null; category?: string; difficulty?: string;
    points?: number; timeLimit?: number; isActive?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (word !== undefined) updates.word = word.trim();
  if (hint !== undefined) updates.hint = hint?.trim() || null;
  if (category !== undefined) updates.category = category;
  if (difficulty !== undefined) updates.difficulty = difficulty;
  if (points !== undefined) updates.points = points;
  if (timeLimit !== undefined) updates.timeLimit = timeLimit;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db
    .update(wordBackCardsTable)
    .set(updates)
    .where(eq(wordBackCardsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/word-back/cards/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  if (!isUUID(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(wordBackCardsTable).where(eq(wordBackCardsTable.id, id));
  res.json({ ok: true });
});

/* ── Session endpoints ───────────────────────────────────────────────────── */

// POST /word-back/sessions/:gameSessionId/init
router.post("/word-back/sessions/:gameSessionId/init", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  if (!isUUID(gameSessionId)) { res.status(400).json({ error: "bad id" }); return; }

  const { setId } = req.body as { setId: string };
  if (!isUUID(setId)) { res.status(400).json({ error: "setId required" }); return; }

  // Validate game session
  const [gs] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, gameSessionId));
  if (!gs) { res.status(404).json({ error: "session not found" }); return; }

  // Validate set + load first card
  const [set] = await db.select().from(wordBackSetsTable).where(eq(wordBackSetsTable.id, setId));
  if (!set) { res.status(404).json({ error: "set not found" }); return; }

  const allCards = await db
    .select()
    .from(wordBackCardsTable)
    .where(and(eq(wordBackCardsTable.setId, setId), eq(wordBackCardsTable.isActive, true)))
    .orderBy(asc(wordBackCardsTable.orderIndex), asc(wordBackCardsTable.word));

  if (allCards.length === 0) { res.status(400).json({ error: "no active cards in set" }); return; }

  // Load teams for this event
  const eventTeams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.eventId, gs.eventId))
    .orderBy(asc(teamsTable.name));

  const firstCard = allCards[0]!;
  const teams: WordBackTeam[] = eventTeams.map(t => ({
    id: t.id, name: t.name, color: t.color ?? '#8B5CF6', score: 0,
  }));

  const currentCard: WordBackCard = {
    id: firstCard.id, word: firstCard.word, hint: firstCard.hint,
    category: firstCard.category, difficulty: firstCard.difficulty,
    points: firstCard.points, timeLimit: firstCard.timeLimit,
  };

  const state: WordBackState = {
    setId, setName: set.title,
    currentCard,
    bookings: [],
    teams,
    status: 'running',
    timerStartedAt: null,
    usedCardIds: [firstCard.id],
  };

  // Upsert word_back_sessions
  const [existing] = await db.select().from(wordBackSessionsTable).where(eq(wordBackSessionsTable.sessionId, gameSessionId));
  let wbSession;
  if (existing) {
    [wbSession] = await db.update(wordBackSessionsTable)
      .set({ setId, state, updatedAt: new Date() })
      .where(eq(wordBackSessionsTable.sessionId, gameSessionId))
      .returning();
  } else {
    [wbSession] = await db.insert(wordBackSessionsTable)
      .values({ sessionId: gameSessionId, setId, state })
      .returning();
  }

  await emitWb('wordback:started', gameSessionId, state);
  res.json(state);
});

// GET /word-back/sessions/:gameSessionId/state (public — projector)
router.get("/word-back/sessions/:gameSessionId/state", loadUser, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  if (!isUUID(gameSessionId)) { res.status(400).json({ error: "bad id" }); return; }
  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/book (public — player phone)
router.post("/word-back/sessions/:gameSessionId/book", loadUser, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  if (!isUUID(gameSessionId)) { res.status(400).json({ error: "bad id" }); return; }

  const { playerId } = req.body as { playerId: string };
  if (!isUUID(playerId)) { res.status(400).json({ error: "playerId required" }); return; }

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "session not initialized" }); return; }
  if (state.status === 'ended') { res.status(400).json({ error: "game ended" }); return; }

  // Check if already booked
  if (state.bookings.some(b => b.playerId === playerId && b.status === 'waiting')) {
    res.status(409).json({ error: "already booked" });
    return;
  }

  // Look up player + team
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "player not found" }); return; }

  let teamName = 'Nessuna squadra';
  let teamColor = '#8B5CF6';
  let teamId = player.teamId ?? '';

  if (player.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, player.teamId));
    if (team) { teamName = team.name; teamColor = team.color ?? '#8B5CF6'; }
  }

  // Insert into word_back_bookings table too
  const [wbSession] = await db.select().from(wordBackSessionsTable).where(eq(wordBackSessionsTable.sessionId, gameSessionId));
  if (wbSession) {
    await db.insert(wordBackBookingsTable).values({
      sessionId: wbSession.id, playerId, teamId: player.teamId ?? undefined,
      status: 'waiting', orderIndex: state.bookings.length,
    }).onConflictDoNothing();
  }

  const booking: WordBackBooking = {
    id: crypto.randomUUID(),
    playerId, nickname: player.nickname,
    teamId, teamName, teamColor,
    status: 'waiting',
    orderIndex: state.bookings.filter(b => b.status === 'waiting').length,
  };

  state.bookings.push(booking);
  await saveWbState(gameSessionId, state);
  await emitWb('wordback:booking_added', gameSessionId, state);
  res.json({ ok: true, booking });
});

// POST /word-back/sessions/:gameSessionId/cancel-booking (public — player or admin)
router.post("/word-back/sessions/:gameSessionId/cancel-booking", loadUser, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  const { playerId, bookingId } = req.body as { playerId?: string; bookingId?: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  if (bookingId) {
    state.bookings = state.bookings.filter(b => b.id !== bookingId);
  } else if (playerId) {
    state.bookings = state.bookings.filter(b => !(b.playerId === playerId && b.status === 'waiting'));
  } else {
    res.status(400).json({ error: "bookingId or playerId required" });
    return;
  }

  await saveWbState(gameSessionId, state);
  await emitWb('wordback:booking_removed', gameSessionId, state);
  res.json({ ok: true, state });
});

// POST /word-back/sessions/:gameSessionId/set-active-player
router.post("/word-back/sessions/:gameSessionId/set-active-player", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  const { bookingId } = req.body as { bookingId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  // Mark any current active booking as completed
  state.bookings = state.bookings.map(b =>
    b.status === 'active' ? { ...b, status: 'completed' as const } : b,
  );

  // Set new active player
  const booking = state.bookings.find(b => b.id === bookingId);
  if (!booking) { res.status(404).json({ error: "booking not found" }); return; }
  booking.status = 'active';

  await saveWbState(gameSessionId, state);
  await emitWb('wordback:active_player_changed', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/next-card
router.post("/word-back/sessions/:gameSessionId/next-card", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  // Mark active booking as completed, clear active player
  state.bookings = state.bookings.map(b =>
    b.status === 'active' ? { ...b, status: 'completed' as const } : b,
  );

  // Get next unused card
  const allCards = await db
    .select()
    .from(wordBackCardsTable)
    .where(and(eq(wordBackCardsTable.setId, state.setId), eq(wordBackCardsTable.isActive, true)))
    .orderBy(asc(wordBackCardsTable.orderIndex), asc(wordBackCardsTable.word));

  const unused = allCards.filter(c => !state.usedCardIds.includes(c.id));
  const next = unused[0] ?? allCards[0]; // wrap around if all used

  if (!next) { res.status(400).json({ error: "no cards available" }); return; }

  state.currentCard = {
    id: next.id, word: next.word, hint: next.hint,
    category: next.category, difficulty: next.difficulty,
    points: next.points, timeLimit: next.timeLimit,
  };
  state.usedCardIds = unused.length > 0
    ? [...state.usedCardIds, next.id]
    : [next.id]; // reset if wrapped around
  state.status = 'running';
  state.timerStartedAt = null;

  await saveWbState(gameSessionId, state);
  await emitWb('wordback:card_changed', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/reveal
router.post("/word-back/sessions/:gameSessionId/reveal", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  state.status = 'revealed';
  await saveWbState(gameSessionId, state);

  const eventId = await getEventIdForSession(gameSessionId);
  if (eventId) emitToEvent(eventId, 'wordback:card_changed', { state });
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/timer-start
router.post("/word-back/sessions/:gameSessionId/timer-start", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  state.timerStartedAt = new Date().toISOString();
  await saveWbState(gameSessionId, state);
  await emitWb('wordback:timer_started', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/timer-stop
router.post("/word-back/sessions/:gameSessionId/timer-stop", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  state.timerStartedAt = null;
  await saveWbState(gameSessionId, state);
  await emitWb('wordback:timer_stopped', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/score
router.post("/word-back/sessions/:gameSessionId/score", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };
  const { teamId, points } = req.body as { teamId: string; points: number };

  if (!isUUID(teamId) || typeof points !== 'number') {
    res.status(400).json({ error: "teamId and points required" });
    return;
  }

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  // Update team score in state
  const team = state.teams.find(t => t.id === teamId);
  if (!team) { res.status(404).json({ error: "team not found" }); return; }
  team.score += points;

  // Mark active booking as completed
  state.bookings = state.bookings.map(b =>
    b.status === 'active' ? { ...b, status: 'completed' as const } : b,
  );
  state.status = 'running';

  await saveWbState(gameSessionId, state);

  // Persist to scores table
  const [gs] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, gameSessionId));
  if (gs) {
    await db.insert(scoresTable).values({
      eventId: gs.eventId, teamId, gameSlug: 'parola-alle-spalle',
      round: gs.currentRound, points,
    });
  }

  await emitWb('wordback:score_updated', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/skip
router.post("/word-back/sessions/:gameSessionId/skip", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  // Mark active as skipped
  state.bookings = state.bookings.map(b =>
    b.status === 'active' ? { ...b, status: 'skipped' as const } : b,
  );

  // Move to next card
  const allCards = await db
    .select()
    .from(wordBackCardsTable)
    .where(and(eq(wordBackCardsTable.setId, state.setId), eq(wordBackCardsTable.isActive, true)))
    .orderBy(asc(wordBackCardsTable.orderIndex));

  const unused = allCards.filter(c => !state.usedCardIds.includes(c.id));
  const next = unused[0] ?? allCards[0];

  if (next) {
    state.currentCard = {
      id: next.id, word: next.word, hint: next.hint,
      category: next.category, difficulty: next.difficulty,
      points: next.points, timeLimit: next.timeLimit,
    };
    state.usedCardIds = unused.length > 0 ? [...state.usedCardIds, next.id] : [next.id];
  }

  state.status = 'running';
  state.timerStartedAt = null;

  await saveWbState(gameSessionId, state);
  await emitWb('wordback:card_changed', gameSessionId, state);
  res.json(state);
});

// POST /word-back/sessions/:gameSessionId/end
router.post("/word-back/sessions/:gameSessionId/end", requireAuth, async (req, res) => {
  const { gameSessionId } = req.params as { gameSessionId: string };

  const state = await getWbState(gameSessionId);
  if (!state) { res.status(404).json({ error: "not initialized" }); return; }

  state.status = 'ended';
  state.timerStartedAt = null;

  await saveWbState(gameSessionId, state);
  await emitWb('wordback:ended', gameSessionId, state);
  res.json(state);
});

export default router;
