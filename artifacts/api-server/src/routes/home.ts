/**
 * HOME MODE routes — no auth required.
 * Modalità Home: una sessione, 8 giochi in sequenza, contenuto pre-caricato dal DB.
 *
 * Flusso:
 *   POST /home/sessions                    — crea sessione
 *   GET  /home/sessions/:id                — stato sessione (polling)
 *   GET  /home/sessions/by-code/:code      — lookup by join code
 *   POST /home/sessions/:id/join           — giocatore si unisce
 *   POST /home/sessions/:id/ready          — TV: passa da join → board
 *   POST /home/sessions/:id/select-game    — TV: inizia uno dei 8 giochi (carica contenuto DB)
 *   POST /home/sessions/:id/next           — avanza round (o chiude gioco → board)
 *   POST /home/sessions/:id/end-game       — forza fine gioco corrente → torna a board
 *   POST /home/sessions/:id/flip           — flip carta (gioco-coppie)
 *   POST /home/sessions/:id/score          — aggiorna punti giocatore
 *   POST /home/sessions/:id/champion       — fine di tutti i giochi → champion screen
 *   DELETE /home/sessions/:id              — elimina sessione
 */

import { Router, type IRouter } from "express";
import { eq, and, asc, desc } from "drizzle-orm";
import {
  db,
  homeSessionsTable,
  homePlayersTable,
  // Percorso
  laughingPathSetsTable,
  laughingPathStepsTable,
  // Coppie
  cardSetsTable,
  cardsTable,
  // Quiz
  quizPacksTable,
  // SaraMusica
  saraMusicaSetsTable,
  saraMusicaTracksTable,
  // Adult Only
  adultOnlyDecksTable,
  adultOnlyCardsTable,
  // Ballo
  danceChallengesTable,
  // WordBack
  wordBackSetsTable,
  wordBackCardsTable,
  // Karaoke
  karaokeSetsTable,
  karaokeTracksTable,
  // Freestyle
  freestyleSetsTable,
  freestyleWordsTable,
} from "@workspace/db";
import { emitToRoom } from "../socket";

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

// ── Coppie card types ─────────────────────────────────────────────────────────
interface CoppieCard {
  id: string;
  text: string;
  imageUrl?: string;
  pairId: number;
  flipped: boolean;
  matched: boolean;
}
interface CoppiePayload {
  mode: "home-coppie";
  roundIndex: number;
  category: string;
  cards: CoppieCard[];
  currentFlipped: string[];
  matchedPairs: number;
  totalPairs: number;
  points: number;
  lastFlippedBy: string | null;
  timeLimit: number;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RoundPayload = Record<string, unknown>;

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── DB Content Loaders (one per game) ────────────────────────────────────────

/** 1. Percorso a Risate — carica step dal DB */
async function loadPercorsoRounds(): Promise<RoundPayload[]> {
  const [set] = await db.select().from(laughingPathSetsTable)
    .orderBy(desc(laughingPathSetsTable.createdAt)).limit(1);
  if (!set) return fallbackPercorso();

  const steps = await db.select().from(laughingPathStepsTable)
    .where(and(eq(laughingPathStepsTable.setId, set.id), eq(laughingPathStepsTable.isActive, true)))
    .orderBy(asc(laughingPathStepsTable.orderIndex));

  if (steps.length === 0) return fallbackPercorso();

  return steps.map((s, i) => ({
    mode: "home-percorso",
    roundIndex: i,
    setName: set.name,
    challengeType: s.challengeType ?? "sfida",
    title: s.title,
    description: s.description,
    points: s.points ?? 150,
    timeLimit: s.timeLimit ?? 60,
    timerStartedAt: null,
  }));
}

function fallbackPercorso(): RoundPayload[] {
  const challenges = [
    { title: "Mimo Classico", description: "Mimare una parola senza parlare — tutti devono indovinare!", type: "mimo" },
    { title: "Domanda di Gruppo", description: "Risposta collettiva: chi sa di più vince i punti!", type: "domanda" },
    { title: "Sfida Fisica", description: "Tutti in piedi! Chi regge più a lungo vince!", type: "sfida" },
  ];
  return challenges.map((c, i) => ({
    mode: "home-percorso", roundIndex: i, challengeType: c.type,
    title: c.title, description: c.description, points: 150, timeLimit: 60, timerStartedAt: null,
  }));
}

/** 2. Gioco delle Coppie — carica carte dal DB */
async function loadCoppieRound(roundIndex: number): Promise<CoppiePayload> {
  const sets = await db.select().from(cardSetsTable).orderBy(desc(cardSetsTable.createdAt));
  // Pick set by cycling through available sets
  const set = sets[roundIndex % Math.max(sets.length, 1)] ?? sets[0];
  if (!set) return buildCoppiePayload([], roundIndex, "Coppie");

  const cards = await db.select().from(cardsTable)
    .where(eq(cardsTable.cardSetId, set.id))
    .orderBy(asc(cardsTable.createdAt));

  // Group by pairId — each pair has 2 cards with same pairId (text field)
  const pairMap = new Map<string, typeof cards>();
  for (const c of cards) {
    const pid = c.pairId ?? c.id; // fallback: each card is its own pair
    if (!pairMap.has(pid)) pairMap.set(pid, []);
    pairMap.get(pid)!.push(c);
  }

  // Extract text from prompts JSONB (try 'it' locale, then first key)
  function cardText(c: (typeof cards)[0]): string {
    const p = c.prompts as Record<string, string> | null;
    if (!p) return "?";
    return p["it"] ?? p["en"] ?? Object.values(p)[0] ?? "?";
  }

  const pairs: { a: string; b: string; imageA?: string; imageB?: string }[] = [];
  for (const [, group] of pairMap) {
    if (group.length >= 2) {
      pairs.push({ a: cardText(group[0]!), b: cardText(group[1]!), imageA: group[0]!.imageUrl ?? undefined, imageB: group[1]!.imageUrl ?? undefined });
    } else if (group.length === 1) {
      pairs.push({ a: cardText(group[0]!), b: "?", imageA: group[0]!.imageUrl ?? undefined });
    }
  }

  if (pairs.length === 0) {
    return buildCoppiePayload([
      { a: "Roma", b: "Colosseo" }, { a: "Milano", b: "Duomo" },
      { a: "Venezia", b: "Gondola" }, { a: "Napoli", b: "Pizza" },
    ], roundIndex, set.name);
  }

  return buildCoppiePayload(pairs, roundIndex, set.name);
}

function buildCoppiePayload(
  pairs: { a: string; b: string; imageA?: string; imageB?: string }[],
  roundIndex: number,
  category: string,
): CoppiePayload {
  const coppieCards: CoppieCard[] = shuffleArr([
    ...pairs.map((p, i) => ({ id: `a${i}`, text: p.a, imageUrl: p.imageA, pairId: i, flipped: false, matched: false })),
    ...pairs.map((p, i) => ({ id: `b${i}`, text: p.b, imageUrl: p.imageB, pairId: i, flipped: false, matched: false })),
  ]);
  return {
    mode: "home-coppie",
    roundIndex,
    category,
    cards: coppieCards,
    currentFlipped: [],
    matchedPairs: 0,
    totalPairs: pairs.length,
    points: 150,
    lastFlippedBy: null,
    timeLimit: 180,
  };
}

/** 3. Quizzone — carica domande dal DB (quiz_packs) */
async function loadQuizRounds(): Promise<RoundPayload[]> {
  const [pack] = await db.select().from(quizPacksTable)
    .where(eq(quizPacksTable.status, "generated"))
    .orderBy(desc(quizPacksTable.createdAt)).limit(1);

  if (!pack || !Array.isArray(pack.generatedJson)) return fallbackQuiz();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions = pack.generatedJson as any[];
  return questions.map((q, i) => ({
    mode: "home-quiz",
    roundIndex: i,
    category: pack.title ?? "Quiz",
    question: q.question ?? `Domanda ${i + 1}`,
    answers: q.answers ?? ["A", "B", "C", "D"],
    correctIndex: q.correctIndex ?? q.correct_index ?? 0,
    explanation: q.explanation ?? q.jonnyLine ?? "",
    points: q.points ?? 200,
    timeLimit: q.timeLimit ?? q.time_limit ?? 15,
    questionStartedAt: null,
    revealed: false,
  }));
}

function fallbackQuiz(): RoundPayload[] {
  return [
    { mode: "home-quiz", roundIndex: 0, category: "Quiz", question: "Chi era il sindaco di Gotham City?", answers: ["Batman", "Robin", "James Gordon", "Il Pinguino"], correctIndex: 2, explanation: "James Gordon era il commissario di polizia!", points: 200, timeLimit: 15, revealed: false },
  ];
}

/** 4. SaraMusica — carica tracce dal DB */
async function loadSaraMusicaRounds(): Promise<RoundPayload[]> {
  const [set] = await db.select().from(saraMusicaSetsTable)
    .where(eq(saraMusicaSetsTable.isActive, true))
    .orderBy(desc(saraMusicaSetsTable.createdAt)).limit(1);
  if (!set) return fallbackSaraMusica();

  const tracks = await db.select().from(saraMusicaTracksTable)
    .where(and(eq(saraMusicaTracksTable.setId, set.id), eq(saraMusicaTracksTable.isActive, true)))
    .orderBy(asc(saraMusicaTracksTable.orderIndex));

  if (tracks.length === 0) return fallbackSaraMusica();

  return tracks.map((t, i) => ({
    mode: "home-saramusica",
    roundIndex: i,
    setName: set.title,
    title: t.title,
    artist: t.artist ?? "",
    challengeType: t.challengeType ?? "indovina",
    snippetHint: t.snippetHint ?? "",
    audioUrl: t.audioUrl ?? null,
    durationSeconds: t.durationSeconds ?? 30,
    points: t.points ?? 100,
    revealed: false,
  }));
}

function fallbackSaraMusica(): RoundPayload[] {
  return [
    { mode: "home-saramusica", roundIndex: 0, setName: "SaraMusica", title: "Under Pressure", artist: "Queen & David Bowie", snippetHint: "Un classico degli anni '80 su un tema molto pesante...", audioUrl: null, durationSeconds: 30, points: 150, revealed: false },
  ];
}

/** 5. Adult Only — carica carte dal DB */
async function loadAdultOnlyRounds(): Promise<RoundPayload[]> {
  const [deck] = await db.select().from(adultOnlyDecksTable)
    .orderBy(desc(adultOnlyDecksTable.createdAt)).limit(1);
  if (!deck) return fallbackAdultOnly();

  const cards = await db.select().from(adultOnlyCardsTable)
    .where(and(eq(adultOnlyCardsTable.deckId, deck.id), eq(adultOnlyCardsTable.isActive, true)))
    .orderBy(asc(adultOnlyCardsTable.orderIndex));

  if (cards.length === 0) return fallbackAdultOnly();

  return shuffleArr(cards).map((c, i) => ({
    mode: "home-adult",
    roundIndex: i,
    deckName: deck.name,
    title: c.title,
    body: c.body,
    category: c.category ?? "",
    points: c.points ?? 150,
    timeLimit: c.timeLimit ?? 90,
    level: c.level ?? "medium",
    revealed: false,
  }));
}

function fallbackAdultOnly(): RoundPayload[] {
  return [
    { mode: "home-adult", roundIndex: 0, deckName: "Adult Only", title: "La confessione", body: "Racconta una storia imbarazzante del tuo passato — deve essere vera!", category: "confessioni", points: 150, timeLimit: 90, revealed: false },
  ];
}

/** 6. Sfida di Ballo — carica dance_challenges dal DB */
async function loadBalloRounds(): Promise<RoundPayload[]> {
  const challenges = await db.select().from(danceChallengesTable)
    .orderBy(desc(danceChallengesTable.createdAt));

  if (challenges.length === 0) return fallbackBallo();

  return shuffleArr(challenges).map((c, i) => ({
    mode: "home-ballo",
    roundIndex: i,
    name: c.name,
    description: c.description,
    duration: c.duration ?? 60,
    musicHint: c.musicHint ?? "",
    difficulty: c.difficulty ?? "medium",
    startedAt: null,
  }));
}

function fallbackBallo(): RoundPayload[] {
  return [
    { mode: "home-ballo", roundIndex: 0, name: "Sfida Freestyle", description: "Balla liberamente per 60 secondi — più energia hai, meglio è!", duration: 60, musicHint: "", startedAt: null },
    { mode: "home-ballo", roundIndex: 1, name: "La Coreografia", description: "Inventate insieme una coreografia di 8 passi che tutti devono ripetere!", duration: 90, musicHint: "", startedAt: null },
  ];
}

/** 7. Parola alle Spalle — carica word_back_cards dal DB */
async function loadWordBackRounds(): Promise<RoundPayload[]> {
  const [set] = await db.select().from(wordBackSetsTable)
    .where(eq(wordBackSetsTable.isActive, true))
    .orderBy(desc(wordBackSetsTable.createdAt)).limit(1);
  if (!set) return fallbackWordBack();

  const cards = await db.select().from(wordBackCardsTable)
    .where(and(eq(wordBackCardsTable.setId, set.id), eq(wordBackCardsTable.isActive, true)))
    .orderBy(asc(wordBackCardsTable.orderIndex));

  if (cards.length === 0) return fallbackWordBack();

  return shuffleArr(cards).map((c, i) => ({
    mode: "home-wordback",
    roundIndex: i,
    setName: set.title,
    word: c.word,
    hint: c.hint ?? "",
    category: c.category ?? "",
    difficulty: c.difficulty ?? "medium",
    points: c.points ?? 150,
    timeLimit: c.timeLimit ?? 45,
    guessed: false,
  }));
}

function fallbackWordBack(): RoundPayload[] {
  const words = ["Pizza", "Vespa", "Gelato", "Spaghetti", "Mandolino", "Colosseo"];
  return words.map((w, i) => ({
    mode: "home-wordback", roundIndex: i, setName: "Classici Italiani",
    word: w, hint: "", category: "italiani", difficulty: "easy", points: 150, timeLimit: 45, guessed: false,
  }));
}

/** 8. Karaoke Battle (include Freestyle alternato) — carica tracce + parole */
async function loadKaraokeRounds(): Promise<RoundPayload[]> {
  const [kset] = await db.select().from(karaokeSetsTable)
    .where(eq(karaokeSetsTable.isActive, true))
    .orderBy(desc(karaokeSetsTable.createdAt)).limit(1);

  const [fset] = await db.select().from(freestyleSetsTable)
    .where(eq(freestyleSetsTable.isActive, true))
    .orderBy(desc(freestyleSetsTable.createdAt)).limit(1);

  const kTracks = kset ? await db.select().from(karaokeTracksTable)
    .where(and(eq(karaokeTracksTable.setId, kset.id), eq(karaokeTracksTable.isActive, true)))
    .orderBy(asc(karaokeTracksTable.orderIndex)) : [];

  const fWords = fset ? await db.select().from(freestyleWordsTable)
    .where(and(eq(freestyleWordsTable.setId, fset.id), eq(freestyleWordsTable.isActive, true)))
    .orderBy(asc(freestyleWordsTable.orderIndex)) : [];

  const rounds: RoundPayload[] = [];
  const maxK = Math.min(kTracks.length, 8);
  const maxF = Math.min(fWords.length, 6);

  // Alternate: 2 karaoke → 1 freestyle → repeat
  const kShuffled = shuffleArr(kTracks).slice(0, maxK);
  const fShuffled = shuffleArr(fWords).slice(0, maxF);
  let ki = 0, fi = 0, roundIndex = 0;

  while (ki < kShuffled.length || fi < fShuffled.length) {
    // 2 karaoke
    for (let n = 0; n < 2 && ki < kShuffled.length; n++, ki++) {
      const t = kShuffled[ki]!;
      rounds.push({
        mode: "home-karaoke",
        roundIndex: roundIndex++,
        setName: kset?.title ?? "Karaoke",
        title: t.title,
        artist: t.artist ?? "",
        lyricSnippet: t.lyricSnippet ?? "",
        audioUrl: t.audioUrl ?? null,
        durationSeconds: t.durationSeconds ?? 60,
        points: t.points ?? 150,
        category: t.category ?? "",
        started: false,
      });
    }
    // 1 freestyle
    if (fi < fShuffled.length) {
      const w = fShuffled[fi++]!;
      rounds.push({
        mode: "home-freestyle",
        roundIndex: roundIndex++,
        setName: fset?.title ?? "Freestyle",
        word: w.word,
        timeLimit: 30,
        points: 200,
        started: false,
      });
    }
  }

  if (rounds.length === 0) return fallbackKaraoke();
  return rounds;
}

function fallbackKaraoke(): RoundPayload[] {
  return [
    { mode: "home-karaoke", roundIndex: 0, setName: "Karaoke", title: "Azzurro", artist: "Adriano Celentano", lyricSnippet: "Azzurro, il pomeriggio è troppo azzurro e lungo per me...", audioUrl: null, durationSeconds: 60, points: 150, started: false },
    { mode: "home-freestyle", roundIndex: 1, setName: "Freestyle", word: "Amore", timeLimit: 30, points: 200, started: false },
  ];
}

// ── Master game loader ─────────────────────────────────────────────────────────

async function loadGameRounds(gameSlug: string): Promise<RoundPayload[]> {
  switch (gameSlug) {
    case "percorso-a-risate":    return loadPercorsoRounds();
    case "gioco-coppie":         return [(await loadCoppieRound(0)) as RoundPayload];
    case "quizzone":             return loadQuizRounds();
    case "saramusica":           return loadSaraMusicaRounds();
    case "adult-only":           return loadAdultOnlyRounds();
    case "sfida-ballo":          return loadBalloRounds();
    case "parola-alle-spalle":   return loadWordBackRounds();
    case "karaoke-battle":       return loadKaraokeRounds();
    default:                     return loadQuizRounds();
  }
}

// ── POST /home/sessions ────────────────────────────────────────────────────────
router.post("/home/sessions", async (req, res): Promise<void> => {
  const hostName = String(req.body?.hostName ?? "Casa").slice(0, 50);

  let joinCode = makeJoinCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: homeSessionsTable.id })
      .from(homeSessionsTable).where(eq(homeSessionsTable.joinCode, joinCode));
    if (!existing) break;
    joinCode = makeJoinCode();
  }

  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const [session] = await db.insert(homeSessionsTable).values({
    joinCode,
    hostName,
    expiresAt,
    gameConfig: { phase: "join", gamesPlayed: [], preloadedRounds: [] },
  }).returning();

  res.status(201).json(session);
});

// ── GET /home/sessions/by-code/:code ──────────────────────────────────────────
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

// ── GET /home/sessions/:id ─────────────────────────────────────────────────────
router.get("/home/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const players = await getPlayers(session.id);
  res.json({ session, players });
});

// ── POST /home/sessions/:id/join ───────────────────────────────────────────────
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

  const dup = existingPlayers.find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
  if (dup) { res.status(409).json({ error: "Nickname già in uso" }); return; }

  const avatarColor = AVATAR_COLORS[existingPlayers.length % AVATAR_COLORS.length];
  const [player] = await db.insert(homePlayersTable).values({ sessionId: id, nickname, avatarColor }).returning();

  await broadcastState(id);
  res.status(201).json(player);
});

// ── POST /home/sessions/:id/ready — pass to game-board ─────────────────────────
router.post("/home/sessions/:id/ready", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const updated_cfg = { ...cfg, phase: "board" };

  const [updated] = await db.update(homeSessionsTable)
    .set({ gameConfig: updated_cfg })
    .where(eq(homeSessionsTable.id, id)).returning();

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:board", { session: updated, players });
  res.json({ session: updated, players });
});

// ── POST /home/sessions/:id/select-game — avvia un gioco, carica contenuto DB ──
router.post("/home/sessions/:id/select-game", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status === "ended") { res.status(409).json({ error: "Sessione terminata" }); return; }

  const { gameSlug } = req.body as { gameSlug: string };
  if (!gameSlug) { res.status(400).json({ error: "gameSlug obbligatorio" }); return; }

  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const gamesPlayed = (cfg.gamesPlayed as string[]) ?? [];
  if (gamesPlayed.includes(gameSlug)) {
    res.status(409).json({ error: "Gioco già completato" }); return;
  }

  // Load all rounds from DB for this game
  const preloadedRounds = await loadGameRounds(gameSlug);
  const firstRound = preloadedRounds[0] ?? {};

  const newCfg = {
    ...cfg,
    phase: "playing",
    gamesPlayed,
    preloadedRounds,
  };

  const [updated] = await db.update(homeSessionsTable).set({
    gameSlug,
    gameConfig: newCfg,
    status: "playing",
    currentRound: 0,
    totalRounds: preloadedRounds.length,
    roundPayload: firstRound,
  }).where(eq(homeSessionsTable.id, id)).returning();

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:game_started", { session: updated, players, payload: firstRound });
  emitToRoom(homeRoom(id), "home:round", { round: 0, payload: firstRound });
  res.json({ session: updated, players });
});

// Backward compat: /start → select-game
router.post("/home/sessions/:id/start", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  const body = req.body as { gameSlug?: string; gameConfig?: Record<string, unknown>; totalRounds?: number };

  // Inject into req.body for select-game handler reuse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).body = { gameSlug: body.gameSlug ?? "quizzone" };

  // Forward to select-game logic manually
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const gameSlug = body.gameSlug ?? "quizzone";
  const preloadedRounds = await loadGameRounds(gameSlug);
  const firstRound = preloadedRounds[0] ?? {};
  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const gamesPlayed = (cfg.gamesPlayed as string[]) ?? [];

  const newCfg = { ...cfg, phase: "playing", gamesPlayed, preloadedRounds };
  const [updated] = await db.update(homeSessionsTable).set({
    gameSlug, gameConfig: newCfg, status: "playing",
    currentRound: 0, totalRounds: preloadedRounds.length, roundPayload: firstRound,
  }).where(eq(homeSessionsTable.id, id)).returning();

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:game_started", { session: updated, players, payload: firstRound });
  emitToRoom(homeRoom(id), "home:round", { round: 0, payload: firstRound });
  res.json(updated);
});

// ── POST /home/sessions/:id/next ───────────────────────────────────────────────
router.post("/home/sessions/:id/next", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }

  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const preloadedRounds = (cfg.preloadedRounds as RoundPayload[]) ?? [];
  const gamesPlayed = (cfg.gamesPlayed as string[]) ?? [];
  const nextRound = session.currentRound + 1;

  if (nextRound >= session.totalRounds) {
    // This game is over — return to board
    const slug = session.gameSlug ?? "";
    const newGamesPlayed = slug && !gamesPlayed.includes(slug) ? [...gamesPlayed, slug] : gamesPlayed;

    // Snapshot current scores per game
    const players = await getPlayers(id);
    const gameScoreSnapshot = (cfg.gameScores ?? {}) as Record<string, Record<string, number>>;
    if (slug) {
      gameScoreSnapshot[slug] = Object.fromEntries(players.map(p => [p.id, p.score]));
    }

    const newCfg = {
      ...cfg,
      phase: "board",
      gamesPlayed: newGamesPlayed,
      gameScores: gameScoreSnapshot,
      preloadedRounds: [],
    };

    const [ended] = await db.update(homeSessionsTable).set({
      status: "lobby",
      gameSlug: null,
      gameConfig: newCfg,
      roundPayload: {},
    }).where(eq(homeSessionsTable.id, id)).returning();

    emitToRoom(homeRoom(id), "home:game_ended", { session: ended, players, gameSlug: slug });
    res.json({ gameEnded: true, session: ended, players });
    return;
  }

  // Next round within current game
  const nextPayload = preloadedRounds[nextRound] ?? { mode: "unknown", roundIndex: nextRound };

  const [updated] = await db.update(homeSessionsTable).set({
    currentRound: nextRound,
    roundPayload: nextPayload,
  }).where(eq(homeSessionsTable.id, id)).returning();

  emitToRoom(homeRoom(id), "home:round", { round: nextRound, payload: nextPayload });
  await broadcastState(id);
  res.json({ gameEnded: false, session: updated, payload: nextPayload });
});

// ── POST /home/sessions/:id/end-game — forza fine gioco corrente ───────────────
router.post("/home/sessions/:id/end-game", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const gamesPlayed = (cfg.gamesPlayed as string[]) ?? [];
  const slug = session.gameSlug ?? "";
  const newGamesPlayed = slug && !gamesPlayed.includes(slug) ? [...gamesPlayed, slug] : gamesPlayed;

  const players = await getPlayers(id);
  const gameScoreSnapshot = (cfg.gameScores ?? {}) as Record<string, Record<string, number>>;
  if (slug) {
    gameScoreSnapshot[slug] = Object.fromEntries(players.map(p => [p.id, p.score]));
  }

  const newCfg = { ...cfg, phase: "board", gamesPlayed: newGamesPlayed, gameScores: gameScoreSnapshot, preloadedRounds: [] };

  const [updated] = await db.update(homeSessionsTable).set({
    status: "lobby",
    gameSlug: null,
    gameConfig: newCfg,
    roundPayload: {},
  }).where(eq(homeSessionsTable.id, id)).returning();

  emitToRoom(homeRoom(id), "home:game_ended", { session: updated, players, gameSlug: slug });
  res.json({ session: updated, players });
});

// ── POST /home/sessions/:id/score ──────────────────────────────────────────────
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
  }).where(and(eq(homePlayersTable.id, playerId), eq(homePlayersTable.sessionId, id)));

  await broadcastState(id);
  res.json({ ok: true });
});

// ── POST /home/sessions/:id/flip — flip carta (gioco-coppie) ──────────────────
router.post("/home/sessions/:id/flip", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }

  const payload = session.roundPayload as CoppiePayload;
  if (payload.mode !== "home-coppie") { res.status(400).json({ error: "Non è una partita di coppie" }); return; }

  const currentFlipped = payload.currentFlipped ?? [];
  if (currentFlipped.length >= 2) { res.status(409).json({ error: "Aspetta" }); return; }

  const { cardId, playerId } = req.body as { cardId?: string; playerId?: string };
  if (!cardId) { res.status(400).json({ error: "cardId obbligatorio" }); return; }

  const card = payload.cards.find(c => c.id === cardId);
  if (!card) { res.status(404).json({ error: "Carta non trovata" }); return; }
  if (card.flipped || card.matched) { res.status(409).json({ error: "Carta non disponibile" }); return; }

  const newCards = payload.cards.map(c => c.id === cardId ? { ...c, flipped: true } : c);
  const newFlipped = [...currentFlipped, cardId];

  let finalCards = newCards;
  let finalFlipped = newFlipped;
  let newMatchedPairs = payload.matchedPairs;
  let matched = false;

  if (newFlipped.length === 2) {
    const [id1, id2] = newFlipped as [string, string];
    const c1 = newCards.find(c => c.id === id1)!;
    const c2 = newCards.find(c => c.id === id2)!;

    if (c1.pairId === c2.pairId) {
      finalCards = newCards.map(c => [id1, id2].includes(c.id) ? { ...c, matched: true, flipped: false } : c);
      finalFlipped = [];
      newMatchedPairs += 1;
      matched = true;

      if (playerId && isUUID(playerId)) {
        const [p] = await db.select().from(homePlayersTable)
          .where(and(eq(homePlayersTable.id, playerId), eq(homePlayersTable.sessionId, id)));
        if (p) {
          await db.update(homePlayersTable)
            .set({ score: p.score + (payload.points ?? 150) })
            .where(eq(homePlayersTable.id, playerId));
        }
      }
    }
  }

  const newPayload: CoppiePayload = {
    ...payload,
    cards: finalCards,
    currentFlipped: finalFlipped,
    matchedPairs: newMatchedPairs,
    lastFlippedBy: playerId ?? null,
  };

  await db.update(homeSessionsTable).set({ roundPayload: newPayload }).where(eq(homeSessionsTable.id, id));

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:card_flip", { payload: newPayload, matched, playerId: playerId ?? null, players });

  if (newFlipped.length === 2 && !matched) {
    const unflipPayload: CoppiePayload = {
      ...newPayload,
      cards: newPayload.cards.map(c =>
        newFlipped.includes(c.id) && !c.matched ? { ...c, flipped: false } : c
      ),
      currentFlipped: [],
    };
    setTimeout(async () => {
      try {
        await db.update(homeSessionsTable).set({ roundPayload: unflipPayload }).where(eq(homeSessionsTable.id, id));
        const ps = await getPlayers(id);
        emitToRoom(homeRoom(id), "home:card_flip", { payload: unflipPayload, matched: false, playerId: null, players: ps });
      } catch { /* ignore */ }
    }, 1500);
  }

  // Auto-advance when all pairs matched
  if (newMatchedPairs === payload.totalPairs && matched) {
    setTimeout(async () => {
      try {
        // Award all remaining players bonus
        const r = await fetch(`http://localhost:${process.env.PORT ?? 8080}/api/home/sessions/${id}/next`, { method: "POST" });
        if (!r.ok) { /* already ended */ }
      } catch { /* ignore */ }
    }, 2500);
  }

  res.json({ payload: newPayload, matched });
});

// ── POST /home/sessions/:id/champion ──────────────────────────────────────────
router.post("/home/sessions/:id/champion", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const [updated] = await db.update(homeSessionsTable).set({ status: "ended", gameSlug: null })
    .where(eq(homeSessionsTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "Non trovata" }); return; }

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:champion", { session: updated, players });
  emitToRoom(homeRoom(id), "home:ended", { session: updated, players });
  res.json({ session: updated, players });
});

// ── POST /home/sessions/:id/end (legacy) ──────────────────────────────────────
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

// ── DELETE /home/sessions/:id ─────────────────────────────────────────────────
router.delete("/home/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  await db.delete(homeSessionsTable).where(eq(homeSessionsTable.id, id));
  res.json({ ok: true });
});

export default router;
