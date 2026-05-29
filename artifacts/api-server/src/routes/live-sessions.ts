/**
 * LIVE MODE — Session management API
 *
 * Authenticated endpoints (require auth):
 *   POST   /live-sessions                     — create session
 *   GET    /live-sessions                     — list sessions (tenant-scoped)
 *   PATCH  /live-sessions/:id                 — update title/status
 *   DELETE /live-sessions/:id                 — delete session
 *
 * Code-gated endpoints (tvCode or presenterCode):
 *   GET    /live-sessions/by-code/:code        — resolve session by any code
 *   GET    /live-sessions/:id/state            — get runtime state
 *   POST   /live-sessions/:id/command          — send show command (broadcasts via socket)
 *   POST   /live-sessions/:id/photos           — add asset (Coppie Live photos)
 *   GET    /live-sessions/:id/photos           — list photo assets for a session
 *   POST   /live-sessions/:id/create-deck      — create Coppie Live deck from photos
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, and, or, desc } from "drizzle-orm";
import {
  db,
  liveSessionsTable,
  liveRuntimeStateTable,
  liveGameAssetsTable,
} from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToRoom } from "../socket";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function makeCode(len = 6) {
  return randomBytes(len).toString("hex").toUpperCase().slice(0, len);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getSessionByCode(code: string | string[]) {
  const upper = (Array.isArray(code) ? code[0]! : code).toUpperCase();
  const rows = await db
    .select()
    .from(liveSessionsTable)
    .where(or(eq(liveSessionsTable.tvCode, upper), eq(liveSessionsTable.presenterCode, upper)))
    .limit(1);
  return rows[0] ?? null;
}

async function getState(liveSessionId: string) {
  const rows = await db
    .select()
    .from(liveRuntimeStateTable)
    .where(eq(liveRuntimeStateTable.liveSessionId, liveSessionId));
  return rows[0] ?? null;
}

async function upsertState(
  liveSessionId: string,
  patch: Partial<Omit<typeof liveRuntimeStateTable.$inferInsert, "liveSessionId">>,
) {
  const existing = await getState(liveSessionId);
  if (existing) {
    const [row] = await db
      .update(liveRuntimeStateTable)
      .set(patch)
      .where(eq(liveRuntimeStateTable.liveSessionId, liveSessionId))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(liveRuntimeStateTable)
    .values({ liveSessionId, ...patch })
    .returning();
  return row!;
}

// Validate request has either auth OR matching session code
async function resolveSession(req: Request): Promise<typeof liveSessionsTable.$inferSelect | null> {
  const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id;
  if (!id) return null;
  const rows = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, id));
  const session = rows[0] ?? null;
  if (!session) return null;

  const authedReq = req as AuthedRequest;
  if (authedReq.user) return session;

  const code = (req.headers["x-live-code"] as string | undefined) ??
    (req.query.s as string | undefined) ??
    (req.body?.code as string | undefined);
  if (!code) return null;
  const upper = code.toUpperCase();
  if (upper === session.tvCode || upper === session.presenterCode) return session;
  return null;
}

// ── POST /live-sessions ──────────────────────────────────────────────────────

router.post("/live-sessions", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const me = req.user!;
  const title = (req.body?.title as string | undefined) ?? "Serata Live";
  let tvCode: string;
  let presenterCode: string;

  // Ensure unique codes
  for (;;) {
    tvCode = makeCode(6);
    const clash = await db
      .select()
      .from(liveSessionsTable)
      .where(eq(liveSessionsTable.tvCode, tvCode))
      .limit(1);
    if (clash.length === 0) break;
  }
  for (;;) {
    presenterCode = makeCode(6);
    const clash = await db
      .select()
      .from(liveSessionsTable)
      .where(eq(liveSessionsTable.presenterCode, presenterCode))
      .limit(1);
    if (clash.length === 0) break;
  }

  const [session] = await db
    .insert(liveSessionsTable)
    .values({
      title,
      tvCode,
      presenterCode: presenterCode!,
      tenantId: me.tenantId ?? undefined,
      createdBy: me.id,
    })
    .returning();

  await upsertState(session!.id, { currentPhase: "standby", payload: {} });

  logger.info({ sessionId: session!.id, tvCode, presenterCode }, "[LiveSession] created");
  res.status(201).json(session);
});

// ── GET /live-sessions ───────────────────────────────────────────────────────

router.get("/live-sessions", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(liveSessionsTable).orderBy(desc(liveSessionsTable.createdAt)).limit(50)
    : await db
        .select()
        .from(liveSessionsTable)
        .where(eq(liveSessionsTable.tenantId, me.tenantId!))
        .orderBy(desc(liveSessionsTable.createdAt))
        .limit(50);
  res.json(rows);
});

// ── GET /live-sessions/by-code/:code ────────────────────────────────────────

router.get("/live-sessions/by-code/:code", async (req: Request, res: Response): Promise<void> => {
  const session = await getSessionByCode(req.params.code);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  // Don't expose presenterCode to TV requests — infer role from code
  const code = (Array.isArray(req.params.code) ? req.params.code[0]! : req.params.code).toUpperCase();
  const role = code === session.tvCode ? "tv" : "presenter";
  res.json({ ...session, role });
});

// ── GET /live-sessions/:id ───────────────────────────────────────────────────

router.get("/live-sessions/:id", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Session not found or access denied" }); return; }
  res.json(session);
});

// ── PATCH /live-sessions/:id ─────────────────────────────────────────────────

router.patch("/live-sessions/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }

  const { title, status, currentGameSlug, currentPhase, metadata } = req.body as Partial<typeof liveSessionsTable.$inferInsert>;
  const [updated] = await db
    .update(liveSessionsTable)
    .set({
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(currentGameSlug !== undefined && { currentGameSlug }),
      ...(currentPhase !== undefined && { currentPhase }),
      ...(metadata !== undefined && { metadata }),
    })
    .where(eq(liveSessionsTable.id, session.id))
    .returning();

  emitToRoom(`live:${session.id}`, "live:session_updated", updated);
  res.json(updated);
});

// ── DELETE /live-sessions/:id ────────────────────────────────────────────────

router.delete("/live-sessions/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(liveSessionsTable).where(eq(liveSessionsTable.id, session.id));
  emitToRoom(`live:${session.id}`, "live:session_ended", { sessionId: session.id });
  res.status(204).end();
});

// ── GET /live-sessions/:id/state ─────────────────────────────────────────────

router.get("/live-sessions/:id/state", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }
  const state = await getState(session.id);
  res.json(state ?? { liveSessionId: session.id, currentPhase: "standby", payload: {} });
});

// ── POST /live-sessions/:id/command ──────────────────────────────────────────

const VALID_COMMANDS = [
  "start_game", "pause", "resume", "next_phase", "force_reveal", "force_ranking",
  "blackout", "standby_logo", "stop_audio", "trigger_media",
  "override_timer", "override_score", "toggle_voting", "toggle_ai", "force_next_round",
] as const;

router.post("/live-sessions/:id/command", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const { command, payload } = req.body as { command: string; payload?: unknown };
  if (!command || !VALID_COMMANDS.includes(command as (typeof VALID_COMMANDS)[number])) {
    res.status(400).json({ error: `Invalid command. Valid: ${VALID_COMMANDS.join(", ")}` });
    return;
  }

  // Apply state transitions for game flow commands
  let stateUpdate: Partial<typeof liveRuntimeStateTable.$inferInsert> = {};

  if (command === "start_game") {
    const { gameSlug } = payload as { gameSlug: string };
    await db
      .update(liveSessionsTable)
      .set({ status: "active", currentGameSlug: gameSlug, currentPhase: "playing" })
      .where(eq(liveSessionsTable.id, session.id));
    stateUpdate = { currentGameSlug: gameSlug, currentPhase: "playing", payload: (payload as Record<string, unknown>) ?? {} };
  } else if (command === "pause") {
    await db.update(liveSessionsTable).set({ status: "paused" }).where(eq(liveSessionsTable.id, session.id));
  } else if (command === "resume") {
    await db.update(liveSessionsTable).set({ status: "active" }).where(eq(liveSessionsTable.id, session.id));
  } else if (command === "standby_logo") {
    await db.update(liveSessionsTable).set({ currentPhase: "standby" }).where(eq(liveSessionsTable.id, session.id));
    stateUpdate = { currentPhase: "standby" };
  } else if (command === "blackout") {
    stateUpdate = { currentPhase: "blackout" };
  }

  if (Object.keys(stateUpdate).length > 0) {
    await upsertState(session.id, stateUpdate);
  }

  const event = { sessionId: session.id, command, payload: payload ?? null, ts: Date.now() };
  emitToRoom(`live:${session.id}`, "live:command", event);

  logger.info({ sessionId: session.id, command }, "[LiveCommand] emitted");
  res.json({ ok: true, ...event });
});

// ── GET /live-sessions/:id/photos ────────────────────────────────────────────

router.get("/live-sessions/:id/photos", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const photos = await db
    .select()
    .from(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.liveSessionId, session.id),
        eq(liveGameAssetsTable.assetType, "photo"),
      ),
    )
    .orderBy(liveGameAssetsTable.createdAt);
  res.json(photos);
});

// ── POST /live-sessions/:id/photos ───────────────────────────────────────────

router.post("/live-sessions/:id/photos", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const { label, imageData, url } = req.body as { label?: string; imageData?: string; url?: string };
  if (!imageData && !url) {
    res.status(400).json({ error: "imageData or url required" });
    return;
  }

  // Check limit: max 20 photos per session
  const existing = await db
    .select()
    .from(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.liveSessionId, session.id),
        eq(liveGameAssetsTable.assetType, "photo"),
      ),
    );
  if (existing.length >= 20) {
    res.status(400).json({ error: "Max 20 photos per session" });
    return;
  }

  const [asset] = await db
    .insert(liveGameAssetsTable)
    .values({
      liveSessionId: session.id,
      gameSlug: "gioco-coppie",
      assetType: "photo",
      label: label ?? null,
      url: url ?? null,
      metadata: imageData ? { imageData } : {},
    })
    .returning();

  // Notify all connected (so presenter can see live count on TV)
  const allPhotos = await db
    .select()
    .from(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.liveSessionId, session.id),
        eq(liveGameAssetsTable.assetType, "photo"),
      ),
    )
    .orderBy(liveGameAssetsTable.createdAt);

  emitToRoom(`live:${session.id}`, "live:photos_updated", { photos: allPhotos, count: allPhotos.length });
  logger.info({ sessionId: session.id, photoId: asset!.id, count: allPhotos.length }, "[LiveCoppie] photo added");
  res.status(201).json({ asset, count: allPhotos.length });
});

// ── DELETE /live-sessions/:id/photos/:photoId ────────────────────────────────

router.delete("/live-sessions/:id/photos/:photoId", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }
  await db
    .delete(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.id, Array.isArray(req.params.photoId) ? req.params.photoId[0]! : req.params.photoId),
        eq(liveGameAssetsTable.liveSessionId, session.id),
      ),
    );
  const remaining = await db
    .select()
    .from(liveGameAssetsTable)
    .where(and(eq(liveGameAssetsTable.liveSessionId, session.id), eq(liveGameAssetsTable.assetType, "photo")))
    .orderBy(liveGameAssetsTable.createdAt);
  emitToRoom(`live:${session.id}`, "live:photos_updated", { photos: remaining, count: remaining.length });
  res.status(204).end();
});

// ── POST /live-sessions/:id/create-deck ──────────────────────────────────────

router.post("/live-sessions/:id/create-deck", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const photos = await db
    .select()
    .from(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.liveSessionId, session.id),
        eq(liveGameAssetsTable.assetType, "photo"),
      ),
    )
    .orderBy(liveGameAssetsTable.createdAt)
    .limit(20);

  if (photos.length < 2) {
    res.status(400).json({ error: `Servono almeno 2 foto ospiti (hai ${photos.length})` });
    return;
  }

  // Build pairs: duplicate each photo, assign pairId
  interface DeckCard {
    id: string;
    pairId: string;
    label: string | null;
    imageData: string | undefined;
    url: string | null;
    flipped: boolean;
    matched: boolean;
  }

  const cards: DeckCard[] = [];
  photos.forEach((p, i) => {
    const pairId = `pair-${i}`;
    const card = {
      pairId,
      label: p.label,
      imageData: (p.metadata as Record<string, unknown>).imageData as string | undefined,
      url: p.url,
      flipped: false,
      matched: false,
    };
    cards.push({ id: `${pairId}-a`, ...card });
    cards.push({ id: `${pairId}-b`, ...card });
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }

  const deckPayload = {
    cards,
    totalPairs: photos.length,
    matchedPairs: 0,
    currentTeamTurn: null as string | null,
    flippedCards: [] as string[],
    scores: {} as Record<string, number>,
    gameOver: false,
    createdAt: Date.now(),
  };

  await upsertState(session.id, {
    currentGameSlug: "gioco-coppie",
    currentPhase: "playing",
    payload: { coppie: deckPayload },
  });

  await db
    .update(liveSessionsTable)
    .set({ status: "active", currentGameSlug: "gioco-coppie", currentPhase: "playing" })
    .where(eq(liveSessionsTable.id, session.id));

  emitToRoom(`live:${session.id}`, "live:command", {
    sessionId: session.id,
    command: "coppie_deck_ready",
    payload: deckPayload,
    ts: Date.now(),
  });

  logger.info({ sessionId: session.id, pairs: photos.length, cards: cards.length }, "[LiveCoppie] deck created");
  res.json({ ok: true, pairs: photos.length, cards: cards.length, deck: deckPayload });
});

// ── POST /live-sessions/:id/coppie-flip ──────────────────────────────────────

router.post("/live-sessions/:id/coppie-flip", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const state = await getState(session.id);
  if (!state || !state.payload) { res.status(400).json({ error: "No active deck" }); return; }

  const payload = state.payload as Record<string, unknown>;
  const coppie = payload.coppie as Record<string, unknown> | undefined;
  if (!coppie) { res.status(400).json({ error: "No Coppie deck in state" }); return; }

  const { cardId, teamId } = req.body as { cardId: string; teamId?: string };

  interface Card { id: string; pairId: string; flipped: boolean; matched: boolean }
  const cards = (coppie.cards as Card[]).map(c => ({ ...c }));
  const flippedCards = [...(coppie.flippedCards as string[])];

  const card = cards.find(c => c.id === cardId);
  if (!card || card.flipped || card.matched) {
    res.status(400).json({ error: "Invalid card" }); return;
  }

  card.flipped = true;
  flippedCards.push(cardId);

  let matched = false;
  let gameOver = false;

  if (flippedCards.length === 2) {
    const [aId, bId] = flippedCards;
    const a = cards.find(c => c.id === aId);
    const b = cards.find(c => c.id === bId);
    if (a && b && a.pairId === b.pairId) {
      a.matched = true;
      b.matched = true;
      matched = true;
      const scores = { ...(coppie.scores as Record<string, number>) };
      if (teamId) scores[teamId] = (scores[teamId] ?? 0) + 1;
      const matchedPairs = (coppie.matchedPairs as number) + 1;
      gameOver = matchedPairs >= (coppie.totalPairs as number);
      const newState = { ...coppie, cards, flippedCards: [], matchedPairs, scores, gameOver };
      await upsertState(session.id, { payload: { coppie: newState } });
      emitToRoom(`live:${session.id}`, "live:command", {
        sessionId: session.id, command: "coppie_match", payload: { cardId, pairId: a.pairId, teamId, scores, matchedPairs, gameOver }, ts: Date.now(),
      });
    } else {
      const newState = { ...coppie, cards, flippedCards: [] };
      await upsertState(session.id, { payload: { coppie: newState } });
      emitToRoom(`live:${session.id}`, "live:command", {
        sessionId: session.id, command: "coppie_mismatch", payload: { cardIds: [aId, bId] }, ts: Date.now(),
      });
    }
  } else {
    const newState = { ...coppie, cards, flippedCards };
    await upsertState(session.id, { payload: { coppie: newState } });
    emitToRoom(`live:${session.id}`, "live:command", {
      sessionId: session.id, command: "coppie_flip", payload: { cardId }, ts: Date.now(),
    });
  }

  const freshState = await getState(session.id);
  res.json({ ok: true, matched, gameOver, state: freshState });
});

export default router;
