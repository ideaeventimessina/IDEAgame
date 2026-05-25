/* Mirror of karaoke-home-engine.ts types for use in the frontend.
   Keep in sync with artifacts/api-server/src/lib/karaoke-home-engine.ts */

export const KARAOKE_VERSION = 3 as const;

export const POSITIVE_REACTIONS = ["❤️", "🔥", "👏", "😍"] as const;
export const NEGATIVE_REACTIONS = ["😂", "😬", "💀", "🙉"] as const;
export const ALL_REACTIONS = [...POSITIVE_REACTIONS, ...NEGATIVE_REACTIONS];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

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
  score: number;
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
  freestylePhase: "idle" | "booking" | "battling" | "battle_result";
  freestyleBookings: FreestyleBooking[];
  currentBattle: FreestyleBattle | null;
  freestyleResults: FreestyleBattleResult[];
  beats: FreestyleBeat[];
  currentBeatId: string | null;
  players: KaraokePlayer[];
}

export interface YTSearchResult {
  videoId: string; title: string; channel: string;
  thumbnailUrl: string; durationSeconds: number; durationFormatted: string;
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getPlayerQueueItem(state: KaraokeHomeState, playerId: string): KaraokeQueueItem | null {
  return state.queue.find(q => q.playerId === playerId &&
    (q.status === "queued" || q.status === "playing" || q.status === "voting")) ?? null;
}

export function remainingSessionSeconds(state: KaraokeHomeState): number {
  if (!state.sessionEndAt) return 0;
  return Math.max(0, (new Date(state.sessionEndAt).getTime() - Date.now()) / 1000);
}

export function queuedSecondsClient(state: KaraokeHomeState): number {
  return state.queue
    .filter(q => q.status === "queued")
    .reduce((sum, q) => sum + q.estimatedSlotDuration, 0);
}

/** Returns true if there's enough time left for at least one more song (uses 2-min minimum). */
export function canQueueAnyMore(state: KaraokeHomeState): boolean {
  if (!state.sessionEndAt) return false;
  const rem = remainingSessionSeconds(state);
  const queued = queuedSecondsClient(state);
  return rem - queued >= 120 + 90; // 2 min song + 90s overhead
}

/** Human-readable wait estimate for a new booking. */
export function waitEstimateLabel(state: KaraokeHomeState): string {
  const queued = queuedSecondsClient(state);
  const waitingCount = state.queue.filter(q => q.status === "queued").length;
  if (waitingCount === 0 || queued < 60) return "Tocca quasi a te";
  if (waitingCount === 1) return "Canterai tra pochi minuti";
  const m = Math.round(queued / 60);
  return `Canterai tra circa ${m} minut${m === 1 ? "o" : "i"}`;
}
