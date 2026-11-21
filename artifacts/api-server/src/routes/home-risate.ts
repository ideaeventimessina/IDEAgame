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
  applyAmbulanteToggle, applyOggettoTargetToggle, sincronizzaGiocatori,
  RISATE_MISSIONS, LANGUAGE_PHRASES, type AdvanceResult,
} from "../lib/risate-engine";
import { mutaStatoHome, type EsitoMutazione } from "../lib/stato-home";
import { backendStatoHomeDb } from "../lib/stato-home-db";
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

/* ── Mutazioni serializzate (lock di riga + scrittura della sola chiave) ──────
   Prima: leggi sessione → calcola → riscrivi tutto game_config. Due richieste
   insieme (voto + voto, voto + timer, poliglotta + advance) si cancellavano a
   vicenda. Ora passano tutte da mutaRisate (vedi lib/stato-home.ts). */
type EsitoRisate = {
  status: number;
  body: unknown;
  stato?: RisateState;          // nuovo stato da trasmettere (dopo il commit)
  intermedio?: RisateState;     // stato prima di un auto-advance (trasmesso per primo)
  punti?: AdvanceResult["scores"];
};

async function mutaRisate(
  id: string,
  fn: (stato: RisateState | null) => EsitoMutazione<RisateState, EsitoRisate> | Promise<EsitoMutazione<RisateState, EsitoRisate>>,
): Promise<EsitoRisate> {
  if (!isUUID(id)) return { status: 404, body: { error: "Sessione non trovata" } };
  const out = await mutaStatoHome(backendStatoHomeDb, id, "risateState", (v) => getRisateState({ risateState: v }), (stato) => fn(stato));
  return out.trovata ? out.risultato : { status: 404, body: { error: "Sessione non trovata" } };
}

/** Dopo il commit: trasmette lo stato, scrive i punteggi, arma il timer del voto, risponde. */
async function concludi(id: string, esito: EsitoRisate, res?: Response): Promise<void> {
  if (esito.intermedio) emitToRoom(homeRoom(id), "home:percorso_update", { state: esito.intermedio });
  if (esito.stato) {
    emitToRoom(homeRoom(id), "home:percorso_update", { state: esito.stato });
    for (const sc of esito.punti ?? []) {
      const team = esito.stato.teams.find(t => t.id === sc.teamId);
      if (team) {
        await db.update(homePlayersTable).set({ score: team.score })
          .where(eq(homePlayersTable.id, sc.teamId)).catch(() => {});
      }
    }
    if (esito.stato.phase === "voting" && esito.stato.votingEndsAt) {
      scheduleRisateVotingAutoClose(id, esito.stato.votingEndsAt);
    }
  }
  res?.status(esito.status).json(esito.body);
}

const NON_INIZIALIZZATO: EsitoMutazione<RisateState, EsitoRisate> = {
  risultato: { status: 404, body: { error: "Stato Risate non inizializzato — chiama prima /risate/init" } },
};

async function applyAndSave(
  id: string,
  updater: (state: RisateState) => { state: RisateState; error?: string; autoAdvance?: boolean },
  res: Response,
): Promise<void> {
  // Chi è entrato dopo l'init viene aggiunto alle squadre (vedi sincronizzaGiocatori).
  const presenti = isUUID(id) ? await getPlayers(id) : [];
  const esito = await mutaRisate(id, (state) => {
    if (!state) return NON_INIZIALIZZATO;
    const result = updater(sincronizzaGiocatori(state, presenti));
    if (result.error) return { risultato: { status: 400, body: { error: result.error } } };
    if (result.autoAdvance) {
      const next = advancePhase(result.state);
      return {
        salva: next.state,
        risultato: { status: 200, body: { state: next.state, autoAdvanced: true }, intermedio: result.state, stato: next.state, punti: next.scores },
      };
    }
    return { salva: result.state, risultato: { status: 200, body: { state: result.state }, stato: result.state } };
  });
  await concludi(id, esito, res);
}

/* ── Part 3: Server-authoritative voting timer ───────────────────────────── */
const votingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRisateVotingAutoClose(sessionId: string, votingEndsAt: string): void {
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
        scheduleRisateVotingAutoClose(sessionId, new Date(Date.now() + 1000).toISOString());
        return;
      }
      // Sotto lock: se nel frattempo qualcuno ha già chiuso il voto, non si fa nulla.
      const esito = await mutaRisate(sessionId, (s) => {
        if (!s || s.phase !== "voting") return { risultato: { status: 200, body: null } };
        const { state: next, scores } = advancePhase(s);
        return { salva: next, risultato: { status: 200, body: null, stato: next, punti: scores } };
      });
      await concludi(sessionId, esito);
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
        // I modelli gpt-5 rifiutano max_tokens e temperature (400): prima la
        // traduzione falliva sempre e ricadeva sulla frase italiana.
        max_completion_tokens: 1000,
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
  const esito = await mutaRisate(id, () => ({ salva: state, risultato: { status: 201, body: { state }, stato: state } }));
  await concludi(id, esito, res);
});

/* Poliglotta, passo B: servono le traduzioni (chiamata IA, lenta). Si fanno
   FUORI dal lock e si applicano solo se lo stato è ancora quello di partenza. */
function poliglottaPassoB(s: RisateState): boolean {
  return RISATE_MISSIONS[s.missionIndex]?.id === "poliglotta" && s.phase === "public_choice" && s.poliglottaStep === "phrase_input";
}

async function preparaTraduzioni(state: RisateState): Promise<{ translations: string[]; pronunciations: string[] }> {
  const phrases = state.poliglottaSubmittedPhrases ?? [];
  const lang = state.publicChoice ?? state.poliglottaLanguage ?? "";
  // Se il pubblico non ha inviato frasi, pescane 2 a caso dal banco italiano
  // (così NON è sempre la stessa frase). Poi traduci con pronuncia.
  const toTranslate = phrases.length > 0 ? phrases : pickItalianPhrases(2);
  let translations: string[];
  let pronunciations: string[];
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
  return { translations, pronunciations };
}

/** Il passo della macchina a stati di /advance (puro, sotto lock). */
function passoAdvance(
  state: RisateState,
  pronte: { missionIndex: number; translations: string[]; pronunciations: string[] } | null,
): EsitoMutazione<RisateState, EsitoRisate> {
  const ok = (next: RisateState, punti: AdvanceResult["scores"] = [], extra: Record<string, unknown> = {}) =>
    ({ salva: next, risultato: { status: 200, body: { state: next, ...extra }, stato: next, punti } });
  const mission = RISATE_MISSIONS[state.missionIndex];

  // ── Part 5: Poliglotta special advance logic ──────────────────────────────
  if (mission?.id === "poliglotta") {
    // A) language chosen → phrase_input sub-step (no DB phase change yet)
    if (state.phase === "public_choice" && state.poliglottaStep === "language") {
      return ok({ ...state, poliglottaStep: "phrase_input" as const });
    }
    // B) phrase_input → active with AI translation
    if (poliglottaPassoB(state)) {
      let translations = state.poliglottaTranslations ?? [];
      let pronunciations = state.poliglottaPronunciations ?? [];
      if (translations.length === 0) {
        if (pronte && pronte.missionIndex === state.missionIndex) {
          translations = pronte.translations; pronunciations = pronte.pronunciations;
        } else {
          // Nessuna traduzione pronta (gara con un'altra richiesta): frasi originali.
          const frasi = (state.poliglottaSubmittedPhrases ?? []).length ? state.poliglottaSubmittedPhrases! : [LANGUAGE_PHRASES[state.publicChoice ?? ""] ?? "Buonasera a tutti!"];
          translations = frasi.length === 1 ? [frasi[0]!, frasi[0]!] : frasi;
          pronunciations = translations.map(() => "");
        }
      }
      const stateReady: RisateState = {
        ...state,
        poliglottaTranslations: translations,
        poliglottaPronunciations: pronunciations,
        poliglottaPhraseIndex: 0,
        poliglottaStep: "reading",
      };
      const { state: next, scores } = advancePhase(stateReady); // public_choice → active
      return ok(next, scores);
    }
    // C) reading → reveal (show original phrase)
    if (state.phase === "active" && state.poliglottaStep === "reading") {
      return ok({ ...state, poliglottaStep: "reveal" as const });
    }
    // D) reveal + phraseIndex 0 → reading phrase 1
    if (state.phase === "active" && state.poliglottaStep === "reveal" && (state.poliglottaPhraseIndex ?? 0) === 0) {
      return ok({ ...state, poliglottaStep: "reading" as const, poliglottaPhraseIndex: 1 });
    }
    // E) reveal + phraseIndex 1 → normal advance (voting)
  }

  // ── Normal phase advance ────────────────────────────────────────────────────
  const { state: next, scores } = advancePhase(state);
  return ok(next, scores, { scored: scores });
}

/* ── POST /home/sessions/:id/risate/advance ──────────────────────────────── */
router.post("/home/sessions/:id/risate/advance", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const snapshot = getRisateState((session.gameConfig as Record<string, unknown>) ?? {});
  if (!snapshot) { res.status(404).json({ error: "Stato Risate non inizializzato" }); return; }

  let pronte: { missionIndex: number; translations: string[]; pronunciations: string[] } | null = null;
  if (poliglottaPassoB(snapshot) && (snapshot.poliglottaTranslations ?? []).length === 0) {
    pronte = { missionIndex: snapshot.missionIndex, ...(await preparaTraduzioni(snapshot)) };
  }
  const presenti = await getPlayers(id);
  const esito = await mutaRisate(id, (state) => {
    if (!state) return NON_INIZIALIZZATO;
    return passoAdvance(sincronizzaGiocatori(state, presenti), pronte);
  });
  await concludi(id, esito, res);
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

  // 1) Sotto lock: aggiunge la frase. Con la seconda frase passa a "translating".
  const primo = await mutaRisate(id, (state) => {
    if (!state) return { risultato: { status: 404, body: { error: "Stato non trovato" } } };
    const m = RISATE_MISSIONS[state.missionIndex];
    if (m?.id !== "poliglotta" || state.poliglottaStep !== "phrase_input") {
      return { risultato: { status: 409, body: { error: "Non è la fase di inserimento frasi" } } };
    }
    const phrases = state.poliglottaSubmittedPhrases ?? [];
    if (phrases.length >= 2) return { risultato: { status: 200, body: { state, skipped: true } } };
    const newPhrases = [...phrases, phrase.trim()];
    const next: RisateState = {
      ...state,
      poliglottaSubmittedPhrases: newPhrases,
      ...(newPhrases.length >= 2 ? { poliglottaStep: "translating" as const } : {}),
    };
    return { salva: next, risultato: { status: 200, body: { state: next }, stato: next } };
  });
  if (primo.status !== 200 || !primo.stato || primo.stato.poliglottaStep !== "translating") {
    await concludi(id, primo, res);
    return;
  }
  await concludi(id, primo);

  // 2) Traduzione FUORI dal lock (chiamata IA lenta).
  const inTraduzione = primo.stato;
  const frasi = inTraduzione.poliglottaSubmittedPhrases ?? [];
  const lang = inTraduzione.publicChoice ?? inTraduzione.poliglottaLanguage ?? "";
  let translations: string[];
  let pronunciations: string[];
  try {
    const out = await translatePhrases(frasi, lang);
    translations = out.map(o => o.translated);
    pronunciations = out.map(o => o.pronunciation);
  } catch {
    translations = frasi;
    pronunciations = frasi.map(() => "");
  }

  // 3) Sotto lock: si applica SOLO se lo stato è ancora quello lasciato al passo 1.
  //    Prima si riscriveva la copia vecchia e si annullava un advance arrivato nel frattempo.
  const secondo = await mutaRisate(id, (state) => {
    if (!state) return NON_INIZIALIZZATO;
    const stesso = state.missionIndex === inTraduzione.missionIndex && state.poliglottaStep === "translating";
    if (!stesso) return { risultato: { status: 200, body: { state } } };
    const next: RisateState = { ...state, poliglottaTranslations: translations, poliglottaPronunciations: pronunciations, poliglottaStep: "phrase_input" };
    return { salva: next, risultato: { status: 200, body: { state: next }, stato: next } };
  });
  await concludi(id, secondo, res);
});

export default router;
