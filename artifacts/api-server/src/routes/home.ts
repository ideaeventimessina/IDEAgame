/**
 * HOME MODE routes — no auth required.
 * Gestisce sessioni di gioco "casa" (Trivial Pursuit-style) senza tenant/evento reale.
 *
 * Endpoints:
 *   POST   /home/sessions                    — crea sessione (dalla TV)
 *   GET    /home/sessions/:id                — stato sessione (polling)
 *   GET    /home/sessions/by-code/:code      — lookup by join code (da TV/phone)
 *   POST   /home/sessions/:id/join           — giocatore si unisce
 *   POST   /home/sessions/:id/start          — avvia gioco (scegli gioco+config)
 *   POST   /home/sessions/:id/next           — avanza al round successivo (TV o phone skip)
 *   POST   /home/sessions/:id/answer         — giocatore risponde
 *   POST   /home/sessions/:id/end            — fine sessione
 *   DELETE /home/sessions/:id                — elimina sessione
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, homeSessionsTable, homePlayersTable } from "@workspace/db";
import { emitToRoom } from "../socket";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

function makeJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function homeRoom(id: string) { return `home:${id}`; }

async function getSession(id: string) {
  const [s] = await db.select().from(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  return s ?? null;
}

async function getPlayers(sessionId: string) {
  return db.select().from(homePlayersTable).where(eq(homePlayersTable.sessionId, sessionId));
}

async function broadcastState(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) return;
  const players = await getPlayers(sessionId);
  emitToRoom(homeRoom(sessionId), "home:state", { session, players });
}

// ── POST /home/sessions ────────────────────────────────────────────────────
router.post("/home/sessions", async (req, res): Promise<void> => {
  const hostName = String(req.body?.hostName ?? "Casa").slice(0, 50);

  // Retry join code generation until unique
  let joinCode = makeJoinCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: homeSessionsTable.id })
      .from(homeSessionsTable)
      .where(eq(homeSessionsTable.joinCode, joinCode));
    if (!existing) break;
    joinCode = makeJoinCode();
  }

  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 ore
  const [session] = await db.insert(homeSessionsTable).values({
    joinCode,
    hostName,
    expiresAt,
  }).returning();

  res.status(201).json(session);
});

// ── GET /home/sessions/by-code/:code ──────────────────────────────────────
router.get("/home/sessions/by-code/:code", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [session] = await db.select().from(homeSessionsTable)
    .where(eq(homeSessionsTable.joinCode, code));

  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  if (session.status === "ended") { res.status(409).json({ error: "Sessione terminata" }); return; }
  if (new Date() > session.expiresAt) { res.status(409).json({ error: "Sessione scaduta" }); return; }

  const players = await getPlayers(session.id);
  res.json({ session, players });
});

// ── GET /home/sessions/:id ─────────────────────────────────────────────────
router.get("/home/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const players = await getPlayers(session.id);
  res.json({ session, players });
});

// ── POST /home/sessions/:id/join ───────────────────────────────────────────
router.post("/home/sessions/:id/join", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status === "ended") { res.status(409).json({ error: "Sessione terminata" }); return; }

  const nickname = String(req.body?.nickname ?? "").trim().slice(0, 30);
  if (!nickname) { res.status(400).json({ error: "Nickname obbligatorio" }); return; }

  const AVATAR_COLORS = ["#F5B642","#FF69B4","#60A5FA","#A78BFA","#34D399","#F87171","#F472B6","#FB923C","#22D3EE","#4ADE80"];
  const existingPlayers = await getPlayers(id);

  // Prevent duplicate nicknames
  const dup = existingPlayers.find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
  if (dup) { res.status(409).json({ error: "Nickname già in uso" }); return; }

  const avatarColor = AVATAR_COLORS[existingPlayers.length % AVATAR_COLORS.length];

  const [player] = await db.insert(homePlayersTable).values({
    sessionId: id,
    nickname,
    avatarColor,
  }).returning();

  await broadcastState(id);
  res.status(201).json(player);
});

// ── POST /home/sessions/:id/start ──────────────────────────────────────────
router.post("/home/sessions/:id/start", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status === "playing") { res.status(409).json({ error: "Già in corso" }); return; }

  const { gameSlug, gameConfig, totalRounds } = req.body as {
    gameSlug: string;
    gameConfig?: Record<string, unknown>;
    totalRounds?: number;
  };

  if (!gameSlug) { res.status(400).json({ error: "gameSlug obbligatorio" }); return; }

  // Generate first round payload
  const firstRound = await generateRoundPayload(gameSlug, gameConfig ?? {}, 0, totalRounds ?? 10);

  const [updated] = await db.update(homeSessionsTable).set({
    gameSlug,
    gameConfig: gameConfig ?? {},
    status: "playing",
    currentRound: 0,
    totalRounds: totalRounds ?? 10,
    roundPayload: firstRound,
  }).where(eq(homeSessionsTable.id, id)).returning();

  await broadcastState(id);
  emitToRoom(homeRoom(id), "home:round", { round: 0, payload: firstRound });
  res.json(updated);
});

// ── POST /home/sessions/:id/next ───────────────────────────────────────────
router.post("/home/sessions/:id/next", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }

  const nextRound = session.currentRound + 1;

  if (nextRound >= session.totalRounds) {
    // Fine gioco
    const [ended] = await db.update(homeSessionsTable).set({
      status: "ended",
      currentRound: nextRound,
    }).where(eq(homeSessionsTable.id, id)).returning();

    const players = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:ended", { session: ended, players });
    res.json({ ended: true, session: ended });
    return;
  }

  const nextPayload = await generateRoundPayload(
    session.gameSlug ?? "quizzone",
    (session.gameConfig as Record<string, unknown>) ?? {},
    nextRound,
    session.totalRounds,
  );

  const [updated] = await db.update(homeSessionsTable).set({
    currentRound: nextRound,
    roundPayload: nextPayload,
  }).where(eq(homeSessionsTable.id, id)).returning();

  emitToRoom(homeRoom(id), "home:round", { round: nextRound, payload: nextPayload });
  await broadcastState(id);
  res.json({ ended: false, session: updated, payload: nextPayload });
});

// ── POST /home/sessions/:id/score ──────────────────────────────────────────
router.post("/home/sessions/:id/score", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const { playerId, points } = req.body as { playerId: string; points: number };
  if (!playerId || typeof points !== "number") {
    res.status(400).json({ error: "playerId e points obbligatori" }); return;
  }

  await db.update(homePlayersTable).set({
    score: Math.max(0, points),
  }).where(and(
    eq(homePlayersTable.id, playerId),
    eq(homePlayersTable.sessionId, id),
  ));

  await broadcastState(id);
  res.json({ ok: true });
});

// ── POST /home/sessions/:id/end ────────────────────────────────────────────
router.post("/home/sessions/:id/end", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const [updated] = await db.update(homeSessionsTable).set({ status: "ended" })
    .where(eq(homeSessionsTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "Non trovata" }); return; }

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:ended", { session: updated, players });
  res.json(updated);
});

// ── DELETE /home/sessions/:id ─────────────────────────────────────────────
router.delete("/home/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  await db.delete(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  res.json({ ok: true });
});

// ─── AI Round Generator ────────────────────────────────────────────────────

type RoundPayload = Record<string, unknown>;

async function generateRoundPayload(
  gameSlug: string,
  config: Record<string, unknown>,
  roundIndex: number,
  totalRounds: number,
): Promise<RoundPayload> {
  const category = String(config.category ?? "Cultura Generale");
  const difficulty = String(config.difficulty ?? "mixed");

  if (gameSlug === "quizzone") {
    return await generateQuizRound(category, difficulty, roundIndex, totalRounds);
  }
  if (gameSlug === "sfida-ballo" || gameSlug === "sfida-di-ballo") {
    return await generateBalloRound(category, roundIndex);
  }
  if (gameSlug === "percorso-a-risate") {
    return await generatePercorsoRound(category, roundIndex);
  }
  // Fallback — generic trivia
  return await generateQuizRound(category, difficulty, roundIndex, totalRounds);
}

async function generateQuizRound(
  category: string,
  difficulty: string,
  roundIndex: number,
  totalRounds: number,
): Promise<RoundPayload> {
  const diffMap: Record<string, string> = {
    easy: "facile — risposte ovvie per tutti",
    medium: "media — richiede un po' di cultura",
    hard: "difficile — per veri esperti",
    mixed: roundIndex < totalRounds / 3 ? "facile" : roundIndex < (totalRounds * 2) / 3 ? "media" : "difficile",
  };
  const diffLabel = diffMap[difficulty] ?? "media";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{
        role: "user",
        content: `Genera UNA domanda trivia in italiano sulla categoria "${category}" di difficoltà ${diffLabel}.
Rispondi con JSON: {"question":"...","answers":["A","B","C","D"],"correctIndex":0,"explanation":"...","points":${difficulty === 'hard' ? 300 : difficulty === 'easy' ? 100 : 200},"timeLimit":${difficulty === 'hard' ? 20 : 15}}
La risposta corretta deve essere all'indice corretto (non sempre 0). Mischia le risposte.`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    return {
      mode: "home-quiz",
      roundIndex,
      category,
      question: raw.question ?? "Domanda non disponibile",
      answers: raw.answers ?? ["A", "B", "C", "D"],
      correctIndex: raw.correctIndex ?? 0,
      explanation: raw.explanation ?? "",
      points: raw.points ?? 200,
      timeLimit: raw.timeLimit ?? 15,
      questionStartedAt: new Date().toISOString(),
      revealed: false,
    };
  } catch {
    return {
      mode: "home-quiz",
      roundIndex,
      category,
      question: `Domanda ${roundIndex + 1} — ${category}`,
      answers: ["Risposta A", "Risposta B", "Risposta C", "Risposta D"],
      correctIndex: 0,
      explanation: "",
      points: 200,
      timeLimit: 15,
      questionStartedAt: new Date().toISOString(),
      revealed: false,
    };
  }
}

async function generateBalloRound(category: string, roundIndex: number): Promise<RoundPayload> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{
        role: "user",
        content: `Genera UNA sfida di ballo in italiano${category && category !== 'Cultura Generale' ? ` a tema "${category}"` : ''}.
Rispondi con JSON: {"name":"...","description":"...","duration":60,"musicHint":"artista — brano"}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 256,
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    return {
      mode: "home-ballo",
      roundIndex,
      name: raw.name ?? "Sfida di Ballo",
      description: raw.description ?? "Balla per 60 secondi!",
      duration: raw.duration ?? 60,
      musicHint: raw.musicHint ?? "",
      startedAt: null,
    };
  } catch {
    return {
      mode: "home-ballo",
      roundIndex,
      name: "Sfida Freestyle",
      description: "Balla liberamente per 60 secondi — più energia hai, meglio è!",
      duration: 60,
      musicHint: "",
      startedAt: null,
    };
  }
}

async function generatePercorsoRound(category: string, roundIndex: number): Promise<RoundPayload> {
  const TYPES = ["sfida", "domanda", "mimo", "reazione", "fantasia"];
  const challengeType = TYPES[roundIndex % TYPES.length];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{
        role: "user",
        content: `Genera UNA sfida di tipo "${challengeType}" per un gioco di gruppo in italiano${category && category !== 'Cultura Generale' ? ` a tema "${category}"` : ''}.
Rispondi con JSON: {"title":"...","description":"...","points":150,"timeLimit":60}`,
      }],
      response_format: { type: "json_object" },
      max_completion_tokens: 256,
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    return {
      mode: "home-percorso",
      roundIndex,
      challengeType,
      title: raw.title ?? "Sfida",
      description: raw.description ?? "Esegui la sfida!",
      points: raw.points ?? 150,
      timeLimit: raw.timeLimit ?? 60,
      timerStartedAt: null,
    };
  } catch {
    return {
      mode: "home-percorso",
      roundIndex,
      challengeType,
      title: "Sfida di Gruppo",
      description: "Lavorate insieme per completare la sfida!",
      points: 150,
      timeLimit: 60,
      timerStartedAt: null,
    };
  }
}

export default router;
