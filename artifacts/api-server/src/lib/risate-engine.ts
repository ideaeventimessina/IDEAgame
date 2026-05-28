/* ─── Percorso a Risate — Missioni Improvvise v2 — Shared Engine ────────────
   Pure logic: no DB, no Express. Both home-mode and event-mode routes
   import this and only differ in WHERE they store/emit the state.
──────────────────────────────────────────────────────────────────────────── */

import type {
  RisateState, RisateTeam, RisatePlayer, RisateBooking, RisateMissionResult,
} from "@workspace/db";
import { RISATE_MISSIONS, YOGA_POSES, LANGUAGE_PHRASES, TONGUE_TWISTER_BANK } from "./risate-missions";

export { RISATE_MISSIONS, LANGUAGE_PHRASES };

/* ─── Constants ───────────────────────────────────────────────────────────── */
export const VALIDATE_THRESHOLD   = 2;
export const FOUND_THRESHOLD      = 2;
export const REPEAT_THRESHOLD     = 4;   // kept for compat; actual cap is REPEAT_MAX
export const REPEAT_MAX           = 3;   // Part 2: max ripetilo requests per mission
export const CAMBIO_STILE_THRESHOLD = 5;
export const OGGETTO_TARGET_COUNT = 3;   // Part 6: targets per trova-oggetto mission
export const VOTING_DURATION_MS   = 10_000; // Part 3: 10s voting timer

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function shuffled<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }
function pick<T>(arr: T[], n: number): T[] { return shuffled(arr).slice(0, n); }

/* Part 1 — scioglilingua bank with pool tracking */
function pickTongueTwisters(state: RisateState): { options: string[]; used: string[] } {
  const used = state.usedTongueTwisters ?? [];
  let available = TONGUE_TWISTER_BANK.filter(t => !used.includes(t));
  if (available.length < 3) {
    // Pool exhausted — reshuffle
    available = [...TONGUE_TWISTER_BANK];
  }
  const options = pick(available, 3);
  const newUsed = [...used, ...options].filter((t, i, arr) => arr.indexOf(t) === i);
  return { options, used: newUsed };
}

function buildChoiceOptions(state: RisateState): { options: string[]; usedTongueTwisters?: string[] } {
  const m = RISATE_MISSIONS[state.missionIndex];
  if (!m) return { options: [] };
  if (m.id === "yoga") return { options: pick(YOGA_POSES, 3).map(p => `${p.emoji} ${p.name}`) };
  if (m.id === "scioglilingua") {
    const { options, used } = pickTongueTwisters(state);
    return { options, usedTongueTwisters: used };
  }
  return { options: shuffled(m.choiceOptions ?? []) };
}

function pickLoveTarget(state: RisateState): string {
  const bookedIds = new Set(state.bookings.map(b => b.playerId));
  const available = state.players.filter(p => !bookedIds.has(p.id));
  return available.length > 0 ? shuffled(available)[0]!.nickname : "qualcuno di speciale";
}

function resetMission(s: RisateState): RisateState {
  return {
    ...s,
    bookings: [], publicChoiceOptions: [], publicChoice: null,
    votingOpen: false, votes: {}, missionStartedAt: null,
    missionResult: null, lastFlash: null,
    questionIndex: 0, errorCount: 0, validations: [],
    currentPoseId: null, poseChangesUsed: 0,
    repeatVoteCount: 0, repeatTriggered: false,
    repeatRequestsUsed: 0,
    foundConfirmations: {},
    cambioStileVoteCount: 0, cambioStileTriggered: false,
    publicEvents: [], loveTarget: null,
    bookingStartedAt: null, publicChoiceStartedAt: null, perPlayerChoices: [],
    votingStartedAt: null, votingEndsAt: null,
    ambulanteProducts: [],
    poliglottaStep: null, poliglottaLanguage: null,
    poliglottaSubmittedPhrases: [], poliglottaTranslations: [], poliglottaPhraseIndex: 0,
    oggettoTargets: [], oggettoValidationCounts: {}, oggettoFound: [],
  };
}

/* ─── Factory ─────────────────────────────────────────────────────────────── */
export function createBlankRisateState(
  teams: RisateTeam[],
  players: RisatePlayer[],
): RisateState {
  return {
    version: 2, status: "idle",
    missionIndex: -1, phase: "mission_intro",
    teams, players,
    bookings: [], publicChoiceOptions: [], publicChoice: null,
    votingOpen: false, votes: {}, missionStartedAt: null,
    lastFlash: null, missionResult: null,
    questionIndex: 0, errorCount: 0, validations: [],
    currentPoseId: null, poseChangesUsed: 0,
    repeatVoteCount: 0, repeatTriggered: false,
    repeatRequestsUsed: 0,
    foundConfirmations: {},
    cambioStileVoteCount: 0, cambioStileTriggered: false,
    publicEvents: [], loveTarget: null,
    bookingStartedAt: null, publicChoiceStartedAt: null, perPlayerChoices: [],
    usedTongueTwisters: [],
    votingStartedAt: null, votingEndsAt: null,
    ambulanteProducts: [],
    poliglottaStep: null, poliglottaLanguage: null,
    poliglottaSubmittedPhrases: [], poliglottaTranslations: [], poliglottaPhraseIndex: 0,
    oggettoTargets: [], oggettoValidationCounts: {}, oggettoFound: [],
  };
}

/* ─── Score calculation ───────────────────────────────────────────────────── */
export function calculateMissionScores(state: RisateState): RisateMissionResult {
  const mission = RISATE_MISSIONS[state.missionIndex];
  if (!mission) return { text: "—", scores: [] };

  switch (mission.scoringType) {
    case "star_vote": {
      const scores = state.bookings.map(b => {
        const vs = state.votes[b.playerId] ?? [];
        const avg = vs.length > 0 ? vs.reduce((a, v) => a + v.score, 0) / vs.length : 0;
        return { playerId: b.playerId, nickname: b.nickname, teamId: b.teamId, pts: Math.round(avg) * 20 };
      });
      return {
        text: scores.length > 0 ? scores.map(s => `${s.nickname}: ${s.pts}pt`).join(" | ") : "Nessun voto",
        scores,
      };
    }

    case "journalist": {
      const [contestant, journalist] = state.bookings;
      if (!contestant || !journalist) return { text: "Mancano i giocatori", scores: [] };
      return state.errorCount < 2
        ? { text: `🏆 ${contestant.nickname} ha resistito! +200 pt`, scores: [{ playerId: contestant.playerId, nickname: contestant.nickname, teamId: contestant.teamId, pts: 200 }] }
        : { text: `🎙️ ${journalist.nickname} ha incastrato ${contestant.nickname}! +100 pt`, scores: [{ playerId: journalist.playerId, nickname: journalist.nickname, teamId: journalist.teamId, pts: 100 }] };
    }

    case "head2head": {
      const counts: Record<string, number> = {};
      for (const b of state.bookings) counts[b.playerId] = (state.votes[b.playerId] ?? []).length;
      const sorted = state.bookings.slice().sort((a, b) => (counts[b.playerId] ?? 0) - (counts[a.playerId] ?? 0));
      const winner = sorted[0];
      if (!winner) return { text: "Nessun voto", scores: [] };
      return {
        text: `💃 Vince ${winner.nickname}! (${counts[winner.playerId] ?? 0} voti) +200 pt`,
        scores: [{ playerId: winner.playerId, nickname: winner.nickname, teamId: winner.teamId, pts: 200 }],
      };
    }

    case "first_found": {
      // Part 6: trova oggetto — score per found target
      if (mission.id === "oggetto" && state.oggettoTargets && state.oggettoTargets.length > 0) {
        const foundCount = (state.oggettoFound ?? []).filter(Boolean).length;
        const pts = foundCount * 100;
        const scores = state.bookings.map(b => ({
          playerId: b.playerId, nickname: b.nickname, teamId: b.teamId, pts,
        }));
        const foundLabels = (state.oggettoTargets ?? [])
          .filter((_, i) => (state.oggettoFound ?? [])[i])
          .join(", ");
        return {
          text: foundCount > 0
            ? `🔍 Trovati ${foundCount}/${state.oggettoTargets.length}! ${foundLabels} — +${pts}pt`
            : "😅 Nessun oggetto trovato in tempo!",
          scores,
        };
      }
      // Legacy: first_found logic
      let winner: RisateBooking | null = null;
      let best = { count: 0, ts: Infinity };
      for (const b of state.bookings) {
        const info = state.foundConfirmations[b.playerId];
        if (!info) continue;
        if (info.count > best.count || (info.count === best.count && info.firstTs < best.ts)) {
          winner = b; best = { count: info.count, ts: info.firstTs };
        }
      }
      if (!winner || best.count === 0) return { text: "😅 Nessuno ha trovato in tempo!", scores: [] };
      return {
        text: `🔍 ${winner.nickname} ha trovato per primo! +200 pt`,
        scores: [{ playerId: winner.playerId, nickname: winner.nickname, teamId: winner.teamId, pts: 200 }],
      };
    }
  }
}

/* ─── Phase machine ───────────────────────────────────────────────────────── */
export interface AdvanceResult {
  state: RisateState;
  scores: { teamId: string; pts: number; round: number }[];
}

export function advancePhase(state: RisateState): AdvanceResult {
  const mission = state.missionIndex >= 0 ? RISATE_MISSIONS[state.missionIndex] : null;
  let s = { ...state };
  let scores: { teamId: string; pts: number; round: number }[] = [];

  /* Not started → first mission */
  if (s.missionIndex === -1) {
    s = resetMission(s);
    s.missionIndex = 0;
    s.phase = "mission_intro";
    s.status = "running";
    s.lastFlash = { text: `🎯 Missione 1/10: ${RISATE_MISSIONS[0]!.title}`, type: "step" };
    return { state: s, scores };
  }

  if (!mission) return { state, scores };

  switch (s.phase) {
    case "mission_intro":
      s.phase = "booking";
      s.bookings = [];
      s.bookingStartedAt = new Date().toISOString();
      s.lastFlash = { text: "🙋 Prenota il tuo posto!", type: "step" };
      break;

    case "booking":
      if (mission.phases.includes("public_choice")) {
        s.phase = "public_choice";
        const choiceResult = buildChoiceOptions(s);
        s.publicChoiceOptions = choiceResult.options;
        if (choiceResult.usedTongueTwisters) s.usedTongueTwisters = choiceResult.usedTongueTwisters;
        s.publicChoice = null;
        s.publicChoiceStartedAt = new Date().toISOString();

        // Mission-specific init for public_choice
        if (mission.id === "venditore") {
          // Part 4: pre-select 5 random products
          s.ambulanteProducts = shuffled(s.publicChoiceOptions).slice(0, 5);
          s.perPlayerChoices = [];
        } else if (mission.perPlayerChoice) {
          // sfilata: per-player single choice
          const preOpts = shuffled(s.publicChoiceOptions);
          s.perPlayerChoices = preOpts.slice(0, mission.playerCount);
          s.ambulanteProducts = [];
        } else {
          s.perPlayerChoices = [];
          s.ambulanteProducts = [];
        }

        // Part 6: trova oggetto — pre-select 3 targets
        if (mission.id === "oggetto") {
          s.oggettoTargets = shuffled(s.publicChoiceOptions).slice(0, OGGETTO_TARGET_COUNT);
          s.oggettoValidationCounts = {};
          s.oggettoFound = [false, false, false];
        }

        // Part 5: poliglotta — start with language selection step
        if (mission.id === "poliglotta") {
          s.poliglottaStep = "language";
          s.poliglottaLanguage = null;
          s.poliglottaSubmittedPhrases = [];
          s.poliglottaTranslations = [];
          s.poliglottaPhraseIndex = 0;
        }

        s.lastFlash = { text: mission.choiceLabel ?? "Scegli!", type: "step" };
      } else {
        s = startActive(s, mission.id);
      }
      break;

    case "public_choice":
      s = startActive(s, mission.id);
      // yoga: resolve pose from choice
      if (mission.id === "yoga" && s.publicChoice) {
        const pose = YOGA_POSES.find(p => s.publicChoice!.includes(p.name));
        s.currentPoseId = pose?.id ?? null;
      }
      break;

    case "active":
      if (mission.phases.includes("voting")) {
        // Part 3: server-authoritative voting timer (10s)
        const now = new Date();
        s.phase = "voting";
        s.votingOpen = true;
        s.votes = {};
        s.votingStartedAt = now.toISOString();
        s.votingEndsAt = new Date(now.getTime() + VOTING_DURATION_MS).toISOString();
        s.lastFlash = { text: "⭐ Vota adesso! 10 secondi!", type: "step" };
      } else {
        const fr1 = finalizeResult(s, scores); s = fr1.s; scores = fr1.scores;
      }
      break;

    case "voting":
      // Part 3: clear timer on close
      s.votingStartedAt = null;
      s.votingEndsAt = null;
      { const fr2 = finalizeResult(s, scores); s = fr2.s; scores = fr2.scores; }
      break;

    case "result":
      if (s.missionIndex < 9) {
        s = resetMission(s);
        s.missionIndex = state.missionIndex + 1;
        s.phase = "mission_intro";
        s.lastFlash = {
          text: `🎯 Missione ${s.missionIndex + 1}/10: ${RISATE_MISSIONS[s.missionIndex]!.title}`,
          type: "step",
        };
      } else {
        s.status = "ended";
        s.lastFlash = { text: "🏆 Fine Percorso a Risate!", type: "end" };
      }
      break;
  }

  return { state: s, scores };
}

function startActive(s: RisateState, missionId: string): RisateState {
  const r = {
    ...s,
    phase: "active" as const,
    missionStartedAt: new Date().toISOString(),
    questionIndex: 0, errorCount: 0, validations: [],
    foundConfirmations: {}, publicEvents: [],
    repeatVoteCount: 0, repeatTriggered: false, repeatRequestsUsed: 0,
    cambioStileVoteCount: 0, cambioStileTriggered: false,
    lastFlash: { text: `🚀 Via!`, type: "step" },
  };
  if (missionId === "amore") r.loveTarget = pickLoveTarget(r);
  return r;
}

function finalizeResult(
  s: RisateState,
  scores: { teamId: string; pts: number; round: number }[],
): { s: RisateState; scores: typeof scores } {
  const result = calculateMissionScores(s);
  s = { ...s, phase: "result", votingOpen: false, missionResult: result, votingStartedAt: null, votingEndsAt: null };
  for (const sc of result.scores) {
    if (sc.pts > 0) {
      const ti = s.teams.findIndex(t => t.id === sc.teamId);
      if (ti >= 0) s.teams = s.teams.map((t, i) => i === ti ? { ...t, score: t.score + sc.pts } : t);
      scores.push({ teamId: sc.teamId, pts: sc.pts, round: s.missionIndex + 1 });
    }
  }
  s.lastFlash = { text: result.text, type: "score" };
  return { s, scores };
}

/* ─── Booking ─────────────────────────────────────────────────────────────── */
export function applyBooking(
  state: RisateState,
  playerId: string, nickname: string, teamId: string,
): { state: RisateState; error?: string } {
  if (state.phase !== "booking") return { state, error: "Non è la fase di prenotazione" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (!m) return { state, error: "Missione non trovata" };
  if (state.bookings.length >= m.playerCount) return { state, error: "Posti esauriti" };
  if (state.bookings.some(b => b.playerId === playerId)) return { state, error: "Già prenotato" };
  const role = m.roles[state.bookings.length] ?? "Performer";
  return { state: { ...state, bookings: [...state.bookings, { playerId, nickname, role, teamId }] } };
}

/* ─── Auto-book ────────────────────────────────────────────────────────────── */
export function applyAutoBook(
  state: RisateState,
): { state: RisateState; error?: string } {
  if (state.phase !== "booking") return { state, error: "Non è la fase di prenotazione" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (!m) return { state, error: "Missione non trovata" };

  const bookedIds = new Set(state.bookings.map(b => b.playerId));
  const available = shuffled(state.players.filter(p => !bookedIds.has(p.id)));

  if (state.bookings.length + available.length < m.playerCount) {
    return { state, error: "Servono almeno 2 giocatori per procedere" };
  }

  let s = { ...state, bookings: [...state.bookings] };
  let ai = 0;
  while (s.bookings.length < m.playerCount && ai < available.length) {
    const p = available[ai++]!;
    const role = m.roles[s.bookings.length] ?? "Performer";
    s = { ...s, bookings: [...s.bookings, { playerId: p.id, nickname: p.nickname, role, teamId: p.teamId }] };
  }
  return { state: s };
}

/* ─── Auto-choice ──────────────────────────────────────────────────────────── */
export function applyAutoChoice(
  state: RisateState,
): { state: RisateState; error?: string } {
  if (state.phase !== "public_choice") return { state, error: "Non è la fase di scelta pubblica" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (!m) return { state, error: "Missione non trovata" };
  const opts = state.publicChoiceOptions;
  if (opts.length === 0) return { state, error: "Nessuna opzione disponibile" };

  if (m.id === "venditore") {
    // If ambulanteProducts not yet filled, pick 5 random
    if ((state.ambulanteProducts ?? []).length < 5) {
      const filled = shuffled(opts).slice(0, 5);
      return { state: { ...state, ambulanteProducts: filled } };
    }
    return { state };
  }

  if (m.id === "oggetto") {
    // If oggettoTargets not yet set, pick 3 random
    if ((state.oggettoTargets ?? []).length < OGGETTO_TARGET_COUNT) {
      const targets = shuffled(opts).slice(0, OGGETTO_TARGET_COUNT);
      return { state: { ...state, oggettoTargets: targets, oggettoFound: [false, false, false] } };
    }
    return { state };
  }

  if (m.perPlayerChoice) {
    const shuffledOpts = shuffled(opts);
    const choices: string[] = [];
    for (let i = 0; i < m.playerCount; i++) {
      const current = state.perPlayerChoices[i];
      if (current) {
        choices.push(current);
      } else {
        const unused = shuffledOpts.find(o => !choices.includes(o));
        choices.push(unused ?? shuffledOpts[i % shuffledOpts.length]!);
      }
    }
    return { state: { ...state, perPlayerChoices: choices, publicChoice: choices[0] ?? null } };
  }

  const choice = state.publicChoice ?? shuffled(opts)[0]!;
  return { state: { ...state, publicChoice: choice } };
}

/* ─── Per-player choice (sfilata etc.) ──────────────────────────────────────── */
export function applyPerPlayerChoice(
  state: RisateState, choice: string, slot: number,
): { state: RisateState; error?: string } {
  if (state.phase !== "public_choice") return { state, error: "Non è la fase di scelta pubblica" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (!m?.perPlayerChoice || m.id === "venditore") return { state, error: "Non è una missione con scelta per giocatore" };
  if (!state.publicChoiceOptions.includes(choice)) return { state, error: "Scelta non valida" };
  if (slot < 0 || slot >= m.playerCount) return { state, error: "Slot non valido" };

  const newChoices = [...(state.perPlayerChoices.length >= m.playerCount ? state.perPlayerChoices : Array(m.playerCount).fill(''))];
  newChoices[slot] = choice;
  return { state: { ...state, perPlayerChoices: newChoices, publicChoice: newChoices[0] ?? null } };
}

/* ─── Part 4: Ambulante multi-product toggle ─────────────────────────────── */
export function applyAmbulanteToggle(
  state: RisateState, product: string,
): { state: RisateState; error?: string } {
  if (state.phase !== "public_choice") return { state, error: "Non è la fase di scelta pubblica" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (m?.id !== "venditore") return { state, error: "Non è la missione venditore" };
  if (!state.publicChoiceOptions.includes(product)) return { state, error: "Prodotto non valido" };

  const current = state.ambulanteProducts ?? [];
  const idx = current.indexOf(product);
  if (idx >= 0) {
    return { state: { ...state, ambulanteProducts: current.filter(p => p !== product) } };
  } else if (current.length < 5) {
    return { state: { ...state, ambulanteProducts: [...current, product] } };
  }
  return { state }; // Already 5, ignore
}

/* ─── Part 6: Trova oggetto target toggle ────────────────────────────────── */
export function applyOggettoTargetToggle(
  state: RisateState, target: string,
): { state: RisateState; error?: string } {
  if (state.phase !== "public_choice") return { state, error: "Non è la fase di scelta pubblica" };
  const m = RISATE_MISSIONS[state.missionIndex];
  if (m?.id !== "oggetto") return { state, error: "Non è la missione trova oggetto" };
  if (!state.publicChoiceOptions.includes(target)) return { state, error: "Bersaglio non valido" };

  const current = state.oggettoTargets ?? [];
  const idx = current.indexOf(target);
  if (idx >= 0) {
    const newTargets = current.filter(t => t !== target);
    return { state: { ...state, oggettoTargets: newTargets, oggettoFound: newTargets.map(() => false) } };
  } else if (current.length < OGGETTO_TARGET_COUNT) {
    const newTargets = [...current, target];
    return { state: { ...state, oggettoTargets: newTargets, oggettoFound: newTargets.map(() => false) } };
  }
  return { state }; // Already 3, ignore
}

/* ─── Public choice ───────────────────────────────────────────────────────── */
export function applyPublicChoice(
  state: RisateState, choice: string,
): { state: RisateState; error?: string } {
  if (state.phase !== "public_choice") return { state, error: "Non è la fase di scelta pubblica" };
  if (!state.publicChoiceOptions.includes(choice)) return { state, error: "Scelta non valida" };

  // Part 5: for poliglotta, language selection auto-advances to phrase_input
  const m = RISATE_MISSIONS[state.missionIndex];
  if (m?.id === "poliglotta") {
    return { state: { ...state, publicChoice: choice, poliglottaLanguage: choice, poliglottaStep: "phrase_input" } };
  }

  return { state: { ...state, publicChoice: choice } };
}

/* ─── Vote ────────────────────────────────────────────────────────────────── */
export function applyVote(
  state: RisateState,
  playerId: string, score: number, voterId: string,
): { state: RisateState; error?: string } {
  if (!state.votingOpen) return { state, error: "Votazione non aperta" };
  if (!state.bookings.some(b => b.playerId === playerId)) return { state, error: "Giocatore non in gara" };
  const s = Math.min(5, Math.max(1, Math.round(score)));
  const existing = state.votes[playerId] ?? [];
  const idx = existing.findIndex(e => e.voterId === voterId);
  const entries = idx >= 0
    ? existing.map((e, i) => i === idx ? { ...e, score: s } : e)
    : [...existing, { voterId, score: s }];
  return { state: { ...state, votes: { ...state.votes, [playerId]: entries } } };
}

/* ─── Generic public action ───────────────────────────────────────────────── */
export interface ActionResult {
  state: RisateState;
  error?: string;
  autoAdvance?: boolean;
}

export function applyPublicAction(
  state: RisateState,
  action: string,
  playerId: string,
  nickname: string,
  opts: { targetPlayerId?: string; emoji?: string; targetIndex?: number } = {},
): ActionResult {
  switch (action) {
    case "validate": {
      if (state.phase !== "active") return { state, error: "Non è la fase attiva" };
      if (state.validations.some(v => v.playerId === playerId)) return { state };
      const vs = [...state.validations, { playerId, nickname, ts: Date.now() }];
      let s: RisateState = { ...state, validations: vs };
      if (vs.length >= VALIDATE_THRESHOLD) {
        const err = s.errorCount + 1;
        s = {
          ...s, errorCount: err, validations: [],
          lastFlash: { text: `💥 ERRORE! (${err}/2)`, type: "event" },
          publicEvents: [{ emoji: "💥", nickname: "Il pubblico", ts: Date.now() }, ...s.publicEvents.slice(0, 19)],
        };
        if (err >= 2) {
          s.lastFlash = { text: '❌ Ha detto "sì" 2 volte! Missione fallita!', type: "event" };
          return { state: s, autoAdvance: true };
        }
      }
      return { state: s };
    }

    case "next_question": {
      if (state.phase !== "active") return { state, error: "Non è la fase attiva" };
      if (!state.bookings.some(b => b.playerId === playerId && b.role === "Giornalista")) {
        return { state, error: "Solo il giornalista può avanzare" };
      }
      const mission = RISATE_MISSIONS[state.missionIndex];
      const qs = mission?.questions ?? [];
      const next = state.questionIndex + 1;
      if (next >= qs.length) {
        return {
          state: { ...state, questionIndex: next, validations: [], lastFlash: { text: "✅ 10 domande superate! Bravo concorrente!", type: "event" } },
          autoAdvance: true,
        };
      }
      return { state: { ...state, questionIndex: next, validations: [], lastFlash: { text: `❓ Domanda ${next + 1}/10`, type: "step" } } };
    }

    case "react": {
      if (state.phase !== "active") return { state };
      const ev = opts.emoji ?? "😂";
      return { state: { ...state, publicEvents: [{ emoji: ev, nickname, ts: Date.now() }, ...state.publicEvents.slice(0, 19)] } };
    }

    case "found": {
      if (state.phase !== "active") return { state, error: "Non è la fase attiva" };
      const tid = opts.targetPlayerId;
      if (!tid) return { state, error: "targetPlayerId richiesto" };
      if (!state.bookings.some(b => b.playerId === tid)) return { state, error: "Giocatore non in gara" };
      const info = state.foundConfirmations[tid] ?? { count: 0, firstTs: Date.now(), nickname: tid };
      const newInfo = { ...info, count: info.count + 1, firstTs: info.count === 0 ? Date.now() : info.firstTs };
      const newFC = { ...state.foundConfirmations, [tid]: newInfo };
      return { state: { ...state, foundConfirmations: newFC }, autoAdvance: newInfo.count >= FOUND_THRESHOLD };
    }

    case "oggetto_validate": {
      // Part 6: validate one specific oggetto target
      if (state.phase !== "active") return { state, error: "Non è la fase attiva" };
      const idx = opts.targetIndex ?? -1;
      if (idx < 0 || !state.oggettoTargets?.[idx]) return { state, error: "Target non valido" };
      if (state.oggettoFound?.[idx]) return { state }; // Already found

      const counts = { ...(state.oggettoValidationCounts ?? {}) };
      const key = String(idx);
      counts[key] = (counts[key] ?? 0) + 1;

      const found = [...(state.oggettoFound ?? [false, false, false])];
      if ((counts[key] ?? 0) >= FOUND_THRESHOLD) found[idx] = true;

      const allFound = state.oggettoTargets.every((_, i) => found[i]);
      const foundTarget = state.oggettoTargets[idx]!;
      const newState: RisateState = {
        ...state,
        oggettoValidationCounts: counts,
        oggettoFound: found,
        lastFlash: found[idx]
          ? { text: `✅ Trovato: ${foundTarget}!`, type: "event" }
          : state.lastFlash,
        publicEvents: found[idx]
          ? [{ emoji: "✅", nickname: "Il pubblico", ts: Date.now() }, ...state.publicEvents.slice(0, 19)]
          : state.publicEvents,
      };
      return { state: newState, autoAdvance: allFound };
    }

    case "ripetilo": {
      // Part 2: counter-based (max 3 per mission), each tap triggers overlay
      if (state.phase !== "active") return { state };
      const used = state.repeatRequestsUsed ?? 0;
      if (used >= REPEAT_MAX) return { state }; // Disabled
      const newUsed = used + 1;
      return {
        state: {
          ...state,
          repeatRequestsUsed: newUsed,
          repeatVoteCount: state.repeatVoteCount + 1,
          repeatTriggered: true,
          lastFlash: { text: `🔁 RIPETILO! (${newUsed}/${REPEAT_MAX})`, type: "event" },
          publicEvents: [{ emoji: "🔁", nickname: nickname || "Il pubblico", ts: Date.now() }, ...state.publicEvents.slice(0, 19)],
        },
      };
    }

    case "cambio_stile": {
      if (state.phase !== "active") return { state };
      const cnt = state.cambioStileVoteCount + 1;
      const triggered = !state.cambioStileTriggered && cnt >= CAMBIO_STILE_THRESHOLD;
      return {
        state: {
          ...state, cambioStileVoteCount: cnt,
          cambioStileTriggered: state.cambioStileTriggered || triggered,
          lastFlash: triggered ? { text: "🔀 CAMBIO STILE!", type: "event" } : state.lastFlash,
          publicEvents: triggered ? [{ emoji: "🔀", nickname: "Il pubblico", ts: Date.now() }, ...state.publicEvents.slice(0, 19)] : state.publicEvents,
        },
      };
    }

    default:
      return { state, error: `Azione sconosciuta: ${action}` };
  }
}

/* ─── Yoga pose change ────────────────────────────────────────────────────── */
export function applyPoseChange(
  state: RisateState, newChoice: string,
): { state: RisateState; error?: string } {
  if (state.poseChangesUsed >= 5) return { state, error: "Massimo 5 cambi posa" };
  if (!state.publicChoiceOptions.includes(newChoice)) {
    return {
      state: {
        ...state,
        publicChoice: newChoice,
        poseChangesUsed: state.poseChangesUsed + 1,
        publicChoiceOptions: [...state.publicChoiceOptions, newChoice],
      },
    };
  }
  return { state: { ...state, publicChoice: newChoice, poseChangesUsed: state.poseChangesUsed + 1 } };
}

/* ─── Language phrase lookup ──────────────────────────────────────────────── */
export function getLangPhrase(choice: string | null): string | null {
  if (!choice) return null;
  return LANGUAGE_PHRASES[choice] ?? null;
}
