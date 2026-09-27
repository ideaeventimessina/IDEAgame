/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Home mode — Lockdown BoardGame v1 (Master + Lock-Euro) ─────────────────
   Tutti gli endpoint sono pubblici (niente requireAuth): le sessioni home non
   usano l'auth tenant.  Lo stato vive in homeSessionsTable.gameConfig.lockdownState,
   esattamente come RisateState per il Percorso a Risate.
   La SPIA non viene MAI mandata ai client finché spyRevealed non è true:
   ogni payload emesso/risposto passa da redact().
──────────────────────────────────────────────────────────────────────────── */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, homeSessionsTable, homePlayersTable } from "@workspace/db";
import type { LockdownState, LockdownRoom, LockdownMulta } from "@workspace/db";
import { emitToRoom } from "../socket";
import {
  createLockdownState, enterRoom, applyAward, applyMulta,
  drawDpcm, accuseSpy, checkWin,
  resolveObjective, castVote, resolveVotes, spySabotage,
  LOCKDOWN_CONTENT,
  type LockdownPlayerInput,
} from "../lib/lockdown-engine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string): boolean { return UUID_RE.test(s); }

function homeRoom(id: string) { return `home:${id}`; }

/* ── Redazione della spia ──────────────────────────────────────────────────
   Non trapelare mai spyPlayerId ai client finché non è rivelata. */
function redact(state: LockdownState): LockdownState {
  if (state.spyRevealed) return state;
  return { ...state, spyPlayerId: null };
}

/* ── State helpers ─────────────────────────────────────────────────────────── */
async function getSession(id: string) {
  if (!isUUID(id)) return null;
  const [s] = await db.select().from(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  return s ?? null;
}

async function getPlayers(sessionId: string) {
  return db.select().from(homePlayersTable).where(eq(homePlayersTable.sessionId, sessionId));
}

function getLockdownState(gameConfig: Record<string, unknown>): LockdownState | null {
  const ls = gameConfig["lockdownState"];
  if (ls && typeof ls === "object" && (ls as { version?: number }).version === 1) {
    return ls as LockdownState;
  }
  return null;
}

async function saveLockdownState(id: string, state: LockdownState, prevConfig: Record<string, unknown>): Promise<void> {
  await db.update(homeSessionsTable)
    .set({ gameConfig: { ...prevConfig, lockdownState: state } })
    .where(eq(homeSessionsTable.id, id));
}

/** Emette lo stato (redatto) sul canale della stanza — come fa home-risate. */
function broadcastLockdown(id: string, state: LockdownState): void {
  emitToRoom(homeRoom(id), "home:lockdown_update", { state: redact(state) });
}

/** Carica → applica un updater puro → salva → emette. */
async function applyAndSave(
  id: string,
  updater: (state: LockdownState) => { state: LockdownState; error?: string },
  res: Response,
): Promise<void> {
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getLockdownState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Lockdown non inizializzato — chiama prima /lockdown/init" }); return; }

  const result = updater(state);
  if (result.error) { res.status(400).json({ error: result.error }); return; }

  await saveLockdownState(id, result.state, cfg);
  broadcastLockdown(id, result.state);
  res.json({ state: redact(result.state) });
}

/* ── GET /home/sessions/:id/lockdown/state ───────────────────────────────────
   Accetta ?playerId= opzionale: se combacia con la spia, la risposta include
   youAreSpy=true SENZA mai esporre spyPlayerId (resta redatto). Così il telefono
   della spia scopre in segreto di esserlo. */
router.get("/home/sessions/:id/lockdown/state", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getLockdownState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Lockdown non inizializzato" }); return; }

  const playerId = req.query["playerId"] != null ? String(req.query["playerId"]) : null;
  const youAreSpy = playerId != null && state.spyPlayerId != null && playerId === state.spyPlayerId;
  res.json({ state: redact(state), youAreSpy });
});

/* ── POST /home/sessions/:id/lockdown/init ─────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/init", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const dbPlayers = await getPlayers(id);
  if (dbPlayers.length === 0) { res.status(400).json({ error: "Nessun giocatore nella sessione" }); return; }

  const players: LockdownPlayerInput[] = dbPlayers.map(p => ({
    id: p.id, nickname: p.nickname, avatarColor: p.avatarColor,
  }));

  const state = createLockdownState(players);
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  await saveLockdownState(id, state, cfg);
  broadcastLockdown(id, state);
  res.status(201).json({ state: redact(state) });
});

/* ── POST /home/sessions/:id/lockdown/next-room ────────────────────────────── */
router.post("/home/sessions/:id/lockdown/next-room", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => ({ state: enterRoom(s) }), res);
});

/* ── POST /home/sessions/:id/lockdown/start-challenge ──────────────────────── */
router.post("/home/sessions/:id/lockdown/start-challenge", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => {
    const room: LockdownRoom | undefined = LOCKDOWN_CONTENT.rooms.find(r => r.id === s.currentRoomId);
    const endsAt = room && room.timeLimit > 0
      ? new Date(Date.now() + room.timeLimit * 1000).toISOString()
      : null;
    return {
      state: {
        ...s,
        phase: "challenge",
        endsAt,
        lastFlash: { text: "🚀 Sfida avviata!", type: "challenge" },
      },
    };
  }, res);
});

/* ── POST /home/sessions/:id/lockdown/resolve-challenge ────────────────────── */
router.post("/home/sessions/:id/lockdown/resolve-challenge", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { awards } = req.body as { awards?: { playerId: string; amount: number }[] };
  await applyAndSave(id, s => {
    let next = s;
    for (const a of awards ?? []) {
      if (!a || typeof a.playerId !== "string" || typeof a.amount !== "number") continue;
      next = applyAward(next, a.playerId, a.amount);
    }
    next = { ...next, phase: "result", endsAt: null };
    next = checkWin(next);
    return { state: next };
  }, res);
});

/* ── POST /home/sessions/:id/lockdown/award ────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/award", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, amount } = req.body as { playerId?: string; amount?: number };
  if (!playerId || typeof amount !== "number") { res.status(400).json({ error: "playerId e amount richiesti" }); return; }
  await applyAndSave(id, s => ({ state: applyAward(s, playerId, amount) }), res);
});

/* ── POST /home/sessions/:id/lockdown/dpcm ─────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/dpcm", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => ({ state: drawDpcm(s) }), res);
});

/* ── POST /home/sessions/:id/lockdown/multa ────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/multa", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, multaId } = req.body as { playerId?: string; multaId?: string };
  if (!playerId) { res.status(400).json({ error: "playerId richiesto" }); return; }
  await applyAndSave(id, s => {
    const multa: LockdownMulta | undefined = multaId
      ? LOCKDOWN_CONTENT.multe.find(m => m.id === multaId)
      : LOCKDOWN_CONTENT.multe[Math.floor(Math.random() * LOCKDOWN_CONTENT.multe.length)];
    if (!multa) return { state: s, error: "Multa non trovata" };
    return { state: applyMulta(s, playerId, multa) };
  }, res);
});

/* ── POST /home/sessions/:id/lockdown/answer ───────────────────────────────── */
router.post("/home/sessions/:id/lockdown/answer", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, answerIndex, text } = req.body as { playerId?: string; answerIndex?: number; text?: string };
  if (!playerId) { res.status(400).json({ error: "playerId richiesto" }); return; }
  await applyAndSave(id, s => {
    if (!s.currentChallenge) return { state: s, error: "Nessuna sfida attiva" };
    const submissions = { ...((s.currentChallenge["submissions"] as Record<string, unknown> | undefined) ?? {}) };
    submissions[playerId] = { answerIndex, text, ts: Date.now() };
    return { state: { ...s, currentChallenge: { ...s.currentChallenge, submissions } } };
  }, res);
});

/* ── POST /home/sessions/:id/lockdown/accuse ───────────────────────────────── */
router.post("/home/sessions/:id/lockdown/accuse", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { accuserId, suspectId } = req.body as { accuserId?: string; suspectId?: string };
  if (!accuserId || !suspectId) { res.status(400).json({ error: "accuserId e suspectId richiesti" }); return; }
  await applyAndSave(id, s => ({ state: accuseSpy(s, accuserId, suspectId) }), res);
});

/* ── POST /home/sessions/:id/lockdown/resolve-objective ─────────────────────
   Sfide OGGETTIVE (subjective=false): l'app conosce la risposta e auto-assegna. */
router.post("/home/sessions/:id/lockdown/resolve-objective", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => ({ state: resolveObjective(s) }), res);
});

/* ── POST /home/sessions/:id/lockdown/vote ─────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/vote", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { voterId, votedPlayerId } = req.body as { voterId?: string; votedPlayerId?: string };
  if (!voterId || !votedPlayerId) { res.status(400).json({ error: "voterId e votedPlayerId richiesti" }); return; }
  await applyAndSave(id, s => ({ state: castVote(s, voterId, votedPlayerId) }), res);
});

/* ── POST /home/sessions/:id/lockdown/resolve-votes ────────────────────────── */
router.post("/home/sessions/:id/lockdown/resolve-votes", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => ({ state: resolveVotes(s) }), res);
});

/* ── POST /home/sessions/:id/lockdown/spy-sabotage ─────────────────────────── */
router.post("/home/sessions/:id/lockdown/spy-sabotage", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { spyId } = req.body as { spyId?: string };
  if (!spyId) { res.status(400).json({ error: "spyId richiesto" }); return; }
  await applyAndSave(id, s => ({ state: spySabotage(s, spyId) }), res);
});

/* ── POST /home/sessions/:id/lockdown/end ──────────────────────────────────── */
router.post("/home/sessions/:id/lockdown/end", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getLockdownState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Lockdown non inizializzato" }); return; }

  const resolved = checkWin(state);
  const ended: LockdownState = {
    ...resolved,
    status: "ended",
    phase: "ended",
    winnerId: resolved.winnerId,
    spyRevealed: true,
    lastFlash: resolved.lastFlash ?? { text: "🔚 Partita terminata", type: "end" },
  };

  await saveLockdownState(id, ended, cfg);
  broadcastLockdown(id, ended);
  logger.info({ sessionId: id, winnerId: ended.winnerId }, "[LOCKDOWN] partita terminata");
  res.json({ state: redact(ended) });
});

export default router;
