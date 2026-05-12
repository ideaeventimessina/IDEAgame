import { Router, type IRouter } from "express";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import os from "os";
import {
  db,
  karaokeSetsTable,
  karaokeTracksTable,
  karaokeSessionsTable,
  karaokeBookingsTable,
  gameSessionsTable,
  teamsTable,
  playersTable,
} from "@workspace/db";
import type { KaraokeState, KaraokeBooking, KaraokeTeam } from "@workspace/db";
import { type AuthedRequest, requireAuth, loadUser } from "../middlewares/auth";
import { emitToEvent } from "../socket";
import { uploadBufferToStorage } from "../lib/objectStorage";

const execFileAsync = promisify(execFile);
const YT_DLP = "/home/runner/workspace/.pythonlibs/bin/yt-dlp";

const router: IRouter = Router();

/* ── helpers ────────────────────────────────────────────────────────────── */

function emit(eventId: string, event: string, payload: unknown) {
  emitToEvent(eventId, event, payload);
}

async function buildState(
  ks: typeof karaokeSessionsTable.$inferSelect,
  bookings: typeof karaokeBookingsTable.$inferSelect[],
  eventId: string,
): Promise<KaraokeState> {
  const state = ks.state as KaraokeState;

  // Load teams from event
  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color })
    .from(teamsTable)
    .where(eq(teamsTable.eventId, eventId));

  // Build team scores from state
  const teamScoreMap = new Map((state.teams ?? []).map((t) => [t.id, t.score]));
  const fullTeams: KaraokeTeam[] = teams.map((t) => ({
    ...t,
    score: teamScoreMap.get(t.id) ?? 0,
  }));

  // Build bookings with player info
  const enrichedBookings: KaraokeBooking[] = await Promise.all(
    bookings
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(async (b) => {
        const [player] = await db
          .select({ nickname: playersTable.nickname, teamId: playersTable.teamId })
          .from(playersTable)
          .where(eq(playersTable.id, b.playerId))
          .limit(1);

        const team = fullTeams.find((t) => t.id === (b.teamId ?? player?.teamId));
        return {
          id: b.id,
          playerId: b.playerId,
          nickname: player?.nickname ?? "Unknown",
          teamId: b.teamId ?? player?.teamId ?? "",
          teamName: team?.name ?? "",
          teamColor: team?.color ?? "#8B5CF6",
          status: b.status as KaraokeBooking["status"],
          orderIndex: b.orderIndex,
        };
      }),
  );

  return {
    ...state,
    bookings: enrichedBookings,
    teams: fullTeams,
  };
}

async function getEventIdForSession(sessionId: string | string[]): Promise<string | null> {
  const sid = Array.isArray(sessionId) ? sessionId[0]! : sessionId;
  const [gs] = await db
    .select({ eventId: gameSessionsTable.eventId })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sid))
    .limit(1);
  return gs?.eventId ?? null;
}

async function getKaraokeSession(sessionId: string | string[]) {
  const sid = Array.isArray(sessionId) ? sessionId[0]! : sessionId;
  const [ks] = await db
    .select()
    .from(karaokeSessionsTable)
    .where(eq(karaokeSessionsTable.sessionId, sid))
    .limit(1);
  return ks ?? null;
}

async function saveState(ksId: string, state: KaraokeState) {
  await db
    .update(karaokeSessionsTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(karaokeSessionsTable.id, ksId));
}

/* ── Sets CRUD ────────────────────────────────────────────────────────── */

router.get("/karaoke/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const user = ar.user!;
  const tenantId = user.role === "super_admin" ? undefined : user.tenantId;
  const rows = await db
    .select()
    .from(karaokeSetsTable)
    .where(
      tenantId
        ? or(eq(karaokeSetsTable.tenantId, tenantId), isNull(karaokeSetsTable.tenantId))
        : undefined,
    )
    .orderBy(asc(karaokeSetsTable.createdAt));
  res.json(rows);
});

router.post("/karaoke/sets", requireAuth, async (req, res) => {
  const ar = req as AuthedRequest;
  const { title, description = "", language = "it" } = req.body as {
    title: string; description?: string; language?: string;
  };
  if (!title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  const user = ar.user!;
  const tenantId = user.role === "super_admin" ? (req.body.tenantId ?? null) : user.tenantId;
  const [row] = await db
    .insert(karaokeSetsTable)
    .values({ title: title.trim(), description, language, tenantId })
    .returning();
  res.status(201).json(row);
});

router.delete("/karaoke/sets/:id", requireAuth, async (req, res) => {
  await db.delete(karaokeSetsTable).where(eq(karaokeSetsTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── Tracks CRUD ──────────────────────────────────────────────────────── */

router.get("/karaoke/sets/:id/tracks", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(karaokeTracksTable)
    .where(eq(karaokeTracksTable.setId, req.params.id as string))
    .orderBy(asc(karaokeTracksTable.orderIndex));
  res.json(rows);
});

router.post("/karaoke/sets/:id/tracks", requireAuth, async (req, res) => {
  const setId = req.params.id as string;
  const {
    title, artist, lyricSnippet = "", audioUrl = null,
    durationSeconds = 60, points = 150, category = "pop",
    difficulty = "medium", orderIndex = 0,
  } = req.body as {
    title: string; artist: string; lyricSnippet?: string; audioUrl?: string | null;
    durationSeconds?: number; points?: number; category?: string;
    difficulty?: string; orderIndex?: number;
  };
  if (!title?.trim() || !artist?.trim()) { res.status(400).json({ error: "title and artist required" }); return; }
  const [row] = await db
    .insert(karaokeTracksTable)
    .values({ setId, title: title.trim(), artist: artist.trim(), lyricSnippet, audioUrl: audioUrl || null, durationSeconds, points, category, difficulty, orderIndex })
    .returning();
  res.status(201).json(row);
});

router.patch("/karaoke/tracks/:id", requireAuth, async (req, res) => {
  const { isActive, title, artist, lyricSnippet, audioUrl, durationSeconds, points, category, difficulty, orderIndex } = req.body as {
    isActive?: boolean; title?: string; artist?: string; lyricSnippet?: string; audioUrl?: string | null;
    durationSeconds?: number; points?: number; category?: string; difficulty?: string; orderIndex?: number;
  };
  const updates: Partial<typeof karaokeTracksTable.$inferInsert> = {};
  if (isActive !== undefined) updates.isActive = isActive;
  if (title !== undefined) updates.title = title;
  if (artist !== undefined) updates.artist = artist;
  if (lyricSnippet !== undefined) updates.lyricSnippet = lyricSnippet;
  if (audioUrl !== undefined) updates.audioUrl = audioUrl;
  if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;
  if (points !== undefined) updates.points = points;
  if (category !== undefined) updates.category = category;
  if (difficulty !== undefined) updates.difficulty = difficulty;
  if (orderIndex !== undefined) updates.orderIndex = orderIndex;
  const [row] = await db.update(karaokeTracksTable).set(updates).where(eq(karaokeTracksTable.id, req.params.id as string)).returning();
  res.json(row);
});

router.delete("/karaoke/tracks/:id", requireAuth, async (req, res) => {
  await db.delete(karaokeTracksTable).where(eq(karaokeTracksTable.id, req.params.id as string));
  res.status(204).end();
});

/* ── AI: suggest tracks by theme ─────────────────────────────────────── */

router.post("/karaoke/suggest-tracks", requireAuth, async (req, res) => {
  const { theme, count = 6 } = req.body as { theme?: string; count?: number };
  if (!theme?.trim()) { res.status(400).json({ error: "theme obbligatorio" }); return; }

  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) { res.status(500).json({ error: "OpenAI non configurato" }); return; }

  const prompt = `Sei un esperto musicale per serate karaoke italiane. Per il tema "${theme.trim()}", suggerisci esattamente ${count} brani perfetti per karaoke.
Rispondi SOLO con un array JSON valido senza markdown, senza testo aggiuntivo prima o dopo:
[
  {
    "title": "Titolo canzone",
    "artist": "Artista",
    "category": "pop|rock|dance|classica|anni80|anni90|italiana|internazionale",
    "difficulty": "easy|medium|hard",
    "lyricSnippet": "frase del ritornello più iconico (10-20 parole)",
    "youtubeSearchQuery": "artista titolo canzone karaoke official",
    "chorusStartSeconds": 65,
    "chorusEndSeconds": 95
  }
]
Il campo chorusStartSeconds/chorusEndSeconds indica l'inizio e la fine del ritornello principale (stima in secondi dall'inizio del video ufficiale). Durata target: 30-45 secondi.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      res.status(500).json({ error: `OpenAI error ${response.status}: ${err}` }); return;
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const text = data.choices[0]?.message?.content ?? "[]";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : text) as unknown[];
    res.json(suggestions);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message ?? "Errore AI" });
  }
});

/* ── YouTube download + trim + store ─────────────────────────────────── */

router.post("/karaoke/download-video", requireAuth, async (req, res) => {
  const { youtubeUrl, startSeconds, endSeconds, trackId } = req.body as {
    youtubeUrl?: string; startSeconds?: number; endSeconds?: number; trackId?: string;
  };

  if (!youtubeUrl?.trim()) { res.status(400).json({ error: "youtubeUrl obbligatorio" }); return; }
  if (startSeconds === undefined || endSeconds === undefined) {
    res.status(400).json({ error: "startSeconds e endSeconds obbligatori" }); return;
  }
  if (endSeconds <= startSeconds) {
    res.status(400).json({ error: "endSeconds deve essere maggiore di startSeconds" }); return;
  }

  const tmpDir = await mkdtemp(join(os.tmpdir(), "ytdlp-"));
  const videoPath = join(tmpDir, "video.mp4");
  const trimmedPath = join(tmpDir, "trimmed.mp4");

  try {
    await execFileAsync(YT_DLP, [
      "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
      "--merge-output-format", "mp4",
      "-o", videoPath,
      "--no-playlist",
      "--no-warnings",
      youtubeUrl.trim(),
    ], { timeout: 180_000 });

    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-ss", String(startSeconds),
      "-to", String(endSeconds),
      "-c:v", "libx264", "-c:a", "aac",
      "-preset", "fast",
      "-movflags", "+faststart",
      "-y",
      trimmedPath,
    ], { timeout: 120_000 });

    const buffer = await readFile(trimmedPath);
    const objectPath = await uploadBufferToStorage(buffer, "video/mp4", "mp4");
    const mediaUrl = `/api/storage/objects/uploads/${objectPath.split("/").pop()}`;

    if (trackId) {
      await db
        .update(karaokeTracksTable)
        .set({ audioUrl: mediaUrl, durationSeconds: Math.round(endSeconds - startSeconds) })
        .where(eq(karaokeTracksTable.id, trackId));
    }

    res.json({ objectPath, mediaUrl, durationSeconds: Math.round(endSeconds - startSeconds) });
  } catch (e) {
    const msg = (e as Error).message ?? "Download fallito";
    res.status(500).json({ error: msg });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

/* ── Session: init (select playlist) ────────────────────────────────── */

router.post("/karaoke/sessions/:id/init", requireAuth, async (req, res) => {
  const sessionId = req.params.id as string;
  const { setId } = req.body as { setId: string };
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }

  const [ksSet] = await db.select().from(karaokeSetsTable).where(eq(karaokeSetsTable.id, setId)).limit(1);
  if (!ksSet) { res.status(404).json({ error: "Set not found" }); return; }

  const tracks = await db
    .select()
    .from(karaokeTracksTable)
    .where(and(eq(karaokeTracksTable.setId, setId), eq(karaokeTracksTable.isActive, true)))
    .orderBy(asc(karaokeTracksTable.orderIndex));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Session not found" }); return; }

  const teams = await db
    .select({ id: teamsTable.id, name: teamsTable.name, color: teamsTable.color })
    .from(teamsTable)
    .where(eq(teamsTable.eventId, eventId));

  const firstTrack = tracks[0] ?? null;
  const initialState: KaraokeState = {
    setId,
    setName: ksSet.title,
    currentTrack: firstTrack
      ? {
          id: firstTrack.id,
          title: firstTrack.title,
          artist: firstTrack.artist,
          lyricSnippet: firstTrack.lyricSnippet,
          audioUrl: firstTrack.audioUrl,
          durationSeconds: firstTrack.durationSeconds,
          points: firstTrack.points,
          category: firstTrack.category,
          difficulty: firstTrack.difficulty,
        }
      : null,
    bookings: [],
    teams: teams.map((t) => ({ ...t, score: 0 })),
    status: "idle",
    trackStartedAt: null,
    usedTrackIds: [],
  };

  // Upsert karaoke session
  const existing = await getKaraokeSession(sessionId);
  let ksRow: typeof karaokeSessionsTable.$inferSelect;
  if (existing) {
    [ksRow] = await db
      .update(karaokeSessionsTable)
      .set({ setId, state: initialState, updatedAt: new Date() })
      .where(eq(karaokeSessionsTable.sessionId, sessionId))
      .returning();
    // Clear old bookings
    await db.delete(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, existing.id));
  } else {
    [ksRow] = await db
      .insert(karaokeSessionsTable)
      .values({ sessionId, setId, state: initialState })
      .returning();
  }

  const fullState = await buildState(ksRow, [], eventId);
  emit(eventId, "karaoke:started", { state: fullState });
  res.json(fullState);
});

/* ── Session: get state (public) ─────────────────────────────────────── */

router.get("/karaoke/sessions/:id/state", loadUser, async (req, res) => {
  const sessionId = req.params.id;
  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }
  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState(ks, bookings, eventId);
  res.json(fullState);
});

/* ── Session: next track ─────────────────────────────────────────────── */

router.post("/karaoke/sessions/:id/next-track", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  const state = ks.state as KaraokeState;
  const usedIds = [...(state.usedTrackIds ?? [])];
  if (state.currentTrack) usedIds.push(state.currentTrack.id);

  // Get available tracks
  const tracks = await db
    .select()
    .from(karaokeTracksTable)
    .where(and(eq(karaokeTracksTable.setId, ks.setId!), eq(karaokeTracksTable.isActive, true)))
    .orderBy(asc(karaokeTracksTable.orderIndex));

  const available = tracks.filter((t) => !usedIds.includes(t.id));
  const nextTrack = available[0] ?? null;

  const newState: KaraokeState = {
    ...state,
    currentTrack: nextTrack
      ? {
          id: nextTrack.id, title: nextTrack.title, artist: nextTrack.artist,
          lyricSnippet: nextTrack.lyricSnippet, audioUrl: nextTrack.audioUrl,
          durationSeconds: nextTrack.durationSeconds, points: nextTrack.points,
          category: nextTrack.category, difficulty: nextTrack.difficulty,
        }
      : null,
    usedTrackIds: usedIds,
    trackStartedAt: null,
    status: nextTrack ? "idle" : "ended",
  };

  await saveState(ks.id, newState);

  // Reset active bookings for this track
  await db
    .update(karaokeBookingsTable)
    .set({ status: "completed" })
    .where(and(eq(karaokeBookingsTable.sessionId, ks.id), eq(karaokeBookingsTable.status, "active")));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState({ ...ks, state: newState }, bookings, eventId);

  emit(eventId, "karaoke:track_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: start track (set timer) ───────────────────────────────── */

router.post("/karaoke/sessions/:id/start-track", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  const state = ks.state as KaraokeState;
  const newState: KaraokeState = { ...state, status: "singing", trackStartedAt: new Date().toISOString() };
  await saveState(ks.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState({ ...ks, state: newState }, bookings, eventId);

  emit(eventId, "karaoke:track_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: book (player wants to sing) ───────────────────────────── */

router.post("/karaoke/sessions/:id/book", loadUser, async (req, res) => {
  const sessionId = req.params.id;
  const { playerId } = req.body as { playerId: string };
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }

  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  // Check not already booked
  const existing = await db
    .select()
    .from(karaokeBookingsTable)
    .where(
      and(
        eq(karaokeBookingsTable.sessionId, ks.id),
        eq(karaokeBookingsTable.playerId, playerId),
        or(eq(karaokeBookingsTable.status, "waiting"), eq(karaokeBookingsTable.status, "active")),
      ),
    )
    .limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Already booked" }); return; }

  // Get player's team
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

  // Count waiting
  const waitingList = await db
    .select()
    .from(karaokeBookingsTable)
    .where(and(eq(karaokeBookingsTable.sessionId, ks.id), eq(karaokeBookingsTable.status, "waiting")));

  const [booking] = await db
    .insert(karaokeBookingsTable)
    .values({
      sessionId: ks.id,
      playerId,
      teamId: player?.teamId ?? null,
      status: "waiting",
      orderIndex: waitingList.length,
    })
    .returning();

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const allBookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState(ks, allBookings, eventId);

  emit(eventId, "karaoke:booking_added", { state: fullState });
  res.status(201).json(booking);
});

/* ── Session: cancel booking ─────────────────────────────────────────── */

router.post("/karaoke/sessions/:id/cancel-booking", loadUser, async (req, res) => {
  const sessionId = req.params.id;
  const { bookingId } = req.body as { bookingId: string };
  if (!bookingId) { res.status(400).json({ error: "bookingId required" }); return; }

  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  await db.update(karaokeBookingsTable).set({ status: "skipped" }).where(eq(karaokeBookingsTable.id, bookingId));

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState(ks, bookings, eventId);

  emit(eventId, "karaoke:booking_removed", { state: fullState });
  res.json({ ok: true });
});

/* ── Session: set active singer ──────────────────────────────────────── */

router.post("/karaoke/sessions/:id/set-singer", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const { bookingId } = req.body as { bookingId: string };
  if (!bookingId) { res.status(400).json({ error: "bookingId required" }); return; }

  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  // Deactivate any previous active
  await db
    .update(karaokeBookingsTable)
    .set({ status: "completed" })
    .where(and(eq(karaokeBookingsTable.sessionId, ks.id), eq(karaokeBookingsTable.status, "active")));

  // Activate selected
  await db.update(karaokeBookingsTable).set({ status: "active" }).where(eq(karaokeBookingsTable.id, bookingId));

  // Start track timer
  const state = ks.state as KaraokeState;
  const newState: KaraokeState = { ...state, status: "singing", trackStartedAt: new Date().toISOString() };
  await saveState(ks.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState({ ...ks, state: newState }, bookings, eventId);

  emit(eventId, "karaoke:active_singer_changed", { state: fullState });
  res.json(fullState);
});

/* ── Session: assign score ───────────────────────────────────────────── */

router.post("/karaoke/sessions/:id/score", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const { teamId, points } = req.body as { teamId: string; points: number };
  if (!teamId || points === undefined) { res.status(400).json({ error: "teamId and points required" }); return; }

  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  const state = ks.state as KaraokeState;
  const newTeams = (state.teams ?? []).map((t) =>
    t.id === teamId ? { ...t, score: t.score + points } : t,
  );
  const newState: KaraokeState = { ...state, teams: newTeams };
  await saveState(ks.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState({ ...ks, state: newState }, bookings, eventId);

  emit(eventId, "karaoke:score_updated", { state: fullState });
  res.json(fullState);
});

/* ── Session: end ────────────────────────────────────────────────────── */

router.post("/karaoke/sessions/:id/end", requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const ks = await getKaraokeSession(sessionId);
  if (!ks) { res.status(404).json({ error: "Session not found" }); return; }

  const state = ks.state as KaraokeState;
  const newState: KaraokeState = { ...state, status: "ended" };
  await saveState(ks.id, newState);

  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) { res.status(404).json({ error: "Event not found" }); return; }
  const bookings = await db.select().from(karaokeBookingsTable).where(eq(karaokeBookingsTable.sessionId, ks.id)).orderBy(asc(karaokeBookingsTable.orderIndex));
  const fullState = await buildState({ ...ks, state: newState }, bookings, eventId);

  emit(eventId, "karaoke:ended", { state: fullState });
  res.json(fullState);
});

export default router;
