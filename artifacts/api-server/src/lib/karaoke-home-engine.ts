import { randomUUID } from "node:crypto";

/* ─── Constants ──────────────────────────────────────────────────────────── */
export const KARAOKE_VERSION = 3 as const;
const SLOT_OVERHEAD = 90; // 30s voting + 60s transition per song

export const POSITIVE_REACTIONS = ["❤️", "🔥", "👏", "😍"] as const;
export const NEGATIVE_REACTIONS = ["😂", "😬", "💀", "🙉"] as const;
export const ALL_REACTIONS = [...POSITIVE_REACTIONS, ...NEGATIVE_REACTIONS];

export const FREESTYLE_BEATS: FreestyleBeat[] = [
  { id: "beat-01", title: "Trap Roma",        audioUrl: "", bpm: 140, durationSeconds: 60 },
  { id: "beat-02", title: "Boom Bap Milano",  audioUrl: "", bpm:  90, durationSeconds: 60 },
  { id: "beat-03", title: "Drill Napoli",     audioUrl: "", bpm: 135, durationSeconds: 60 },
  { id: "beat-04", title: "Lo-fi Venezia",    audioUrl: "", bpm:  75, durationSeconds: 60 },
  { id: "beat-05", title: "RnB Roma",         audioUrl: "", bpm:  85, durationSeconds: 60 },
  { id: "beat-06", title: "Afrobeat Italia",  audioUrl: "", bpm: 100, durationSeconds: 60 },
  { id: "beat-07", title: "Latin Remix",      audioUrl: "", bpm: 110, durationSeconds: 60 },
  { id: "beat-08", title: "Old School 90s",   audioUrl: "", bpm:  95, durationSeconds: 60 },
  { id: "beat-09", title: "Electronic Drop",  audioUrl: "", bpm: 128, durationSeconds: 60 },
  { id: "beat-10", title: "Acoustic Vibes",   audioUrl: "", bpm:  70, durationSeconds: 60 },
];

export const FREESTYLE_WORD_BANK = [
  "luna", "strada", "fuoco", "amore", "estate", "pizza", "soldi", "notte",
  "cuore", "sogno", "mare", "città", "tempo", "amico", "sole", "musica",
  "fame", "mano", "vita", "porta", "occhi", "voce", "casa", "vento",
  "fiore", "paura", "festa", "cielo", "acqua", "libertà", "verità", "speranza",
];

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface KaraokePlayer {
  id: string; nickname: string; avatarColor: string; score: number;
}
export interface KaraokeQueueItem {
  id: string; playerId: string; nickname: string; avatarColor: string;
  videoId: string; title: string; channel: string; thumbnailUrl: string;
  durationSeconds: number; estimatedSlotDuration: number;
  estimatedStartAt: string | null;
  status: "queued" | "playing" | "voting" | "completed" | "skipped";
}
export interface VotingBallot {
  intonazione: number; presenza: number; emozione: number; originalita: number;
}
export interface KaraokePerformanceResult {
  queueItemId: string; playerId: string; nickname: string;
  videoId: string; title: string;
  score: number; // 0-100
  categoryAverages: VotingBallot;
  positiveReactions: number; negativeReactions: number;
  reactionsByType: Record<string, number>;
  completedAt: string;
}
export interface FreestyleBooking {
  id: string; playerId: string; nickname: string; avatarColor: string;
  status: "waiting" | "active" | "completed";
}
export interface FreestyleWord {
  id: string; word: string; validatedBy: string[]; validated: boolean;
}
export interface FreestyleBattle {
  playerId: string; nickname: string; avatarColor: string; beatId: string;
  startedAt: string; words: FreestyleWord[]; currentWordIndex: number;
  score: number; combo: number;
}
export interface FreestyleBattleResult {
  playerId: string; nickname: string; avatarColor: string;
  score: number; wordsValidated: number; completedAt: string;
}
export interface FreestyleBeat {
  id: string; title: string; audioUrl: string; bpm: number; durationSeconds: number;
}
export interface KaraokeHomeState {
  version: 3;
  subMode: "mode_select" | "karaoke-live" | "freestyle" | "mixed";
  // Karaoke Live
  karaokePhase: "duration_select" | "queue_open" | "playing" | "voting" | "transition" | "finale";
  sessionDurationMinutes: number | null;
  sessionStartAt: string | null;
  sessionEndAt: string | null;
  currentQueueItemId: string | null;
  queue: KaraokeQueueItem[];
  results: KaraokePerformanceResult[];
  reactionsCurrentSong: Record<string, number>;
  currentVotes: Record<string, VotingBallot>;
  queueIsOpen: boolean;
  // Freestyle
  freestylePhase: "idle" | "booking" | "battling" | "battle_result";
  freestyleBookings: FreestyleBooking[];
  currentBattle: FreestyleBattle | null;
  freestyleResults: FreestyleBattleResult[];
  beats: FreestyleBeat[];
  currentBeatId: string | null;
  // Shared
  players: KaraokePlayer[];
}

/* ─── Factory ────────────────────────────────────────────────────────────── */
export function createBlankKaraokeState(
  players: { id: string; nickname: string; avatarColor: string }[],
): KaraokeHomeState {
  return {
    version: 3,
    subMode: "mode_select",
    karaokePhase: "duration_select",
    sessionDurationMinutes: null,
    sessionStartAt: null,
    sessionEndAt: null,
    currentQueueItemId: null,
    queue: [],
    results: [],
    reactionsCurrentSong: {},
    currentVotes: {},
    queueIsOpen: false,
    freestylePhase: "idle",
    freestyleBookings: [],
    currentBattle: null,
    freestyleResults: [],
    beats: FREESTYLE_BEATS,
    currentBeatId: null,
    players: players.map(p => ({ ...p, score: 0 })),
  };
}

/* ─── Queue helpers ──────────────────────────────────────────────────────── */
function recalculateTimes(state: KaraokeHomeState, now = new Date()): KaraokeHomeState {
  let cursor = now.getTime();
  const queue = state.queue.map(item => {
    if (item.status === "completed" || item.status === "skipped" || item.status === "playing" || item.status === "voting") {
      return item;
    }
    const est = new Date(cursor).toISOString();
    cursor += item.estimatedSlotDuration * 1000;
    return { ...item, estimatedStartAt: est };
  });
  return { ...state, queue };
}

export function remainingSeconds(state: KaraokeHomeState, now = Date.now()): number {
  if (!state.sessionEndAt) return 0;
  return Math.max(0, (new Date(state.sessionEndAt).getTime() - now) / 1000);
}

export function queuedSeconds(state: KaraokeHomeState): number {
  return state.queue
    .filter(q => q.status === "queued")
    .reduce((sum, q) => sum + q.estimatedSlotDuration, 0);
}

export function canBookSong(state: KaraokeHomeState, durationSeconds: number, now = Date.now()): boolean {
  if (!state.sessionEndAt) return false;
  const slotDur = durationSeconds + SLOT_OVERHEAD;
  const avail = remainingSeconds(state, now) - queuedSeconds(state);
  return avail >= slotDur;
}

export function getPlayerQueueItem(state: KaraokeHomeState, playerId: string): KaraokeQueueItem | null {
  return state.queue.find(q => q.playerId === playerId && (q.status === "queued" || q.status === "playing" || q.status === "voting")) ?? null;
}

/* ─── Mode selection ─────────────────────────────────────────────────────── */
export function setMode(state: KaraokeHomeState, mode: "karaoke-live" | "freestyle" | "mixed"): KaraokeHomeState {
  let next = { ...state, subMode: mode } as KaraokeHomeState;
  if (mode === "freestyle") {
    next = { ...next, freestylePhase: "booking" };
  }
  return next;
}

/* ─── Karaoke Live: duration ─────────────────────────────────────────────── */
export function setDuration(state: KaraokeHomeState, minutes: number): KaraokeHomeState {
  const now = new Date();
  const end = new Date(now.getTime() + minutes * 60_000);
  return recalculateTimes({
    ...state,
    sessionDurationMinutes: minutes,
    sessionStartAt: now.toISOString(),
    sessionEndAt: end.toISOString(),
    karaokePhase: "queue_open",
    queueIsOpen: true,
  });
}

/* ─── Karaoke Live: queue ────────────────────────────────────────────────── */
export function bookSong(
  state: KaraokeHomeState,
  item: Omit<KaraokeQueueItem, "id" | "estimatedSlotDuration" | "estimatedStartAt" | "status">,
  now = Date.now(),
): { state: KaraokeHomeState; error?: string } {
  const existing = getPlayerQueueItem(state, item.playerId);
  if (existing) return { state, error: "Hai già un brano in coda" };
  if (!canBookSong(state, item.durationSeconds, now)) {
    return { state, error: "Non c'è purtroppo tempo per inserire questa richiesta in coda." };
  }
  const qItem: KaraokeQueueItem = {
    ...item, id: randomUUID(),
    estimatedSlotDuration: item.durationSeconds + SLOT_OVERHEAD,
    estimatedStartAt: null,
    status: "queued",
  };
  return { state: recalculateTimes({ ...state, queue: [...state.queue, qItem] }, new Date(now)) };
}

export function changeSong(
  state: KaraokeHomeState,
  playerId: string,
  item: Omit<KaraokeQueueItem, "id" | "estimatedSlotDuration" | "estimatedStartAt" | "status">,
  now = Date.now(),
): { state: KaraokeHomeState; error?: string } {
  const existing = state.queue.find(q => q.playerId === playerId && q.status === "queued");
  if (!existing) return { state, error: "Nessuna prenotazione attiva da cambiare" };
  if (!canBookSong(state, item.durationSeconds, now)) {
    return { state, error: "Non c'è purtroppo tempo per inserire questa richiesta in coda." };
  }
  // Remove old, add new at end
  const filtered = state.queue.filter(q => q.id !== existing.id);
  const newItem: KaraokeQueueItem = {
    ...item, id: randomUUID(),
    estimatedSlotDuration: item.durationSeconds + SLOT_OVERHEAD,
    estimatedStartAt: null,
    status: "queued",
  };
  return { state: recalculateTimes({ ...state, queue: [...filtered, newItem] }, new Date(now)) };
}

/* ─── Karaoke Live: playback ─────────────────────────────────────────────── */
export function startNext(state: KaraokeHomeState): { state: KaraokeHomeState; error?: string } {
  const next = state.queue.find(q => q.status === "queued");
  if (!next) return { state, error: "Coda vuota" };
  const queue = state.queue.map(q =>
    q.id === next.id ? { ...q, status: "playing" as const } : q
  );
  return {
    state: {
      ...state,
      queue,
      currentQueueItemId: next.id,
      karaokePhase: "playing",
      reactionsCurrentSong: {},
      currentVotes: {},
    },
  };
}

export function addReaction(state: KaraokeHomeState, emoji: string): KaraokeHomeState {
  const reactions = { ...state.reactionsCurrentSong };
  reactions[emoji] = (reactions[emoji] ?? 0) + 1;
  return { ...state, reactionsCurrentSong: reactions };
}

export function submitVote(
  state: KaraokeHomeState,
  voterId: string,
  ballot: VotingBallot,
): KaraokeHomeState {
  if (state.karaokePhase !== "voting") return state;
  const votes = { ...state.currentVotes, [voterId]: ballot };
  return { ...state, currentVotes: votes };
}

export function openVoting(state: KaraokeHomeState): KaraokeHomeState {
  const queue = state.queue.map(q =>
    q.id === state.currentQueueItemId ? { ...q, status: "voting" as const } : q
  );
  return { ...state, queue, karaokePhase: "voting", currentVotes: {} };
}

export function endVoting(state: KaraokeHomeState, now = new Date()): { state: KaraokeHomeState; result: KaraokePerformanceResult | null } {
  const item = state.queue.find(q => q.id === state.currentQueueItemId);
  if (!item) return { state, result: null };

  const votes = Object.values(state.currentVotes);
  const avg = (key: keyof VotingBallot) =>
    votes.length > 0 ? votes.reduce((s, v) => s + v[key], 0) / votes.length : 0;

  const categoryAverages: VotingBallot = {
    intonazione: avg("intonazione"),
    presenza: avg("presenza"),
    emozione: avg("emozione"),
    originalita: avg("originalita"),
  };
  const overallAvg = (categoryAverages.intonazione + categoryAverages.presenza + categoryAverages.emozione + categoryAverages.originalita) / 4;
  const score = Math.round(overallAvg * 20);

  const reactionsByType = { ...state.reactionsCurrentSong };
  const positiveReactions = POSITIVE_REACTIONS.reduce((s, e) => s + (reactionsByType[e] ?? 0), 0);
  const negativeReactions = NEGATIVE_REACTIONS.reduce((s, e) => s + (reactionsByType[e] ?? 0), 0);

  const result: KaraokePerformanceResult = {
    queueItemId: item.id,
    playerId: item.playerId,
    nickname: item.nickname,
    videoId: item.videoId,
    title: item.title,
    score,
    categoryAverages,
    positiveReactions,
    negativeReactions,
    reactionsByType,
    completedAt: now.toISOString(),
  };

  const queue = state.queue.map(q =>
    q.id === state.currentQueueItemId ? { ...q, status: "completed" as const } : q
  );

  // Update player score
  const players = state.players.map(p =>
    p.id === item.playerId ? { ...p, score: p.score + score } : p
  );

  const nextState = recalculateTimes({
    ...state,
    queue,
    players,
    results: [...state.results, result],
    currentVotes: {},
    karaokePhase: "transition",
  });

  return { state: nextState, result };
}

export function endSession(state: KaraokeHomeState): KaraokeHomeState {
  return { ...state, karaokePhase: "finale", queueIsOpen: false };
}

/* ─── Freestyle ──────────────────────────────────────────────────────────── */
export function freestyleBook(
  state: KaraokeHomeState,
  playerId: string,
  nickname: string,
  avatarColor: string,
): { state: KaraokeHomeState; error?: string } {
  const existing = state.freestyleBookings.find(b => b.playerId === playerId && b.status === "waiting");
  if (existing) return { state, error: "Sei già in coda per il freestyle" };
  const booking: FreestyleBooking = { id: randomUUID(), playerId, nickname, avatarColor, status: "waiting" };
  return { state: { ...state, freestyleBookings: [...state.freestyleBookings, booking], freestylePhase: "booking" } };
}

export function freestyleStartBattle(state: KaraokeHomeState, beatId?: string): { state: KaraokeHomeState; error?: string } {
  const next = state.freestyleBookings.find(b => b.status === "waiting");
  if (!next) return { state, error: "Nessun rapper in attesa" };

  const beat = beatId
    ? state.beats.find(b => b.id === beatId) ?? state.beats[Math.floor(Math.random() * state.beats.length)]
    : state.beats[Math.floor(Math.random() * state.beats.length)];

  if (!beat) return { state, error: "Nessuna base musicale disponibile" };

  // Pick 8 random words for the battle
  const shuffled = [...FREESTYLE_WORD_BANK].sort(() => Math.random() - 0.5).slice(0, 8);
  const words: FreestyleWord[] = shuffled.map(w => ({ id: randomUUID(), word: w, validatedBy: [], validated: false }));

  const battle: FreestyleBattle = {
    playerId: next.playerId,
    nickname: next.nickname,
    avatarColor: next.avatarColor,
    beatId: beat.id,
    startedAt: new Date().toISOString(),
    words,
    currentWordIndex: 0,
    score: 0,
    combo: 0,
  };

  const freestyleBookings = state.freestyleBookings.map(b =>
    b.id === next.id ? { ...b, status: "active" as const } : b
  );

  return {
    state: { ...state, freestyleBookings, currentBattle: battle, currentBeatId: beat.id, freestylePhase: "battling" },
  };
}

export function freestyleNextWord(state: KaraokeHomeState): KaraokeHomeState {
  if (!state.currentBattle) return state;
  const next = Math.min(state.currentBattle.currentWordIndex + 1, state.currentBattle.words.length - 1);
  return { ...state, currentBattle: { ...state.currentBattle, currentWordIndex: next, combo: 0 } };
}

export function freestyleValidateWord(
  state: KaraokeHomeState,
  playerId: string,
  totalPlayers: number,
): KaraokeHomeState {
  if (!state.currentBattle) return state;
  const battle = state.currentBattle;
  const wordIdx = battle.currentWordIndex;
  const word = battle.words[wordIdx];
  if (!word || word.validated) return state;
  if (word.validatedBy.includes(playerId)) return state;

  const threshold = Math.max(1, Math.min(2, Math.floor(totalPlayers * 0.4)));
  const updatedWord = { ...word, validatedBy: [...word.validatedBy, playerId] };
  const isNowValidated = updatedWord.validatedBy.length >= threshold;

  let newScore = battle.score;
  let newCombo = battle.combo;

  if (isNowValidated) {
    updatedWord.validated = true;
    newScore += 50;
    newCombo += 1;
    if (newCombo === 3) {
      newScore += 100; // combo bonus
      newCombo = 0;
    }
  }

  const words = battle.words.map((w, i) => i === wordIdx ? updatedWord : w);
  return { ...state, currentBattle: { ...battle, words, score: newScore, combo: newCombo } };
}

export function freestyleEndBattle(state: KaraokeHomeState, now = new Date()): KaraokeHomeState {
  if (!state.currentBattle) return state;
  const battle = state.currentBattle;

  const result: FreestyleBattleResult = {
    playerId: battle.playerId,
    nickname: battle.nickname,
    avatarColor: battle.avatarColor,
    score: battle.score,
    wordsValidated: battle.words.filter(w => w.validated).length,
    completedAt: now.toISOString(),
  };

  const players = state.players.map(p =>
    p.id === battle.playerId ? { ...p, score: p.score + battle.score } : p
  );

  const freestyleBookings = state.freestyleBookings.map(b =>
    b.playerId === battle.playerId ? { ...b, status: "completed" as const } : b
  );

  return {
    ...state,
    players,
    freestyleBookings,
    currentBattle: null,
    freestyleResults: [...state.freestyleResults, result],
    freestylePhase: "battle_result",
  };
}
