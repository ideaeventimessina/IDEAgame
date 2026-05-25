/* ─── Home mode — Percorso a Risate: Missioni Improvvise v2 ─────────────────
   All endpoints are public (no requireAuth) because home sessions don't use
   tenant auth.  State lives in homeSessionsTable.gameConfig.risateState.
──────────────────────────────────────────────────────────────────────────── */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, homeSessionsTable, homePlayersTable } from "@workspace/db";
import type { RisateState, RisateTeam, RisatePlayer } from "@workspace/db";
import { emitToRoom } from "../socket";
import {
  createBlankRisateState, advancePhase,
  applyBooking, applyPublicChoice, applyVote, applyPublicAction,
} from "../lib/risate-engine";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string): boolean { return UUID_RE.test(s); }

function homeRoom(id: string) { return `home:${id}`; }

/* ── State helpers ───────────────────────────────────────────────────────── */

async function getSession(id: string) {
  if (!isUUID(id)) return null;
  const [s] = await db.select().from(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  return s ?? null;
}

async function getPlayers(sessionId: string) {
  return db.select().from(homePlayersTable).where(eq(homePlayersTable.sessionId, sessionId));
}

function getRisateState(gameConfig: Record<string, unknown>): RisateState | null {
  const rs = gameConfig["risateState"];
  if (rs && typeof rs === "object" && (rs as { version?: number }).version === 2) {
    return rs as RisateState;
  }
  return null;
}

async function saveRisateState(id: string, state: RisateState, prevConfig: Record<string, unknown>): Promise<void> {
  await db.update(homeSessionsTable)
    .set({ gameConfig: { ...prevConfig, risateState: state } })
    .where(eq(homeSessionsTable.id, id));
}

async function applyAndSave(
  id: string,
  updater: (state: RisateState) => { state: RisateState; error?: string; autoAdvance?: boolean },
  res: Response,
): Promise<void> {
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getRisateState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Risate non inizializzato — chiama prima /risate/init" }); return; }

  const result = updater(state);
  if (result.error) { res.status(400).json({ error: result.error }); return; }

  await saveRisateState(id, result.state, cfg);
  emitToRoom(homeRoom(id), "home:percorso_update", { state: result.state });

  if (result.autoAdvance) {
    // Auto-advance to next phase (e.g. mission 1 error limit reached)
    const next = advancePhase(result.state);
    await saveRisateState(id, next.state, cfg);
    emitToRoom(homeRoom(id), "home:percorso_update", { state: next.state });

    // Apply score changes to homePlayersTable (teamId === playerId in home mode)
    for (const sc of next.scores) {
      const team = next.state.teams.find(t => t.id === sc.teamId);
      if (team) {
        await db.update(homePlayersTable)
          .set({ score: team.score })
          .where(eq(homePlayersTable.id, sc.teamId))
          .catch(() => {});
      }
    }
    res.json({ state: next.state, autoAdvanced: true });
    return;
  }

  res.json({ state: result.state });
}

/* ── GET /home/sessions/:id/risate/state ─────────────────────────────────── */
router.get("/home/sessions/:id/risate/state", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getRisateState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Risate non inizializzato" }); return; }
  res.json(state);
});

/* ── POST /home/sessions/:id/risate/init ─────────────────────────────────── */
router.post("/home/sessions/:id/risate/init", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const dbPlayers = await getPlayers(id);
  if (dbPlayers.length === 0) { res.status(400).json({ error: "Nessun giocatore nella sessione" }); return; }

  // In home mode each player is their own team
  const teams: RisateTeam[] = dbPlayers.map(p => ({
    id: p.id, name: p.nickname, color: p.avatarColor, score: p.score,
  }));
  const players: RisatePlayer[] = dbPlayers.map(p => ({
    id: p.id, nickname: p.nickname, teamId: p.id, teamName: p.nickname, teamColor: p.avatarColor,
  }));

  const state = createBlankRisateState(teams, players);
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  await saveRisateState(id, state, cfg);
  emitToRoom(homeRoom(id), "home:percorso_update", { state });
  res.status(201).json({ state });
});

/* ── POST /home/sessions/:id/risate/advance ──────────────────────────────── */
router.post("/home/sessions/:id/risate/advance", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }

  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getRisateState(cfg);
  if (!state) { res.status(404).json({ error: "Stato Risate non inizializzato" }); return; }

  const { state: next, scores } = advancePhase(state);
  await saveRisateState(id, next, cfg);
  emitToRoom(homeRoom(id), "home:percorso_update", { state: next });

  // Write scores to homePlayersTable (teamId === playerId in home mode)
  for (const sc of scores) {
    const team = next.teams.find(t => t.id === sc.teamId);
    if (team) {
      await db.update(homePlayersTable)
        .set({ score: team.score })
        .where(eq(homePlayersTable.id, sc.teamId))
        .catch(() => {});
    }
  }

  res.json({ state: next, scored: scores });
});

/* ── POST /home/sessions/:id/risate/book ─────────────────────────────────── */
router.post("/home/sessions/:id/risate/book", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, nickname, teamId } = req.body as { playerId?: string; nickname?: string; teamId?: string };
  if (!playerId || !nickname || !teamId) { res.status(400).json({ error: "playerId, nickname, teamId richiesti" }); return; }

  await applyAndSave(id, s => applyBooking(s, playerId, nickname, teamId), res);
});

/* ── POST /home/sessions/:id/risate/choice ───────────────────────────────── */
router.post("/home/sessions/:id/risate/choice", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { choice } = req.body as { choice?: string };
  if (!choice) { res.status(400).json({ error: "choice richiesto" }); return; }

  await applyAndSave(id, s => applyPublicChoice(s, choice), res);
});

/* ── POST /home/sessions/:id/risate/vote ─────────────────────────────────── */
router.post("/home/sessions/:id/risate/vote", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, score, voterId } = req.body as { playerId?: string; score?: number; voterId?: string };
  if (!playerId || score === undefined || !voterId) { res.status(400).json({ error: "playerId, score, voterId richiesti" }); return; }

  await applyAndSave(id, s => applyVote(s, playerId, score, voterId), res);
});

/* ── POST /home/sessions/:id/risate/action ───────────────────────────────── */
router.post("/home/sessions/:id/risate/action", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { action, playerId, nickname, targetPlayerId, emoji } = req.body as {
    action?: string; playerId?: string; nickname?: string; targetPlayerId?: string; emoji?: string;
  };
  if (!action || !playerId || !nickname) { res.status(400).json({ error: "action, playerId, nickname richiesti" }); return; }

  await applyAndSave(id, s => applyPublicAction(s, action, playerId, nickname, { targetPlayerId, emoji }), res);
});

export default router;
