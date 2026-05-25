/* ─── Home mode — Karaoke Live + Freestyle Battle ────────────────────────────
   All endpoints are public (no requireAuth) — home sessions don't use tenant auth.
   State lives in homeSessionsTable.gameConfig.karaokeHomeState (version=3).
──────────────────────────────────────────────────────────────────────────── */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, homeSessionsTable, homePlayersTable } from "@workspace/db";
import { emitToRoom } from "../socket";
import {
  KARAOKE_VERSION, createBlankKaraokeState,
  setMode, setDuration,
  bookSong, changeSong, startNext, openVoting, addReaction, submitVote, endVoting, endSession,
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

async function searchYouTube(query: string): Promise<YTSearchResult[]> {
  if (!YOUTUBE_API_KEY) {
    // Return mock results in dev
    return [
      { videoId: "dQw4w9WgXcQ", title: `${query} - Karaoke Version`, channel: "Karaoke IT",    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg", durationSeconds: 213, durationFormatted: "3:33" },
      { videoId: "9bZkp7q19f0", title: `${query} - Testo e Musica`,  channel: "Karaoke World", thumbnailUrl: "https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg", durationSeconds: 252, durationFormatted: "4:12" },
      { videoId: "CevxZvSJLk8", title: `${query} - Official Karaoke`,channel: "Sing Along",    thumbnailUrl: "https://img.youtube.com/vi/CevxZvSJLk8/mqdefault.jpg", durationSeconds: 198, durationFormatted: "3:18" },
      { videoId: "OPf0YbXqDm0", title: `${query} karaoke HD`,        channel: "Karaoke Bar",   thumbnailUrl: "https://img.youtube.com/vi/OPf0YbXqDm0/mqdefault.jpg", durationSeconds: 225, durationFormatted: "3:45" },
      { videoId: "pRpeEdMmmQ0", title: `${query} - Versione karaoke`, channel: "KaraokeFun IT", thumbnailUrl: "https://img.youtube.com/vi/pRpeEdMmmQ0/mqdefault.jpg", durationSeconds: 240, durationFormatted: "4:00" },
    ];
  }

  try {
    const searchQ = encodeURIComponent(`${query} karaoke`);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQ}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) throw new Error(`YouTube search error: ${searchResp.status}`);
    const searchData = await searchResp.json() as { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } } }[] };
    const items = searchData.items ?? [];
    if (items.length === 0) return [];

    const ids = items.map(i => i.id.videoId).join(",");
    const durUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`;
    const durResp = await fetch(durUrl);
    const durData = await durResp.json() as { items?: { id: string; contentDetails: { duration: string } }[] };
    const durMap = new Map((durData.items ?? []).map(v => [v.id, v.contentDetails.duration]));

    return items.map(item => {
      const videoId = item.id.videoId;
      const iso = durMap.get(videoId) ?? "PT0S";
      const durationSeconds = parseDuration(iso);
      return {
        videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails.medium.url,
        durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
      };
    });
  } catch {
    return [];
  }
}

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
  const results = await searchYouTube(query.trim());
  res.json({ results, mock: !YOUTUBE_API_KEY });
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
