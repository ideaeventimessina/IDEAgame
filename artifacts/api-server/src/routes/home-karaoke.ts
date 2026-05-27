/* ─── Home mode — Karaoke Live + Freestyle Battle ────────────────────────────
   All endpoints are public (no requireAuth) — home sessions don't use tenant auth.
   State lives in homeSessionsTable.gameConfig.karaokeHomeState (version=3).
──────────────────────────────────────────────────────────────────────────── */

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { eq } from "drizzle-orm";
import { db, homeSessionsTable, homePlayersTable } from "@workspace/db";
import { emitToRoom } from "../socket";
import {
  KARAOKE_VERSION, createBlankKaraokeState,
  setMode, setDuration,
  bookSong, changeSong, cancelSong, startNext, openVoting, addReaction, submitVote, endVoting, endSession,
  freestyleBook, freestyleStartBattle, freestyleNextWord, freestyleValidateWord, freestyleEndBattle,
  type KaraokeHomeState, type VotingBallot,
} from "../lib/karaoke-home-engine";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);
const homeRoom = (id: string) => `home:${id}`;

/* ── DB helpers ──────────────────────────────────────────────────────────── */
async function getSession(id: string) {
  if (!isUUID(id)) return null;
  const [s] = await db.select().from(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  return s ?? null;
}
async function getPlayers(sessionId: string) {
  return db.select().from(homePlayersTable).where(eq(homePlayersTable.sessionId, sessionId));
}
function getKaraokeState(gameConfig: Record<string, unknown>): KaraokeHomeState | null {
  const ks = gameConfig["karaokeHomeState"];
  if (ks && typeof ks === "object" && (ks as { version?: number }).version === KARAOKE_VERSION) {
    return ks as KaraokeHomeState;
  }
  return null;
}
async function saveState(id: string, state: KaraokeHomeState, prevConfig: Record<string, unknown>): Promise<void> {
  await db.update(homeSessionsTable)
    .set({ gameConfig: { ...prevConfig, karaokeHomeState: state } })
    .where(eq(homeSessionsTable.id, id));
}
function emit(id: string, state: KaraokeHomeState) {
  emitToRoom(homeRoom(id), "home:karaoke_state", { state });
}

/* ── GET state ───────────────────────────────────────────────────────────── */
router.get("/home/sessions/:id/karaoke/state", async (req: Request, res: Response): Promise<void> => {
  const session = await getSession(String(req.params["id"]));
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const state = getKaraokeState((session.gameConfig as Record<string, unknown>) ?? {});
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  res.json(state);
});

/* ── POST init ───────────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/init", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const dbPlayers = await getPlayers(id);
  if (dbPlayers.length === 0) { res.status(400).json({ error: "Nessun giocatore" }); return; }
  const state = createBlankKaraokeState(dbPlayers.map(p => ({ id: p.id, nickname: p.nickname, avatarColor: p.avatarColor })));
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  await saveState(id, state, cfg);
  emit(id, state);
  res.status(201).json({ state });
});

/* ── POST set-mode ───────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/set-mode", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { mode } = req.body as { mode?: string };
  if (!mode || !["karaoke-live", "freestyle", "mixed"].includes(mode)) {
    res.status(400).json({ error: "mode deve essere: karaoke-live | freestyle | mixed" }); return;
  }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = setMode(state, mode as "karaoke-live" | "freestyle" | "mixed");
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── POST set-duration ───────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/set-duration", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { minutes } = req.body as { minutes?: number };
  if (!minutes || minutes < 1 || minutes > 240) {
    res.status(400).json({ error: "minutes richiesto (1-240)" }); return;
  }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = setDuration(state, minutes);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── POST search (YouTube) ───────────────────────────────────────────────── */
const YOUTUBE_API_KEY = process.env["YOUTUBE_API_KEY"] ?? "";

interface YTSearchResult {
  videoId: string; title: string; channel: string;
  thumbnailUrl: string; durationSeconds: number; durationFormatted: string;
}

// Keywords that indicate a real karaoke track (higher = better)
const KARAOKE_POSITIVE: [string, number][] = [
  ["karaoke version", 100],
  ["official karaoke", 90],
  ["instrumental karaoke", 85],
  ["versione karaoke", 80],
  ["karaoke hd", 70],
  ["backing track", 65],
  ["karaoke", 60],
  ["base musicale", 50],
  ["instrumental", 40],
];
// Keywords that penalise a result (likely not a karaoke track)
const KARAOKE_PENALTY_RE = /official\s*(music\s*)?video|live\s+(at|performance|concert)|music\s*video|videoclip|intervista|interview|reaction|lyrics?\s*video|acoustic/i;

function rankKaraokeResults(items: YTSearchResult[], rawInput: string): YTSearchResult[] {
  const artistWords = rawInput.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  type Scored = YTSearchResult & { _score: number };
  const scored: Scored[] = items.map(r => {
    const tl = r.title.toLowerCase();
    const ch = r.channel.toLowerCase();
    let score = 0;
    for (const [kw, pts] of KARAOKE_POSITIVE) {
      if (tl.includes(kw)) { score += pts; break; }
    }
    if (artistWords.some(w => tl.includes(w) || ch.includes(w))) score += 20;
    if (KARAOKE_PENALTY_RE.test(r.title)) score -= 40;
    return { ...r, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score: _s, ...rest }) => rest as YTSearchResult);
}

// ── YouTube API types ────────────────────────────────────────────────────────
type YTSearchItem = {
  id: { videoId: string };
  snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } };
};
type YTError = { code: number; message: string; status?: string };

interface SearchOk {
  ok: true;
  results: YTSearchResult[];
  noKaraokeFound: boolean;
  warning?: string;
  mock?: boolean;
  youtubeQuery: string;
}
interface SearchErr {
  ok: false;
  error: "youtube_api_error" | "youtube_zero_results" | "youtube_exception";
  youtubeQuery: string;
  status?: number;
  code?: number;
  message?: string;
  mock?: boolean;
}
type SearchResult = SearchOk | SearchErr;

// ── Internal helper: build, fetch and parse one YouTube search ────────────────
async function rawYouTubeSearch(youtubeQuery: string): Promise<{
  httpStatus: number;
  items: YTSearchItem[];
  ytError: YTError | null;
  requestUrlWithoutKey: string;
}> {
  const searchQ = encodeURIComponent(youtubeQuery);
  const requestUrlWithoutKey = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQ}&type=video&maxResults=10&key=***`;
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQ}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
  const resp = await fetch(searchUrl);
  const httpStatus = resp.status;
  const bodyText = await resp.text().catch(() => "");
  let parsed: { items?: YTSearchItem[]; error?: YTError } = {};
  try { parsed = JSON.parse(bodyText) as typeof parsed; } catch { /* ignore */ }
  return {
    httpStatus,
    items: parsed.items ?? [],
    ytError: parsed.error ?? null,
    requestUrlWithoutKey,
  };
}

async function searchYouTube(rawInput: string): Promise<SearchResult> {
  const youtubeQuery = `${rawInput} karaoke`;
  const apiKeyPresent = !!YOUTUBE_API_KEY;
  const apiKeyPrefix = YOUTUBE_API_KEY ? YOUTUBE_API_KEY.slice(0, 6) : "(none)";

  // ── Mock mode (no key) ────────────────────────────────────────────────────
  if (!apiKeyPresent) {
    const mock: YTSearchResult[] = [
      { videoId: "dQw4w9WgXcQ", title: `${rawInput} - Karaoke Version`,      channel: "Karaoke IT",    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg", durationSeconds: 213, durationFormatted: "3:33" },
      { videoId: "9bZkp7q19f0", title: `${rawInput} - Official Karaoke`,     channel: "Karaoke World", thumbnailUrl: "https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg", durationSeconds: 252, durationFormatted: "4:12" },
      { videoId: "CevxZvSJLk8", title: `${rawInput} - Instrumental Karaoke`, channel: "Sing Along",    thumbnailUrl: "https://img.youtube.com/vi/CevxZvSJLk8/mqdefault.jpg", durationSeconds: 198, durationFormatted: "3:18" },
      { videoId: "OPf0YbXqDm0", title: `${rawInput} karaoke HD`,              channel: "Karaoke Bar",  thumbnailUrl: "https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg", durationSeconds: 225, durationFormatted: "3:45" },
      { videoId: "pRpeEdMmmQ0", title: `${rawInput} - Versione karaoke`,      channel: "KaraokeFun IT",thumbnailUrl: "https://img.youtube.com/vi/pRpeEdMmmQ0/mqdefault.jpg", durationSeconds: 240, durationFormatted: "4:00" },
    ];
    logger.info({ apiKeyPresent, apiKeyPrefix, rawInput, youtubeQuery, youtubeItemsCount: mock.length, first5Titles: mock.map(m => m.title) }, "[KARAOKE_API_DEBUG] mock mode — no YOUTUBE_API_KEY");
    return { ok: true, results: mock, noKaraokeFound: false, mock: true, youtubeQuery };
  }

  try {
    // ── 1. Fetch from YouTube ─────────────────────────────────────────────────
    const { httpStatus, items, ytError, requestUrlWithoutKey } = await rawYouTubeSearch(youtubeQuery);

    // ── Full debug log every request ─────────────────────────────────────────
    logger.info({
      apiKeyPresent,
      apiKeyPrefix,
      rawInput,
      youtubeQuery,
      requestUrlWithoutKey,
      httpStatus,
      youtubeErrorCode:    ytError?.code    ?? null,
      youtubeErrorMessage: ytError?.message ?? null,
      itemsLength:         items.length,
      first5Titles:        items.slice(0, 5).map(i => i.snippet.title),
    }, "[KARAOKE_API_DEBUG]");

    // ── 2. HTTP error → structured error response ─────────────────────────────
    if (httpStatus < 200 || httpStatus >= 300) {
      return {
        ok: false,
        error: "youtube_api_error",
        youtubeQuery,
        status: httpStatus,
        code:    ytError?.code    ?? httpStatus,
        message: ytError?.message ?? `HTTP ${httpStatus}`,
      };
    }

    // ── 3. Zero results → explicit zero error ────────────────────────────────
    if (items.length === 0) {
      return { ok: false, error: "youtube_zero_results", youtubeQuery };
    }

    // ── 4. Fetch durations + embeddability (FIX 1) ───────────────────────────
    const ids = items.map(i => i.id.videoId).join(",");
    const durUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ids}&key=${YOUTUBE_API_KEY}`;
    const durResp = await fetch(durUrl);
    const durData = await durResp.json() as {
      items?: { id: string; contentDetails: { duration: string }; status: { embeddable: boolean } }[]
    };
    const durItems = durData.items ?? [];
    const embeddableIds = new Set(durItems.filter(v => v.status?.embeddable !== false).map(v => v.id));
    const durMap = new Map(durItems.map(v => [v.id, v.contentDetails.duration]));
    logger.info({
      totalIds: items.length,
      embeddableCount: embeddableIds.size,
      filteredOut: items.length - embeddableIds.size,
    }, "[KARAOKE_EMBED_CHECK]");
    // Keep only embeddable videos
    const embeddableItems = items.filter(i => embeddableIds.has(i.id.videoId));
    if (embeddableItems.length === 0) {
      return { ok: false, error: "youtube_zero_results", youtubeQuery };
    }

    // ── 5. Build result objects ───────────────────────────────────────────────
    const raw: YTSearchResult[] = embeddableItems.map(item => {
      const videoId = item.id.videoId;
      const durationSeconds = parseDuration(durMap.get(videoId) ?? "PT0S");
      return {
        videoId,
        title:            item.snippet.title,
        channel:          item.snippet.channelTitle,
        thumbnailUrl:     item.snippet.thumbnails.medium.url,
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
      };
    });

    // ── 6. Rank karaoke-first, return top 5 ──────────────────────────────────
    const ranked = rankKaraokeResults(raw, rawInput).slice(0, 5);
    const hasKaraokeTitle = ranked.some(r =>
      /karaoke|base musicale|backing track|instrumental/i.test(r.title)
    );
    const warning = hasKaraokeTitle
      ? undefined
      : "Nessun risultato esplicitamente karaoke, controlla prima di confermare";

    logger.info({
      apiKeyPresent,
      apiKeyPrefix,
      rawInput,
      youtubeQuery,
      httpStatus,
      rankedCount: ranked.length,
      first5Titles: ranked.map(r => r.title),
      warning: warning ?? null,
    }, "[KARAOKE_API_DEBUG] ok — results returned");

    return { ok: true, results: ranked, noKaraokeFound: false, warning, youtubeQuery };

  } catch (err) {
    logger.error({ apiKeyPresent, apiKeyPrefix, rawInput, youtubeQuery, error: String(err) }, "[KARAOKE_API_DEBUG] exception");
    return {
      ok: false,
      error: "youtube_exception",
      youtubeQuery,
      message: String(err),
    };
  }
}

/* ── GET youtube-test (temporary diagnostic, no auth) ────────────────────── */
router.get("/home/karaoke/youtube-test", async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) { res.status(400).json({ error: "q param required" }); return; }

  const apiKeyPresent = !!YOUTUBE_API_KEY;
  const apiKeyPrefix  = YOUTUBE_API_KEY ? YOUTUBE_API_KEY.slice(0, 6) : "(none)";

  if (!apiKeyPresent) {
    res.json({ apiKeyPresent, apiKeyPrefix, mock: true, note: "No YOUTUBE_API_KEY set — mock mode" });
    return;
  }

  try {
    const { httpStatus, items, ytError, requestUrlWithoutKey } = await rawYouTubeSearch(q);
    const first5Titles = items.slice(0, 5).map(i => i.snippet.title);
    logger.info({ apiKeyPresent, apiKeyPrefix, q, requestUrlWithoutKey, httpStatus, itemsLength: items.length, youtubeErrorCode: ytError?.code ?? null, youtubeErrorMessage: ytError?.message ?? null, first5Titles }, "[KARAOKE_API_DEBUG] youtube-test");
    res.json({
      apiKeyPresent,
      apiKeyPrefix,
      requestUrlWithoutKey,
      httpStatus,
      itemsLength:         items.length,
      first5Titles,
      error: ytError ?? null,
    });
  } catch (err) {
    res.status(500).json({ apiKeyPresent, apiKeyPrefix, error: String(err) });
  }
});

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}
function formatDuration(s: number): string {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

router.post("/home/sessions/:id/karaoke/search", async (req: Request, res: Response): Promise<void> => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) { res.status(400).json({ error: "query richiesta" }); return; }
  const session = await getSession(String(req.params["id"]));
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const rawInput = query.trim();
  const result = await searchYouTube(rawInput);
  // Pass the full structured result (ok/err) straight to the client
  res.json(result);
});

/* ── POST book-song ──────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/book-song", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const body = req.body as {
    playerId?: string; nickname?: string; avatarColor?: string;
    videoId?: string; title?: string; channel?: string;
    thumbnailUrl?: string; durationSeconds?: number;
    dedicationTargetPlayerId?: string | null;
    dedicationTargetNickname?: string | null;
  };
  const { playerId, nickname, avatarColor, videoId, title, channel, thumbnailUrl, durationSeconds,
    dedicationTargetPlayerId, dedicationTargetNickname } = body;
  if (!playerId || !nickname || !videoId || !title || !durationSeconds) {
    res.status(400).json({ error: "playerId, nickname, videoId, title, durationSeconds richiesti" }); return;
  }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }

  const result = bookSong(state, {
    playerId, nickname, avatarColor: avatarColor ?? "#F5B642",
    videoId, title, channel: channel ?? "", thumbnailUrl: thumbnailUrl ?? "",
    durationSeconds,
    dedicationTargetPlayerId: dedicationTargetPlayerId ?? null,
    dedicationTargetNickname: dedicationTargetNickname ?? null,
  });
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── POST change-song ────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/change-song", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const body = req.body as {
    playerId?: string; nickname?: string; avatarColor?: string;
    videoId?: string; title?: string; channel?: string;
    thumbnailUrl?: string; durationSeconds?: number;
    dedicationTargetPlayerId?: string | null;
    dedicationTargetNickname?: string | null;
  };
  const { playerId, nickname, avatarColor, videoId, title, channel, thumbnailUrl, durationSeconds,
    dedicationTargetPlayerId, dedicationTargetNickname } = body;
  if (!playerId || !nickname || !videoId || !title || !durationSeconds) {
    res.status(400).json({ error: "playerId, nickname, videoId, title, durationSeconds richiesti" }); return;
  }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }

  const result = changeSong(state, playerId, {
    playerId, nickname, avatarColor: avatarColor ?? "#F5B642",
    videoId, title, channel: channel ?? "", thumbnailUrl: thumbnailUrl ?? "",
    durationSeconds,
    dedicationTargetPlayerId: dedicationTargetPlayerId ?? null,
    dedicationTargetNickname: dedicationTargetNickname ?? null,
  });
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── POST start-next ─────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/start-next", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const result = startNext(state);
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── POST open-voting ────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/open-voting", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = openVoting(state);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── POST react ──────────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/react", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { emoji } = req.body as { emoji?: string };
  if (!emoji) { res.status(400).json({ error: "emoji richiesta" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = addReaction(state, emoji);
  await saveState(id, next, cfg);
  // Emit both state update and a lightweight reaction animation event
  emitToRoom(homeRoom(id), "home:karaoke_reaction", { emoji });
  emit(id, next);
  res.json({ ok: true });
});

/* ── POST cancel-song ────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/cancel-song", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: "playerId richiesto" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const result = cancelSong(state, playerId);
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── POST vote ───────────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/vote", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { voterId, ballot } = req.body as { voterId?: string; ballot?: VotingBallot };
  if (!voterId || !ballot) { res.status(400).json({ error: "voterId e ballot richiesti" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  // FIX 5: Hard-lock votes after timer expires
  if (state.voteCloseAt && Date.now() > new Date(state.voteCloseAt).getTime()) {
    res.status(409).json({ error: "Votazione chiusa" }); return;
  }
  const next = submitVote(state, voterId, ballot);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── POST end-voting ─────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/end-voting", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const { state: next, result } = endVoting(state);

  // Write score to homePlayersTable
  if (result) {
    await db.update(homePlayersTable)
      .set({ score: next.players.find(p => p.id === result.playerId)?.score ?? 0 })
      .where(eq(homePlayersTable.id, result.playerId))
      .catch(() => {});
  }

  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next, result });
});

/* ── POST end-session ────────────────────────────────────────────────────── */
router.post("/home/sessions/:id/karaoke/end-session", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = endSession(state);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── POST backstage-status (relay only — no DB write) ────────────────────── */
router.post("/home/sessions/:id/karaoke/backstage-status", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { nextVideoId, status } = req.body as { nextVideoId?: string; status?: string };
  if (!nextVideoId || !status) { res.status(400).json({ error: "nextVideoId e status richiesti" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  emitToRoom(homeRoom(id), "home:karaoke_backstage_update", { nextVideoId, status });
  res.json({ ok: true });
});

/* ── Freestyle: POST book ────────────────────────────────────────────────── */
router.post("/home/sessions/:id/freestyle/book", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId, nickname, avatarColor } = req.body as { playerId?: string; nickname?: string; avatarColor?: string };
  if (!playerId || !nickname) { res.status(400).json({ error: "playerId e nickname richiesti" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const result = freestyleBook(state, playerId, nickname, avatarColor ?? "#F5B642");
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── Freestyle: POST start-battle ────────────────────────────────────────── */
router.post("/home/sessions/:id/freestyle/start-battle", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { beatId } = req.body as { beatId?: string };
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const result = freestyleStartBattle(state, beatId);
  if (result.error) { res.status(400).json({ error: result.error }); return; }
  await saveState(id, result.state, cfg);
  emit(id, result.state);
  res.json({ state: result.state });
});

/* ── Freestyle: POST next-word ───────────────────────────────────────────── */
router.post("/home/sessions/:id/freestyle/next-word", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = freestyleNextWord(state);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── Freestyle: POST validate-word ──────────────────────────────────────── */
router.post("/home/sessions/:id/freestyle/validate-word", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: "playerId richiesto" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const dbPlayers = await getPlayers(id);
  const next = freestyleValidateWord(state, playerId, dbPlayers.length);
  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

/* ── Freestyle: POST end-battle ──────────────────────────────────────────── */
router.post("/home/sessions/:id/freestyle/end-battle", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  const cfg = (session.gameConfig as Record<string, unknown>) ?? {};
  const state = getKaraokeState(cfg);
  if (!state) { res.status(404).json({ error: "Karaoke non inizializzato" }); return; }
  const next = freestyleEndBattle(state);

  // Write score to homePlayersTable
  const battle = state.currentBattle;
  if (battle) {
    const updated = next.players.find(p => p.id === battle.playerId);
    if (updated) {
      await db.update(homePlayersTable)
        .set({ score: updated.score })
        .where(eq(homePlayersTable.id, battle.playerId))
        .catch(() => {});
    }
  }

  await saveState(id, next, cfg);
  emit(id, next);
  res.json({ state: next });
});

export default router;
