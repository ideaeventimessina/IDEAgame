/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Lockdown BoardGame v1 — Shared Engine ─────────────────────────────────
   Pure logic over LockdownState: no DB, no Express. The home-mode route
   (home-lockdown.ts) imports this and only differs in WHERE it stores/emits
   the state (home_sessions.gameConfig.lockdownState), exactly like the
   Percorso a Risate engine.  Every function returns a NEW state (immutable).
──────────────────────────────────────────────────────────────────────────── */

import type {
  LockdownState, LockdownPlayerState, LockdownRoom,
  LockdownDpcm, LockdownMulta, LockdownContent,
} from "@workspace/db";
import { LOCKDOWN_CONTENT } from "./lockdown-content.js";

export { LOCKDOWN_CONTENT };

/* ─── Constants ───────────────────────────────────────────────────────────── */
export const START_LOCKEURO   = 500;
export const START_LOCKEURO_VIP = 1000;   // startBonus (Figlio di Papà)
export const MASTER_WIN_AT     = 1500;    // soglia vittoria Master + Spia (riequilibrata)
export const SPY_RAID_RATE     = 0.2;     // 20% del saldo di ogni giocatore dirottato al Master

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function shuffled<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }
function pickOne<T>(arr: T[]): T | undefined { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined; }
function pickN<T>(arr: T[], n: number): T[] { return shuffled(arr).slice(0, n); }

type QuizBankEntry = { question: string; answers: string[]; correctIndex: number };

/** Costruisce la sfida corrente a partire dal tipo/banco della stanza. */
function buildChallenge(room: LockdownRoom): NonNullable<LockdownState["currentChallenge"]> {
  const b: LockdownContent["banks"] = LOCKDOWN_CONTENT.banks;
  const base = { prompt: room.description, submissions: {} as Record<string, unknown> };

  switch (room.type) {
    case "quiz":
    case "adult_quiz": {
      const bankName = room.deckKey ?? (room.type === "adult_quiz" ? "sesso" : "culturaGenerale");
      const bank = ((b as Record<string, unknown>)[bankName] as QuizBankEntry[] | undefined) ?? b.culturaGenerale;
      const q = pickOne(bank);
      return q
        ? { ...base, prompt: q.question, options: q.answers, correctIndex: q.correctIndex }
        : (base as NonNullable<LockdownState["currentChallenge"]>);
    }
    case "recipes": {
      const ing = pickOne(b.ingredienti);
      return { ...base, ingredient: ing ?? "" };
    }
    case "charades": {
      const film = pickOne(b.film);
      return { ...base, answer: film ?? "" };
    }
    case "song_word": {
      const word = pickOne(b.paroleCanzoni);
      return { ...base, words: word ? [word] : [] };
    }
    case "story": {
      return { ...base, words: pickN(b.creaStoria, 3) };
    }
    case "objects": {
      const o = pickOne(b.oggettiStudio);
      return o ? { ...base, imageUrl: o.image, answer: o.answer } : (base as NonNullable<LockdownState["currentChallenge"]>);
    }
    case "lies": {
      const q = pickOne(b.bugie);
      return { ...base, prompt: q ?? room.description };
    }
    case "dice_bet":
    default:
      return base as NonNullable<LockdownState["currentChallenge"]>;
  }
}

/* ─── Factory ─────────────────────────────────────────────────────────────── */
export interface LockdownPlayerInput { id: string; nickname: string; avatarColor?: string }

export function createLockdownState(players: LockdownPlayerInput[]): LockdownState {
  const roster = players ?? [];
  // Assegna un personaggio casuale e distinto (finché il mazzo lo consente),
  // escluso il MASTER (che è il conduttore, non un giocatore).
  const pool = shuffled(LOCKDOWN_CONTENT.characters.filter(c => c.id !== "master"));

  const lockPlayers: LockdownPlayerState[] = roster.map((p, i) => {
    const character = pool.length ? pool[i % pool.length]! : null;
    const lockEuro = character?.startBonus ?? START_LOCKEURO;
    return {
      id: p.id,
      nickname: p.nickname,
      avatarColor: p.avatarColor ?? "#F5B642",
      characterId: character?.id ?? null,
      lockEuro,
      eliminated: false,     // ANTI-ELIMINAZIONE: sempre false, nessuno esce mai
      isBroke: lockEuro <= 0, // "in rosso" ma ancora in gioco
      accuseUsed: false,
      characterUsed: false,
    };
  });

  // Una spia segreta scelta a caso fra i giocatori.
  const spy = pickOne(lockPlayers);

  return {
    version: 1,
    status: "running",
    phase: "roles",
    players: lockPlayers,
    masterBalance: 0,
    spyPlayerId: spy?.id ?? null,
    roomIndex: 0,
    currentRoomId: null,
    currentChallenge: null,
    dpcm: null,
    lastMulta: null,
    lastFlash: { text: "🔒 Lockdown BoardGame — Assegnazione ruoli", type: "roles" },
    mode: "normal",
    endsAt: null,
    masterWinAt: MASTER_WIN_AT,
    winnerId: null,
    spyRevealed: false,
    votes: {},
    spyPowerUsed: false,
  };
}

/* ─── Room progression ────────────────────────────────────────────────────── */
/** Avanza alla stanza successiva (la prima volta usa roomIndex così com'è),
 *  imposta currentRoomId e costruisce la sfida. Fase → room_intro. */
export function enterRoom(state: LockdownState): LockdownState {
  const rooms = LOCKDOWN_CONTENT.rooms;
  const nextIndex = state.currentRoomId === null ? state.roomIndex : state.roomIndex + 1;
  const room = rooms[nextIndex];
  if (!room) {
    // Stanze finite → risolvi la vittoria.
    return checkWin({ ...state, phase: "result" });
  }
  return {
    ...state,
    roomIndex: nextIndex,
    currentRoomId: room.id,
    currentChallenge: buildChallenge(room),
    dpcm: null,
    lastMulta: null,
    phase: "room_intro",
    endsAt: null,
    lastFlash: { text: `${room.emoji} ${room.name}`, type: "room_intro" },
  };
}

/* ─── Economy ─────────────────────────────────────────────────────────────── */
/** Aggiunge/sottrae Lock-Euro. Se amount<0 il denaro tolto va al Master, ma SOLO
 *  quanto è stato realmente sottratto (mai più di quanto il giocatore aveva).
 *  ANTI-ELIMINAZIONE: il saldo si ferma a 0 (isBroke=true), nessuno viene eliminato. */
export function applyAward(state: LockdownState, playerId: string, amount: number): LockdownState {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return state;

  const raw = player.lockEuro + amount;
  const newBal = Math.max(0, raw);
  // Solo il denaro effettivamente tolto al giocatore va al Master (non di più).
  const removed = amount < 0 ? player.lockEuro - newBal : 0;

  const players = state.players.map(p =>
    p.id === playerId ? { ...p, lockEuro: newBal, isBroke: newBal === 0, eliminated: false } : p,
  );
  const masterBalance = state.masterBalance + removed;

  return {
    ...state,
    players,
    masterBalance,
    lastFlash: {
      text: amount >= 0
        ? `💶 ${player.nickname} +${amount} Lock-Euro`
        : `💸 ${player.nickname} -${Math.abs(amount)} Lock-Euro`,
      type: "award",
    },
  };
}

/** Applica una Multa: se ha un importo, viene tolto al giocatore (→ Master). */
export function applyMulta(state: LockdownState, playerId: string, multa: LockdownMulta): LockdownState {
  const amount = multa.amount ?? 0;
  const afterAward = amount > 0 ? applyAward(state, playerId, -amount) : state;
  const player = state.players.find(p => p.id === playerId);
  return {
    ...afterAward,
    lastMulta: multa,
    lastFlash: { text: `🚨 ${player?.nickname ?? "Giocatore"}: ${multa.text}`, type: "multa" },
  };
}

/** Pesca un DPCM casuale e passa alla fase dpcm. */
export function drawDpcm(state: LockdownState): LockdownState {
  const dpcm: LockdownDpcm | null = pickOne(LOCKDOWN_CONTENT.dpcm) ?? null;
  return {
    ...state,
    dpcm,
    phase: "dpcm",
    lastFlash: { text: dpcm ? `📜 DPCM: ${dpcm.text}` : "📜 DPCM", type: "dpcm" },
  };
}

/* ─── Accusa spia ─────────────────────────────────────────────────────────── */
/** ACCUSA APERTA A TUTTI: qualunque giocatore può accusare un sospetto, 1 sola volta.
 *  Giusto  → l'accusatore incassa il gruzzolo del Master, spia rivelata, Master a 0.
 *  Sbagliato → l'accusatore paga metà dei suoi Lock-Euro al Master. */
export function accuseSpy(state: LockdownState, accuserId: string, suspectId: string): LockdownState {
  const accuser = state.players.find(p => p.id === accuserId);
  if (!accuser) return state;
  if (accuser.accuseUsed) return state; // ogni giocatore può accusare una sola volta

  const correct = state.spyPlayerId != null && state.spyPlayerId === suspectId;

  if (correct) {
    const reward = state.masterBalance;
    const players = state.players.map(p =>
      p.id === accuserId
        ? { ...p, lockEuro: p.lockEuro + reward, isBroke: p.lockEuro + reward === 0, accuseUsed: true }
        : p,
    );
    return {
      ...state,
      players,
      masterBalance: 0,
      spyRevealed: true,
      phase: "accuse",
      lastFlash: { text: `🕵️ ${accuser.nickname} ha smascherato la spia! +${reward} Lock-Euro`, type: "accuse" },
    };
  }

  const half = Math.floor(accuser.lockEuro / 2);
  const players = state.players.map(p =>
    p.id === accuserId
      ? { ...p, lockEuro: p.lockEuro - half, isBroke: p.lockEuro - half === 0, accuseUsed: true }
      : p,
  );
  return {
    ...state,
    players,
    masterBalance: state.masterBalance + half,
    phase: "accuse",
    lastFlash: { text: `❌ ${accuser.nickname} ha accusato male! -${half} Lock-Euro al Master`, type: "accuse" },
  };
}

/* ─── Sfide OGGETTIVE (auto-risolte dall'app) ───────────────────────────────
   L'app conosce la risposta giusta → niente giudizio del Master: assegna il
   premio a chi ha risposto correttamente. Vale per le stanze con subjective=false
   (quiz, adult_quiz, objects). */
export function resolveObjective(state: LockdownState): LockdownState {
  const room: LockdownRoom | undefined = LOCKDOWN_CONTENT.rooms.find(r => r.id === state.currentRoomId);
  if (!room || room.subjective) return state; // solo sfide oggettive
  const challenge = state.currentChallenge;
  if (!challenge) return state;

  const submissions = (challenge["submissions"] as Record<string, { answerIndex?: number; text?: string }> | undefined) ?? {};
  const correctIndex = challenge.correctIndex;
  const rawAnswer = typeof challenge["answer"] === "string" ? (challenge["answer"] as string) : undefined;
  const answerNorm = rawAnswer?.trim().toLowerCase();

  let next = state;
  let winners = 0;
  for (const player of state.players) {
    const sub = submissions[player.id];
    if (!sub) continue;
    let correct = false;
    if (typeof correctIndex === "number") {
      correct = sub.answerIndex === correctIndex;
    } else if (answerNorm != null) {
      correct = typeof sub.text === "string" && sub.text.trim().toLowerCase() === answerNorm;
    }
    if (correct) {
      next = applyAward(next, player.id, room.prize);
      winners++;
    }
  }

  next = {
    ...next,
    phase: "result",
    endsAt: null,
    lastFlash: { text: `✅ Sfida risolta: ${winners} risposte esatte (+${room.prize} a testa)`, type: "result" },
  };
  return checkWin(next);
}

/* ─── Voto del pubblico (sfide a GIUDIZIO) ──────────────────────────────────
   Per le stanze subjective=true (ricette, mimo, storia, canto, bugie, dadi) il
   pubblico vota chi merita il premio. Un giocatore può cambiare voto; non può
   votare un non-giocatore. */
export function castVote(state: LockdownState, voterId: string, votedPlayerId: string): LockdownState {
  const voter = state.players.find(p => p.id === voterId);
  const voted = state.players.find(p => p.id === votedPlayerId);
  if (!voter || !voted) return state; // votante o votato inesistente

  const votes = { ...state.votes, [voterId]: votedPlayerId };
  return {
    ...state,
    votes,
    lastFlash: { text: `🗳️ ${voter.nickname} ha votato ${voted.nickname}`, type: "vote" },
  };
}

/** Scrutina i voti: il più votato incassa room.prize (in caso di parità si divide),
 *  poi svuota i voti, fase → result, checkWin. */
export function resolveVotes(state: LockdownState): LockdownState {
  const room: LockdownRoom | undefined = LOCKDOWN_CONTENT.rooms.find(r => r.id === state.currentRoomId);
  const prize = room?.prize ?? 0;

  const tally: Record<string, number> = {};
  for (const votedId of Object.values(state.votes)) {
    if (state.players.some(p => p.id === votedId)) {
      tally[votedId] = (tally[votedId] ?? 0) + 1;
    }
  }

  const maxVotes = Object.values(tally).reduce((m, v) => (v > m ? v : m), 0);
  const winners = Object.keys(tally).filter(id => tally[id] === maxVotes);

  let next = state;
  if (maxVotes > 0 && winners.length > 0) {
    const share = Math.floor(prize / winners.length);
    for (const id of winners) next = applyAward(next, id, share);
  }

  const winnerNames = winners
    .map(id => state.players.find(p => p.id === id)?.nickname)
    .filter((n): n is string => Boolean(n));

  next = {
    ...next,
    votes: {},
    phase: "result",
    endsAt: null,
    lastFlash: {
      text: winnerNames.length
        ? `🏅 Voto del pubblico: ${winnerNames.join(", ")} (+${winners.length ? Math.floor(prize / winners.length) : 0})`
        : "🗳️ Nessun voto valido",
      type: "result",
    },
  };
  return checkWin(next);
}

/* ─── Spia: sabotaggio segreto ──────────────────────────────────────────────
   Potere concreto della spia (1 sola volta): dirotta il 20% dei Lock-Euro di OGNI
   altro giocatore verso il Master, avvicinandolo alla vittoria. No-op se non è la
   spia o se l'ha già usato. */
export function spySabotage(state: LockdownState, spyId: string): LockdownState {
  if (state.spyPlayerId == null || spyId !== state.spyPlayerId) return state; // non è la spia
  if (state.spyPowerUsed) return state; // già usato

  let raided = 0;
  const players = state.players.map(p => {
    if (p.id === state.spyPlayerId) return p; // la spia non si autosabota
    const taken = Math.round(p.lockEuro * SPY_RAID_RATE);
    if (taken <= 0) return p;
    const newBal = Math.max(0, p.lockEuro - taken);
    raided += p.lockEuro - newBal;
    return { ...p, lockEuro: newBal, isBroke: newBal === 0, eliminated: false };
  });

  const next: LockdownState = {
    ...state,
    players,
    masterBalance: state.masterBalance + raided,
    spyPowerUsed: true,
    lastFlash: { text: `🕵️ Sabotaggio della spia! ${raided} Lock-Euro dirottati al Master`, type: "spy" },
  };
  return checkWin(next);
}

/* ─── Win check ───────────────────────────────────────────────────────────── */
/** Determina se la partita è finita e chi ha vinto. ANTI-ELIMINAZIONE: la partita
 *  non finisce MAI perché qualcuno è a 0 — nessuno viene rimosso.
 *  - masterBalance >= masterWinAt → vincono Spia + Master (winnerId = spia).
 *  - stanze esaurite / scadenza modalità a tempo → vince il più ricco fra TUTTI.
 *  Se nessuna condizione è soddisfatta, ritorna lo stato invariato. */
export function checkWin(state: LockdownState): LockdownState {
  // Vittoria Master + Spia
  if (state.masterBalance >= state.masterWinAt) {
    return {
      ...state,
      status: "ended",
      phase: "ended",
      winnerId: state.spyPlayerId,
      spyRevealed: true,
      lastFlash: { text: "🎩 Il Master e la Spia hanno vinto!", type: "end" },
    };
  }

  const timeUp = state.mode === "timed" && state.endsAt != null && Date.now() >= new Date(state.endsAt).getTime();
  const roomsDone = state.roomIndex >= LOCKDOWN_CONTENT.rooms.length - 1;

  // Nessuna vittoria per eliminazione: solo stanze finite o tempo scaduto.
  if (timeUp || roomsDone) {
    const richest = state.players.reduce<LockdownPlayerState | null>(
      (best, p) => (best == null || p.lockEuro > best.lockEuro ? p : best),
      null,
    );
    if (richest) {
      return {
        ...state,
        status: "ended",
        phase: "ended",
        winnerId: richest.id,
        spyRevealed: true,
        lastFlash: { text: `🏆 ${richest.nickname} vince con ${richest.lockEuro} Lock-Euro!`, type: "end" },
      };
    }
  }

  return state; // nessun vincitore ancora
}
