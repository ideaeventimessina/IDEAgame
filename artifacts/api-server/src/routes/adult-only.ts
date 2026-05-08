import { Router, type IRouter, type Response, type Request } from "express";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import {
  db,
  adultOnlyDecksTable,
  adultOnlyCardsTable,
  adultOnlySessionsTable,
  gameSessionsTable,
  eventsTable,
  teamsTable,
  scoresTable,
} from "@workspace/db";
import type {
  AdultOnlyState,
  AdultOnlyCardInState,
  AdultOnlyTeam,
} from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string): boolean {
  return UUID_RE.test(s);
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

async function getSessionEventId(sessionId: string): Promise<string | null> {
  if (!isUUID(sessionId)) return null;
  const [s] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));
  return s?.eventId ?? null;
}

async function guardSessionAuth(
  req: AuthedRequest,
  sessionId: string,
): Promise<string | null> {
  const eventId = await getSessionEventId(sessionId);
  if (!eventId) return null;
  const [e] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId)
    return null;
  return eventId;
}

async function getAdultState(sessionId: string): Promise<AdultOnlyState | null> {
  const [row] = await db
    .select()
    .from(adultOnlySessionsTable)
    .where(eq(adultOnlySessionsTable.sessionId, sessionId));
  return row?.state ?? null;
}

async function saveAdultState(
  sessionId: string,
  state: AdultOnlyState,
): Promise<void> {
  await db
    .update(adultOnlySessionsTable)
    .set({ state })
    .where(eq(adultOnlySessionsTable.sessionId, sessionId));
}

/* ══════════════════════════════════════════════════════════════════════════
   DECKS CRUD
══════════════════════════════════════════════════════════════════════════ */

/* GET /adult-only/decks */
router.get(
  "/adult-only/decks",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const where =
      req.user!.role === "super_admin"
        ? undefined
        : or(
            eq(adultOnlyDecksTable.tenantId, req.user!.tenantId!),
            isNull(adultOnlyDecksTable.tenantId),
          );
    const rows = await db
      .select()
      .from(adultOnlyDecksTable)
      .where(where)
      .orderBy(asc(adultOnlyDecksTable.createdAt));
    res.json(rows);
  },
);

/* POST /adult-only/decks */
router.post(
  "/adult-only/decks",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: "name obbligatorio" });
      return;
    }
    const [row] = await db
      .insert(adultOnlyDecksTable)
      .values({
        name: name.trim(),
        description: description?.trim() ?? "",
        tenantId:
          req.user!.role === "super_admin" ? null : req.user!.tenantId,
      })
      .returning();
    res.status(201).json(row);
  },
);

/* DELETE /adult-only/decks/:id */
router.delete(
  "/adult-only/decks/:id",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const [deck] = await db
      .select()
      .from(adultOnlyDecksTable)
      .where(eq(adultOnlyDecksTable.id, id));
    if (!deck) {
      res.status(404).json({ error: "deck non trovato" });
      return;
    }
    if (
      req.user!.role !== "super_admin" &&
      deck.tenantId !== req.user!.tenantId
    ) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }
    await db
      .delete(adultOnlyDecksTable)
      .where(eq(adultOnlyDecksTable.id, id));
    res.json({ ok: true });
  },
);

/* ══════════════════════════════════════════════════════════════════════════
   CARDS CRUD
══════════════════════════════════════════════════════════════════════════ */

/* GET /adult-only/decks/:id/cards */
router.get(
  "/adult-only/decks/:id/cards",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const cards = await db
      .select()
      .from(adultOnlyCardsTable)
      .where(eq(adultOnlyCardsTable.deckId, id))
      .orderBy(asc(adultOnlyCardsTable.orderIndex), asc(adultOnlyCardsTable.createdAt));
    res.json(cards);
  },
);

/* POST /adult-only/decks/:id/cards */
router.post(
  "/adult-only/decks/:id/cards",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const {
      title,
      body,
      category = "domande-piccanti-leggere",
      points = 100,
      timeLimit = 30,
      level = "soft",
      orderIndex = 0,
    } = req.body as {
      title?: string;
      body?: string;
      category?: string;
      points?: number;
      timeLimit?: number;
      level?: string;
      orderIndex?: number;
    };
    if (!title?.trim() || !body?.trim()) {
      res.status(400).json({ error: "title e body obbligatori" });
      return;
    }
    const [row] = await db
      .insert(adultOnlyCardsTable)
      .values({
        deckId: id,
        title: title.trim(),
        body: body.trim(),
        category,
        points: Number(points),
        timeLimit: Number(timeLimit),
        level,
        isActive: true,
        orderIndex: Number(orderIndex),
      })
      .returning();
    res.status(201).json(row);
  },
);

/* PATCH /adult-only/cards/:id */
router.patch(
  "/adult-only/cards/:id",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const allowed = [
      "title",
      "body",
      "category",
      "points",
      "timeLimit",
      "level",
      "isActive",
      "orderIndex",
    ] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "nessun campo da aggiornare" });
      return;
    }
    const [row] = await db
      .update(adultOnlyCardsTable)
      .set(update)
      .where(eq(adultOnlyCardsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "carta non trovata" });
      return;
    }
    res.json(row);
  },
);

/* DELETE /adult-only/cards/:id */
router.delete(
  "/adult-only/cards/:id",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    await db
      .delete(adultOnlyCardsTable)
      .where(eq(adultOnlyCardsTable.id, id));
    res.json({ ok: true });
  },
);

/* ══════════════════════════════════════════════════════════════════════════
   SESSION MANAGEMENT
══════════════════════════════════════════════════════════════════════════ */

/* GET /adult-only/sessions/:id/state  (public: projector + phone) */
router.get(
  "/adult-only/sessions/:id/state",
  async (req: Request, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    if (!isUUID(sessionId)) {
      res.status(400).json({ error: "sessionId non valido" });
      return;
    }
    const state = await getAdultState(sessionId);
    if (!state) {
      res.status(404).json({ error: "sessione non inizializzata" });
      return;
    }
    res.json(state);
  },
);

/* POST /adult-only/sessions/:id/init */
router.post(
  "/adult-only/sessions/:id/init",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    const eventId = await guardSessionAuth(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato o sessione non trovata" });
      return;
    }

    const { deckId } = req.body as { deckId?: string };
    if (!deckId || !isUUID(deckId)) {
      res.status(400).json({ error: "deckId obbligatorio" });
      return;
    }

    const [deck] = await db
      .select()
      .from(adultOnlyDecksTable)
      .where(eq(adultOnlyDecksTable.id, deckId));
    if (!deck) {
      res.status(404).json({ error: "deck non trovato" });
      return;
    }

    const cards = await db
      .select()
      .from(adultOnlyCardsTable)
      .where(
        and(
          eq(adultOnlyCardsTable.deckId, deckId),
          eq(adultOnlyCardsTable.isActive, true),
        ),
      )
      .orderBy(asc(adultOnlyCardsTable.orderIndex), asc(adultOnlyCardsTable.createdAt));

    if (cards.length === 0) {
      res.status(400).json({ error: "il deck non ha carte attive" });
      return;
    }

    const dbTeams = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.eventId, eventId));

    const teams: AdultOnlyTeam[] = dbTeams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? "#8B5CF6",
      score: 0,
    }));

    const stateCards: AdultOnlyCardInState[] = cards.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      category: c.category,
      points: c.points,
      timeLimit: c.timeLimit,
      level: c.level,
      orderIndex: c.orderIndex,
    }));

    const state: AdultOnlyState = {
      deckId,
      deckName: deck.name,
      cards: stateCards,
      currentCardIdx: -1,
      teams,
      status: "idle",
      timerStartedAt: null,
      skipped: [],
    };

    // Upsert session state
    const existing = await getAdultState(sessionId);
    if (existing) {
      await saveAdultState(sessionId, state);
    } else {
      await db.insert(adultOnlySessionsTable).values({
        sessionId,
        deckId,
        state,
      });
    }

    emitToEvent(eventId, "adult:started", { sessionId, eventId, state });
    res.json(state);
  },
);

/* POST /adult-only/sessions/:id/next */
router.post(
  "/adult-only/sessions/:id/next",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    const eventId = await guardSessionAuth(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }

    const state = await getAdultState(sessionId);
    if (!state) {
      res.status(404).json({ error: "sessione non inizializzata" });
      return;
    }
    if (state.status === "ended") {
      res.status(400).json({ error: "sessione già terminata" });
      return;
    }

    const nextIdx = state.currentCardIdx + 1;
    if (nextIdx >= state.cards.length) {
      // Auto-end when all cards are done
      state.status = "ended";
      state.timerStartedAt = null;
      await saveAdultState(sessionId, state);
      emitToEvent(eventId, "adult:ended", { sessionId, eventId, state });
      res.json(state);
      return;
    }

    state.currentCardIdx = nextIdx;
    state.status = "running";
    state.timerStartedAt = new Date().toISOString();

    await saveAdultState(sessionId, state);
    emitToEvent(eventId, "adult:card_changed", { sessionId, eventId, state });
    res.json(state);
  },
);

/* POST /adult-only/sessions/:id/skip */
router.post(
  "/adult-only/sessions/:id/skip",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    const eventId = await guardSessionAuth(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }

    const state = await getAdultState(sessionId);
    if (!state || state.status !== "running" || state.currentCardIdx < 0) {
      res.status(400).json({ error: "nessuna carta attiva da saltare" });
      return;
    }

    state.skipped.push(state.currentCardIdx);

    const nextIdx = state.currentCardIdx + 1;
    if (nextIdx >= state.cards.length) {
      state.status = "ended";
      state.timerStartedAt = null;
      await saveAdultState(sessionId, state);
      emitToEvent(eventId, "adult:ended", { sessionId, eventId, state });
      res.json(state);
      return;
    }

    state.currentCardIdx = nextIdx;
    state.timerStartedAt = new Date().toISOString();
    await saveAdultState(sessionId, state);
    emitToEvent(eventId, "adult:card_changed", { sessionId, eventId, state });
    res.json(state);
  },
);

/* POST /adult-only/sessions/:id/score */
router.post(
  "/adult-only/sessions/:id/score",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    const eventId = await guardSessionAuth(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }

    const state = await getAdultState(sessionId);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }

    const { teamId, delta } = req.body as {
      teamId?: string;
      delta?: number;
    };
    if (!teamId || delta === undefined) {
      res.status(400).json({ error: "teamId e delta obbligatori" });
      return;
    }

    const team = state.teams.find((t) => t.id === teamId);
    if (!team) {
      res.status(404).json({ error: "squadra non trovata" });
      return;
    }

    team.score = Math.max(0, team.score + Number(delta));

    // Persist score to scores table
    if (delta > 0) {
      await db.insert(scoresTable).values({
        eventId,
        teamId,
        gameSlug: "adult-only",
        round: Math.max(1, state.currentCardIdx + 1),
        points: Number(delta),
      });
    }

    await saveAdultState(sessionId, state);
    emitToEvent(eventId, "adult:score_updated", {
      sessionId,
      eventId,
      state,
    });
    res.json(state);
  },
);

/* POST /adult-only/sessions/:id/end */
router.post(
  "/adult-only/sessions/:id/end",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    const eventId = await guardSessionAuth(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }

    const state = await getAdultState(sessionId);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }

    state.status = "ended";
    state.timerStartedAt = null;
    await saveAdultState(sessionId, state);
    emitToEvent(eventId, "adult:ended", { sessionId, eventId, state });
    res.json(state);
  },
);

export default router;
