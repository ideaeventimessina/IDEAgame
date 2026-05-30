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
 *   GET    /live-sessions/:id/couples          — list 10 couple slots with A/B photos
 *   POST   /live-sessions/:id/photos           — add/replace couple photo (coupleIndex+partner) or legacy single photo
 *   GET    /live-sessions/:id/photos           — list photo assets for a session (legacy)
 *   DELETE /live-sessions/:id/photos/:photoId  — delete a photo asset
 *   POST   /live-sessions/:id/create-deck      — create Coppie Live deck from 10 real couples
 *   POST   /live-sessions/:id/coppie-flip      — flip a card (TV-driven)
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, and, or, desc } from "drizzle-orm";
import {
  db,
  liveSessionsTable,
  liveRuntimeStateTable,
  liveGameAssetsTable,
  homeSessionsTable,
} from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToRoom } from "../socket";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function makeCode(len = 6) {
  return randomBytes(len).toString("hex").toUpperCase().slice(0, len);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CoupleMeta {
  coupleIndex: number;
  partner: "A" | "B";
  coupleName?: string;
  partnerName?: string;
  imageData?: string;
}

interface DeckCard {
  id: string;
  pairId: string;        // = coupleId — same for A and B of the same couple
  partner: "A" | "B";
  coupleName?: string;
  partnerName?: string;
  label: string | null;
  imageData: string | undefined;
  url: string | null;
  flipped: boolean;
  matched: boolean;
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

// Build 10-slot couple list from couple_photo assets
async function buildCouplesList(liveSessionId: string) {
  const assets = await db
    .select()
    .from(liveGameAssetsTable)
    .where(
      and(
        eq(liveGameAssetsTable.liveSessionId, liveSessionId),
        eq(liveGameAssetsTable.assetType, "couple_photo"),
      ),
    )
    .orderBy(liveGameAssetsTable.createdAt);

  type Slot = { photoA: (typeof assets)[0] | null; photoB: (typeof assets)[0] | null; coupleName?: string };
  const map = new Map<number, Slot>();
  for (let i = 0; i < 10; i++) map.set(i, { photoA: null, photoB: null });

  for (const asset of assets) {
    const meta = asset.metadata as unknown as CoupleMeta;
    const idx = meta.coupleIndex ?? 0;
    const slot = map.get(idx) ?? { photoA: null, photoB: null };
    if (meta.partner === "A") slot.photoA = asset;
    else slot.photoB = asset;
    if (meta.coupleName) slot.coupleName = meta.coupleName;
    map.set(idx, slot);
  }

  return Array.from(map.entries()).map(([idx, slot]) => ({
    coupleIndex: idx,
    coupleId: `couple-${idx}`,
    coupleName: slot.coupleName,
    photoA: slot.photoA,
    photoB: slot.photoB,
    complete: !!(slot.photoA && slot.photoB),
  }));
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
  "set_home_session",
] as const;

router.post("/live-sessions/:id/command", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const { command, payload } = req.body as { command: string; payload?: unknown };
  if (!command || !VALID_COMMANDS.includes(command as (typeof VALID_COMMANDS)[number])) {
    res.status(400).json({ error: `Invalid command. Valid: ${VALID_COMMANDS.join(", ")}` });
    return;
  }

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
  } else if (command === "set_home_session") {
    const { homeSessionId } = (payload ?? {}) as { homeSessionId?: string };
    const current = await getState(session.id);
    const existing = (current?.payload as Record<string, unknown>) ?? {};
    stateUpdate = { payload: { ...existing, homeSessionId: homeSessionId ?? null } };
    logger.info({ sessionId: session.id, homeSessionId }, "[LiveCommand] set_home_session");
  }

  if (Object.keys(stateUpdate).length > 0) {
    await upsertState(session.id, stateUpdate);
  }

  const event = { sessionId: session.id, command, payload: payload ?? null, ts: Date.now() };
  emitToRoom(`live:${session.id}`, "live:command", event);

  logger.info({ sessionId: session.id, command }, "[LiveCommand] emitted");
  res.json({ ok: true, ...event });
});

// ── GET /live-sessions/:id/couples ───────────────────────────────────────────

router.get("/live-sessions/:id/couples", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }
  const couples = await buildCouplesList(session.id);
  res.json(couples);
});

// ── GET /live-sessions/:id/photos (legacy) ────────────────────────────────────

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
// Couple photo: body includes coupleIndex (0-9) + partner ("A"|"B")
// Legacy single photo: body includes just label + imageData/url

router.post("/live-sessions/:id/photos", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const { label, imageData, url, coupleIndex, partner, coupleName, partnerName } =
    req.body as {
      label?: string; imageData?: string; url?: string;
      coupleIndex?: number; partner?: "A" | "B";
      coupleName?: string; partnerName?: string;
    };

  if (!imageData && !url) {
    res.status(400).json({ error: "imageData or url required" });
    return;
  }

  // ── Couple photo flow ────────────────────────────────────────────────────
  if (coupleIndex !== undefined && partner !== undefined) {
    if (coupleIndex < 0 || coupleIndex > 9) {
      res.status(400).json({ error: "coupleIndex must be 0-9" });
      return;
    }
    if (partner !== "A" && partner !== "B") {
      res.status(400).json({ error: "partner must be A or B" });
      return;
    }

    // Upsert: delete existing for same couple+partner, then insert
    const existing = await db
      .select()
      .from(liveGameAssetsTable)
      .where(
        and(
          eq(liveGameAssetsTable.liveSessionId, session.id),
          eq(liveGameAssetsTable.assetType, "couple_photo"),
        ),
      );
    const toDelete = existing.find(a => {
      const m = a.metadata as unknown as CoupleMeta;
      return m.coupleIndex === coupleIndex && m.partner === partner;
    });
    if (toDelete) {
      await db.delete(liveGameAssetsTable).where(eq(liveGameAssetsTable.id, toDelete.id));
    }

    const meta: CoupleMeta = {
      coupleIndex,
      partner,
      ...(coupleName && { coupleName }),
      ...(partnerName && { partnerName }),
      ...(imageData && { imageData }),
    };

    const [asset] = await db
      .insert(liveGameAssetsTable)
      .values({
        liveSessionId: session.id,
        gameSlug: "gioco-coppie",
        assetType: "couple_photo",
        label: coupleName ?? partnerName ?? label ?? null,
        url: url ?? null,
        metadata: meta as unknown as Record<string, unknown>,
      })
      .returning();

    // Emit updated couples list to all connected (TV shows progress)
    const couples = await buildCouplesList(session.id);
    const completeCouplesCount = couples.filter(c => c.complete).length;
    emitToRoom(`live:${session.id}`, "live:couples_updated", { couples, completeCouplesCount });

    logger.info(
      { sessionId: session.id, coupleIndex, partner, completeCouplesCount },
      "[LiveCoppie] couple photo upserted",
    );
    res.status(201).json({ asset, couples, completeCouplesCount });
    return;
  }

  // ── Legacy single photo flow ─────────────────────────────────────────────
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

  const photoId = Array.isArray(req.params.photoId) ? req.params.photoId[0]! : req.params.photoId;

  const [deleted] = await db
    .select()
    .from(liveGameAssetsTable)
    .where(and(eq(liveGameAssetsTable.id, photoId), eq(liveGameAssetsTable.liveSessionId, session.id)));

  await db
    .delete(liveGameAssetsTable)
    .where(and(eq(liveGameAssetsTable.id, photoId), eq(liveGameAssetsTable.liveSessionId, session.id)));

  // Emit updated list based on asset type
  if (deleted?.assetType === "couple_photo") {
    const couples = await buildCouplesList(session.id);
    const completeCouplesCount = couples.filter(c => c.complete).length;
    emitToRoom(`live:${session.id}`, "live:couples_updated", { couples, completeCouplesCount });
  } else {
    const remaining = await db
      .select()
      .from(liveGameAssetsTable)
      .where(and(eq(liveGameAssetsTable.liveSessionId, session.id), eq(liveGameAssetsTable.assetType, "photo")))
      .orderBy(liveGameAssetsTable.createdAt);
    emitToRoom(`live:${session.id}`, "live:photos_updated", { photos: remaining, count: remaining.length });
  }
  res.status(204).end();
});

// ── POST /live-sessions/:id/create-deck ──────────────────────────────────────
// Builds a real couples deck: 10 couples × 2 different photos = 20 cards.
// Each couple's Card A and Card B share the same pairId but have different images.
// Matching: same pairId.

router.post("/live-sessions/:id/create-deck", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const couples = await buildCouplesList(session.id);
  const completeCouples = couples.filter(c => c.complete);

  if (completeCouples.length < 2) {
    res.status(400).json({
      error: `Servono almeno 2 coppie complete (hai ${completeCouples.length}). Ogni coppia deve avere la foto del partner A e del partner B.`,
    });
    return;
  }

  // Build deck: 2 different cards per couple
  const cards: DeckCard[] = [];
  for (const couple of completeCouples) {
    const coupleId = couple.coupleId;
    const metaA = couple.photoA!.metadata as unknown as CoupleMeta;
    const metaB = couple.photoB!.metadata as unknown as CoupleMeta;
    const cName = metaA.coupleName ?? metaB.coupleName ?? couple.coupleName ?? couple.photoA!.label ?? null;

    cards.push({
      id: `${coupleId}-a`,
      pairId: coupleId,
      partner: "A",
      coupleName: cName ?? undefined,
      partnerName: metaA.partnerName,
      label: cName,
      imageData: metaA.imageData,
      url: couple.photoA!.url,
      flipped: false,
      matched: false,
    });
    cards.push({
      id: `${coupleId}-b`,
      pairId: coupleId,
      partner: "B",
      coupleName: cName ?? undefined,
      partnerName: metaB.partnerName,
      label: cName,
      imageData: metaB.imageData,
      url: couple.photoB!.url,
      flipped: false,
      matched: false,
    });
  }

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }

  const deckPayload = {
    cards,
    totalPairs: completeCouples.length,
    matchedPairs: 0,
    currentTeamTurn: null as string | null,
    flippedCards: [] as string[],
    scores: {} as Record<string, number>,
    gameOver: false,
    completeCouplesCount: completeCouples.length,
    createdAt: Date.now(),
  };

  // ── Build Home-session cards (home-coppie format, pairId = numeric index) ─
  interface HomeCoppieCard {
    id: string; text: string; imageUrl: string;
    pairId: number; flipped: boolean; matched: boolean;
  }
  const homeCardsList: HomeCoppieCard[] = [];
  for (let ci = 0; ci < completeCouples.length; ci++) {
    const couple = completeCouples[ci]!;
    const mA = couple.photoA!.metadata as unknown as CoupleMeta;
    const mB = couple.photoB!.metadata as unknown as CoupleMeta;
    const cName = mA.coupleName ?? mB.coupleName ?? couple.coupleName ?? `Coppia ${ci + 1}`;
    homeCardsList.push(
      { id: `${couple.coupleId}-a`, text: mA.partnerName ?? cName, imageUrl: mA.imageData ?? couple.photoA!.url ?? "", pairId: ci, flipped: false, matched: false },
      { id: `${couple.coupleId}-b`, text: mB.partnerName ?? cName, imageUrl: mB.imageData ?? couple.photoB!.url ?? "", pairId: ci, flipped: false, matched: false },
    );
  }
  for (let i = homeCardsList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [homeCardsList[i], homeCardsList[j]] = [homeCardsList[j]!, homeCardsList[i]!];
  }
  const homeRoundPayload = {
    mode: "home-coppie",
    themePhase: "playing",
    cards: homeCardsList,
    totalPairs: completeCouples.length,
    matchedPairs: 0,
    currentFlipped: [] as string[],
    gameOver: false,
    points: 150,
  };

  // ── Create or update the linked Home session ────────────────────────────
  const existingState = await getState(session.id);
  const existingPayload = (existingState?.payload ?? {}) as Record<string, unknown>;
  const existingHomeSessionId = existingPayload.homeSessionId as string | undefined;

  let homeSessionId: string;
  if (existingHomeSessionId) {
    await db.update(homeSessionsTable)
      .set({ roundPayload: homeRoundPayload, status: "playing", gameSlug: "gioco-coppie", totalRounds: 1, currentRound: 0 })
      .where(eq(homeSessionsTable.id, existingHomeSessionId));
    homeSessionId = existingHomeSessionId;
    logger.info({ sessionId: session.id, homeSessionId }, "[LiveCoppie] updated existing Home session for TV");
  } else {
    const joinCode = randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const [homeSession] = await db.insert(homeSessionsTable).values({
      joinCode,
      hostName: `LIVE — ${session.title}`,
      maxPlayers: 99,
      expiresAt,
      status: "playing",
      gameSlug: "gioco-coppie",
      gameConfig: { phase: "playing", gamesPlayed: [], preloadedRounds: [], selectedGames: ["gioco-coppie"], matchDuration: 0 },
      roundPayload: homeRoundPayload,
      totalRounds: 1,
      currentRound: 0,
    }).returning();
    homeSessionId = homeSession!.id;
    logger.info({ sessionId: session.id, homeSessionId }, "[LiveCoppie] created new Home session for TV");
  }

  await upsertState(session.id, {
    currentGameSlug: "gioco-coppie",
    currentPhase: "playing",
    payload: { ...existingPayload, coppie: deckPayload, homeSessionId },
  });

  await db
    .update(liveSessionsTable)
    .set({ status: "active", currentGameSlug: "gioco-coppie", currentPhase: "playing" })
    .where(eq(liveSessionsTable.id, session.id));

  emitToRoom(`live:${session.id}`, "live:command", {
    sessionId: session.id,
    command: "coppie_deck_ready",
    payload: { ...deckPayload, homeSessionId },
    ts: Date.now(),
  });

  logger.info(
    { sessionId: session.id, couples: completeCouples.length, cards: cards.length, homeSessionId },
    "[LiveCoppie] real couple deck created",
  );
  res.json({ ok: true, pairs: completeCouples.length, cards: cards.length, deck: deckPayload, homeSessionId });
});

// ── POST /live-sessions/:id/coppie-flip ──────────────────────────────────────
// Flip a card. Matching: a.pairId === b.pairId (same couple).

router.post("/live-sessions/:id/coppie-flip", async (req: Request, res: Response): Promise<void> => {
  const session = await resolveSession(req);
  if (!session) { res.status(404).json({ error: "Not found or access denied" }); return; }

  const state = await getState(session.id);
  if (!state || !state.payload) { res.status(400).json({ error: "No active deck" }); return; }

  const payload = state.payload as Record<string, unknown>;

  // ── If a Home session is linked, delegate flip to the Home runtime ───────
  const linkedHomeSessionId = payload.homeSessionId as string | undefined;
  if (linkedHomeSessionId) {
    const { cardId } = req.body as { cardId: string };
    try {
      const port = process.env["PORT"] ?? 8080;
      const r = await fetch(`http://localhost:${port}/api/home/sessions/${linkedHomeSessionId}/flip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const result = await r.json().catch(() => ({})) as { matched?: boolean; payload?: unknown };
      if (!r.ok) { res.status(r.status).json(result); return; }
      res.json({ ok: true, matched: result.matched ?? false, homeSessionId: linkedHomeSessionId });
    } catch (err) {
      logger.error({ err, homeSessionId: linkedHomeSessionId }, "[LiveCoppie] Home session flip failed");
      res.status(502).json({ error: "Home session unreachable" });
    }
    return;
  }

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
      // Match!
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
        sessionId: session.id,
        command: "coppie_match",
        payload: { cardId, pairId: a.pairId, teamId, scores, matchedPairs, gameOver },
        ts: Date.now(),
      });
    } else {
      // Mismatch — unflip after brief delay (client handles animation, state resets)
      const newState = { ...coppie, cards: (coppie.cards as Card[]).map(c => ({ ...c })), flippedCards: [] };
      await upsertState(session.id, { payload: { coppie: newState } });
      emitToRoom(`live:${session.id}`, "live:command", {
        sessionId: session.id,
        command: "coppie_mismatch",
        payload: { cardIds: [aId, bId] },
        ts: Date.now(),
      });
    }
  } else {
    const newState = { ...coppie, cards, flippedCards };
    await upsertState(session.id, { payload: { coppie: newState } });
    emitToRoom(`live:${session.id}`, "live:command", {
      sessionId: session.id,
      command: "coppie_flip",
      payload: { cardId },
      ts: Date.now(),
    });
  }

  const freshState = await getState(session.id);
  res.json({ ok: true, matched, gameOver, state: freshState });
});

export default router;
