/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

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
  applyAutoBook, applyAutoChoice, applyPerPlayerChoice,
  applyAmbulanteToggle, applyOggettoTargetToggle,
  RISATE_MISSIONS, LANGUAGE_PHRASES,
} from "../lib/risate-engine";
import { pickItalianPhrases } from "../lib/risate-missions";
import OpenAI from "openai";
import { logger } from "../lib/logger";

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
    const next = advancePhase(result.state);
    await saveRisateState(id, next.state, cfg);
    emitToRoom(homeRoom(id), "home:percorso_update", { state: next.state });
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

/* ── Part 3: Server-authoritative voting timer ───────────────────────────── */
const votingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRisateVotingAutoClose(sessionId: string, cfg: Record<string, unknown>, votingEndsAt: string): void {
  const existing = votingTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, new Date(votingEndsAt).getTime() - Date.now()) + 600;
  const timer = setTimeout(async () => {
    votingTimers.delete(sessionId);
    try {
      const session = await getSession(sessionId);
      if (!session) return;
      // In pausa (Regia/Presenter): non chiudere il voto, ricontrolla tra 1s.
      if ((session.roundPayload as Record<string, unknown> | null)?.["paused"]) {
        scheduleRisateVotingAutoClose(sessionId, cfg, new Date(Date.now() + 1000).toISOString());
        return;
      }
      const currentCfg = (session.gameConfig as Record<string, unknown>) ?? {};
      const s = getRisateState(currentCfg);
      if (!s || s.phase !== "voting") return;
      const { state: next, scores } = advancePhase(s);
      await saveRisateState(sessionId, next, currentCfg);
      emitToRoom(homeRoom(sessionId), "home:percorso_update", { state: next });
      for (const sc of scores) {
        const team = next.teams.find(t => t.id === sc.teamId);
        if (team) {
          await db.update(homePlayersTable)
            .set({ score: team.score })
            .where(eq(homePlayersTable.id, sc.teamId))
            .catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err, sessionId }, "[RISATE_VOTING_TIMER] auto-close failed");
    }
  }, delay);
  votingTimers.set(sessionId, timer);
}

/* ── Part 5: AI phrase translation ──────────────────────────────────────── */
/** Traduce le frasi nella lingua scelta e fornisce la PRONUNCIA semplificata
 *  (come la leggerebbe un italiano), così il poliglotta sa come dirla. */
async function translatePhrases(phrases: string[], targetLanguage: string): Promise<{ translated: string; pronunciation: string }[]> {
  const langClean = targetLanguage.replace(/\s*[\u{1F1E0}-\u{1F1FF}]{2}|🌍/gu, "").trim();
  /* Chiave diretta OpenAI: niente baseURL, l'SDK usa api.openai.com. */
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"] ?? "placeholder",
  });
  const results: { translated: string; pronunciation: string }[] = [];
  for (const phrase of phrases) {
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `Traduci la frase italiana in ${langClean} e fornisci la pronuncia SEMPLIFICATA per un italiano (come si legge, con sillabe, senza alfabeto fonetico). Rispondi SOLO con JSON valido: {"traduzione":"...","pronuncia":"..."}`,
          },
          { role: "user", content: phrase },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });
      const raw = (resp.choices[0]?.message?.content ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw) as { traduzione?: string; pronuncia?: string };
      results.push({ translated: parsed.traduzione?.trim() || phrase, pronunciation: parsed.pronuncia?.trim() || "" });
    } catch {
      results.push({ translated: phrase, pronunciation: "" }); // Fallback: usa l'originale
    }
  }
  return results;
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

  const mission = RISATE_MISSIONS[state.missionIndex];

  // ── Part 5: Poliglotta special advance logic ──────────────────────────────
  if (mission?.id === "poliglotta") {
    // A) language chosen → phrase_input sub-step (no DB phase change yet)
    if (state.phase === "public_choice" && state.poliglottaStep === "language") {
      const next = { ...state, poliglottaStep: "phrase_input" as const };
      await saveRisateState(id, next, cfg);
      emitToRoom(homeRoom(id), "home:percorso_update", { state: next });
      res.json({ state: next });
      return;
    }

    // B) phrase_input → active with AI translation
    if (state.phase === "public_choice" && state.poliglottaStep === "phrase_input") {
      const phrases = state.poliglottaSubmittedPhrases ?? [];
      const lang = state.publicChoice ?? state.poliglottaLanguage ?? "";
      let translations = state.poliglottaTranslations ?? [];
      let pronunciations = state.poliglottaPronunciations ?? [];

      if (translations.length === 0) {
        // Se il pubblico non ha inviato frasi, pescane 2 a caso dal banco italiano
        // (così NON è sempre la stessa frase). Poi traduci con pronuncia.
        const toTranslate = phrases.length > 0 ? phrases : pickItalianPhrases(2);
        try {
          const out = await translatePhrases(toTranslate, lang);
          translations = out.map(o => o.translated);
          pronunciations = out.map(o => o.pronunciation);
        } catch {
          translations = toTranslate;
          pronunciations = toTranslate.map(() => "");
        }
        // Garantisci almeno 2 frasi
        if (translations.length === 0) { translations = [LANGUAGE_PHRASES[lang] ?? "Buonasera a tutti!"]; pronunciations = [""]; }
        if (translations.length === 1) { translations = [translations[0]!, translations[0]!]; pronunciations = [pronunciations[0] ?? "", pronunciations[0] ?? ""]; }
      }

      const stateReady: RisateState = {
        ...state,
        poliglottaTranslations: translations,
        poliglottaPronunciations: pronunciations,
        poliglottaPhraseIndex: 0,
        poliglottaStep: "reading",
      };
      const { state: next, scores } = advancePhase(stateReady); // public_choice → active
      await saveRisateState(id, next, cfg);
      emitToRoom(homeRoom(id), "home:percorso_update", { state: next });
      for (const sc of scores) {
        const team = next.teams.find(t => t.id === sc.teamId);
        if (team) await db.update(homePlayersTable).set({ score: team.score }).where(eq(homePlayersTable.id, sc.teamId)).catch(() => {});
      }
      res.json({ state: next });
      return;
    }

    // C) reading → reveal (show original phrase)
    if (state.phase === "active" && state.poliglottaStep === "reading") {
      const next = { ...state, poliglottaStep: "reveal" as const };
      await saveRisateState(id, next, cfg);
      emitToRoom(homeRoom(id), "home:percorso_update", { state: next });
      res.json({ state: next });
      return;
    }

    // D) reveal + phraseIndex 0 → reading phrase 1
    if (state.phase === "active" && state.poliglottaStep === "reveal" && (state.poliglottaPhraseIndex ?? 0) === 0) {
      const next = { ...state, poliglottaStep: "reading" as const, poliglottaPhraseIndex: 1 };
      await saveRisateState(id, next, cfg);
      emitToRoom(homeRoom(id), "home:percorso_update", { state: next });
      res.json({ state: next });
      return;
    }

    // E) reveal + phraseIndex 1 → normal advance (voting)
    // Falls through to normal advance below
  }

  // ── Normal phase advance ────────────────────────────────────────────────────
  const { state: next, scores } = advancePhase(state);
  await saveRisateState(id, next, cfg);
  emitToRoom(homeRoom(id), "home:percorso_update", { state: next });

  // Part 3: schedule voting auto-close
  if (next.phase === "voting" && next.votingEndsAt) {
    scheduleRisateVotingAutoClose(id, cfg, next.votingEndsAt);
  }

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

/* ── POST /home/sessions/:id/risate/auto-book ────────────────────────────── */
router.post("/home/sessions/:id/risate/auto-book", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => applyAutoBook(s), res);
});

/* ── POST /home/sessions/:id/risate/auto-choice ──────────────────────────── */
router.post("/home/sessions/:id/risate/auto-choice", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await applyAndSave(id, s => applyAutoChoice(s), res);
});

/* ── POST /home/sessions/:id/risate/per-player-choice ────────────────────── */
router.post("/home/sessions/:id/risate/per-player-choice", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { choice, slot } = req.body as { choice?: string; slot?: number };
  if (!choice || slot === undefined) { res.status(400).json({ error: "choice e slot richiesti" }); return; }
  await applyAndSave(id, s => applyPerPlayerChoice(s, choice, slot), res);
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
  const { action, playerId, nickname, targetPlayerId, emoji, targetIndex } = req.body as {
    action?: string; playerId?: string; nickname?: string;
    targetPlayerId?: string; emoji?: string; targetIndex?: number;
  };
  if (!action || !playerId || !nickname) { res.status(400).json({ error: "action, playerId, nickname richiesti" }); return; }
  await applyAndSave(id, s => applyPublicAction(s, action, playerId, nickname, { targetPlayerId, emoji, targetIndex }), res);
});

/* ── Part 4: POST /home/sessions/:id/risate/ambulante-toggle ─────────────── */
router.post("/home/sessions/:id/risate/ambulante-toggle", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { product } = req.body as { product?: string };
  if (!product) { res.status(400).json({ error: "product richiesto" }); return; }
  await applyAndSave(id, s => applyAmbulanteToggle(s, product), res);
});

/* ── Part 6: POST /home/sessions/:id/risate/oggetto-target-toggle ────────── */
router.post("/home/sessions/:id/risate/oggetto-target-toggle", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { target } = req.body as { target?: string };
  if (!target) { res.status(400).json({ error: "target richiesto" }); return; }
  await applyAndSave(id, s => applyOggettoTargetToggle(s, target), res);
});

/* ── Part 5: POST /home/sessions/:id/risate/poliglotta-phrase ────────────── */
router.post("/home/sessions/:id/risate/poliglotta-phrase", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { phrase } = req.body as { phrase?: string };
  if (!phrase || phrase.trim().length < 3) { res.status(400).json({ error: "Frase troppo corta (min 3 caratteri)" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getRisateState(cfg);
  if (!state) { res.status(404).json({ error: "Stato non trovato" }); return; }

  const m = RISATE_MISSIONS[state.missionIndex];
  if (m?.id !== "poliglotta" || state.poliglottaStep !== "phrase_input") {
    res.status(409).json({ error: "Non è la fase di inserimento frasi" }); return;
  }

  const phrases = state.poliglottaSubmittedPhrases ?? [];
  if (phrases.length >= 2) { res.json({ state, skipped: true }); return; }

  const newPhrases = [...phrases, phrase.trim()];
  let newState: RisateState = { ...state, poliglottaSubmittedPhrases: newPhrases };

  // When we have 2 phrases: auto-translate them
  if (newPhrases.length >= 2) {
    const lang = state.publicChoice ?? state.poliglottaLanguage ?? "";
    newState = { ...newState, poliglottaStep: "translating" };
    await saveRisateState(id, newState, cfg);
    emitToRoom(homeRoom(id), "home:percorso_update", { state: newState });

    let translations: string[];
    let pronunciations: string[];
    try {
      const out = await translatePhrases(newPhrases, lang);
      translations = out.map(o => o.translated);
      pronunciations = out.map(o => o.pronunciation);
    } catch {
      translations = newPhrases;
      pronunciations = newPhrases.map(() => "");
    }
    newState = { ...newState, poliglottaTranslations: translations, poliglottaPronunciations: pronunciations, poliglottaStep: "phrase_input" };
  }

  await saveRisateState(id, newState, cfg);
  emitToRoom(homeRoom(id), "home:percorso_update", { state: newState });
  res.json({ state: newState });
});

export default router;
