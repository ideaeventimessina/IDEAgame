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
import multer from "multer";
import OpenAI from "openai";
import { createBlankKaraokeState } from "../lib/karaoke-home-engine.js";
import { generateQuiz, QUIZ_THEMES } from "../lib/quiz-generator.js";
import { generateSaraMusicaRounds, SM_THEMES, type MusicRound } from "../lib/saramusica-generator.js";
import { BOTTLE_LEVELS, pickFromBank, assignSpectatorPowers, type BottleChallenge, type BottleLevel } from "../lib/adult-generator.js";
import { eq, and, or, lt, asc, desc, isNull, notInArray } from "drizzle-orm";
import {
  db,
  homeSessionsTable,
  homePlayersTable,
  systemSettingsTable,
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
  adultBottleChallengesTable,
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
import { emitToRoom, getBalloEnergies, clearBalloEnergies } from "../socket";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

function makeJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function homeRoom(id: string) { return `home:${id}`; }

// In-memory answer tracking for quiz rounds. Map: sessionId → round → playerId → answerIndex.
// Round entries are deleted once the all-answered event fires to avoid re-emitting.
const quizAnswerMap = new Map<string, Map<number, Map<string, number>>>();
// sessionId → round → winnerId (first correct player per round)
const saraMusicaWinnerMap = new Map<string, Map<number, string>>();
// Quizzone: sessionId → questionIndex → playerId → { answerIndex, answeredAt }
const quizzoneAnswerMap = new Map<string, Map<number, Map<string, { answerIndex: number; answeredAt: number }>>>();
// Auto-reveal timers — cleared when all players answer early
const quizzoneRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Fisher-Yates shuffle that tracks where the correct answer moved. */
function shuffleWithCorrectIndex(
  answers: string[],
  correctIndex: number,
): { answers: string[]; correctIndex: number } {
  const arr = [...answers];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  const newCorrect = arr.indexOf(answers[correctIndex] ?? "");
  return { answers: arr, correctIndex: newCorrect >= 0 ? newCorrect : 0 };
}

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

/**
 * Opportunistic cleanup of abandoned Home sessions.
 * lobby  → expire after 2 h of inactivity (updatedAt)
 * playing → expire after 6 h of inactivity
 * ended  → expire after 24 h
 * Players are deleted automatically via ON DELETE CASCADE.
 */
async function cleanupExpiredHomeSessions(): Promise<void> {
  const now = Date.now();
  const twoH  = new Date(now - 2  * 60 * 60 * 1000);
  const sixH  = new Date(now - 6  * 60 * 60 * 1000);
  const dayH  = new Date(now - 24 * 60 * 60 * 1000);
  await Promise.all([
    db.delete(homeSessionsTable).where(and(eq(homeSessionsTable.status, "lobby"),   lt(homeSessionsTable.updatedAt, twoH))),
    db.delete(homeSessionsTable).where(and(eq(homeSessionsTable.status, "playing"), lt(homeSessionsTable.updatedAt, sixH))),
    db.delete(homeSessionsTable).where(and(eq(homeSessionsTable.status, "ended"),   lt(homeSessionsTable.updatedAt, dayH))),
  ]);
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
  themePhase?: 'suggestion' | 'playing';
  proposedThemes?: { id: string; text: string; proposedBy: string }[];
  themeTimerEndsAt?: string | null;
  selectedTheme?: string | null;
  visibilityUsed?: Record<string, boolean>;
  visibilityActiveUntil?: number | null;
  /** Card sets from DB, populated at game start for theme selection UI */
  availableSets?: { id: string; name: string; pairCount: number }[];
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

// 15-item fallback — identical pairs (each word matched with itself)
const FALLBACK_COPPIE_ITEMS: string[] = [
  'Roma','Venezia','Napoli','Firenze','Milano',
  'Sole','Luna','Mare','Pizza','Gelato',
  'Gatto','Vino','Pasta','Musica','Cinema',
];

// Themed word banks — used when players choose a theme
const THEMED_WORD_BANKS: Record<string, string[]> = {
  animali:    ['Leone','Tigre','Elefante','Delfino','Aquila','Volpe','Lupo','Orso','Panda','Gatto','Coccodrillo','Zebra'],
  cibo:       ['Pizza','Pasta','Gelato','Tiramisù','Cappuccino','Bruschetta','Arancino','Cannolo','Risotto','Lasagne','Carbonara','Ossobuco'],
  sport:      ['Calcio','Tennis','Nuoto','Ciclismo','Basket','Sci','Atletica','Boxe','Judo','Vela','Golf','Rugby'],
  cinema:     ['Gladiatore','Titanic','Avatar','Matrix','Inception','Joker','Interstellar','Parasite','Dune','Oppenheimer','Grease','Shrek'],
  musica:     ['Beatles','Bowie','Elvis','Madonna','Jova','Vasco','Lucio','Pino','Mina','Laura','Zucchero','Ramazzotti'],
  colori:     ['Rosso','Blu','Verde','Giallo','Viola','Arancio','Rosa','Marrone','Nero','Bianco','Grigio','Turchese'],
  città:      ['Roma','Milano','Venezia','Napoli','Firenze','Torino','Bologna','Palermo','Genova','Verona','Bari','Cagliari'],
  natura:     ['Sole','Luna','Mare','Montagna','Fiore','Albero','Lago','Cascata','Deserto','Foresta','Vulcano','Ghiacciaio'],
  lavori:     ['Chef','Medico','Pilota','Astronauta','Pompiere','Professore','Scultore','Contadino','Marinaio','Ballerino','Attore','Cuoco'],
  animazioni: ['Simba','Bambi','Nemo','Shrek','Olaf','Stitch','Totoro','Wall-E','Gru','Moana','Elsa','Buzz'],
};

/** 2. Gioco delle Coppie — starts in theme-suggestion phase; cards built after theme chosen */
async function loadCoppieRound(roundIndex: number): Promise<CoppiePayload> {
  // Fetch card sets from DB to show as pre-built theme options on TV
  const sets = await db.select({ id: cardSetsTable.id, name: cardSetsTable.name })
    .from(cardSetsTable).orderBy(desc(cardSetsTable.createdAt)).limit(9);
  const availableSets = sets.map(s => ({ id: s.id, name: s.name, pairCount: 0 }));
  return buildEmptyCoppiePayload(roundIndex, availableSets);
}

function buildEmptyCoppiePayload(roundIndex: number, availableSets: { id: string; name: string; pairCount: number }[] = []): CoppiePayload {
  return {
    mode: "home-coppie",
    themePhase: "suggestion",
    roundIndex,
    category: "",
    cards: [],
    currentFlipped: [],
    matchedPairs: 0,
    totalPairs: 0,
    points: 150,
    lastFlippedBy: null,
    timeLimit: 180,
    proposedThemes: [],
    themeTimerEndsAt: new Date(Date.now() + 25_000).toISOString(),
    selectedTheme: null,
    visibilityUsed: {},
    visibilityActiveUntil: null,
    availableSets,
  };
}

/** Build cards from a word list — identical pairs (same word on both cards) */
function buildCoppieFromWords(words: string[], roundIndex: number, category: string): CoppiePayload {
  const selected = shuffleArr(words).slice(0, 10);
  const coppieCards: CoppieCard[] = shuffleArr([
    ...selected.map((w, i) => ({ id: `a${i}`, text: w, imageUrl: undefined as string | undefined, pairId: i, flipped: false, matched: false })),
    ...selected.map((w, i) => ({ id: `b${i}`, text: w, imageUrl: undefined as string | undefined, pairId: i, flipped: false, matched: false })),
  ]);
  return {
    mode: "home-coppie",
    themePhase: "playing",
    roundIndex,
    category,
    selectedTheme: category,
    cards: coppieCards,
    currentFlipped: [],
    matchedPairs: 0,
    totalPairs: selected.length,
    points: 150,
    lastFlippedBy: null,
    timeLimit: 180,
    proposedThemes: [],
    themeTimerEndsAt: null,
    visibilityUsed: {},
    visibilityActiveUntil: null,
  };
}

/** Build identical pairs from DB card set — uses same image for both cards of a pair */
function buildCoppiePayload(
  pairs: { a: string; b: string; imageA?: string; imageB?: string }[],
  roundIndex: number,
  category: string,
): CoppiePayload {
  // Use at most 10 pairs; identical cards (same text+image on both sides)
  const selected = shuffleArr(pairs).slice(0, 10);
  const coppieCards: CoppieCard[] = shuffleArr([
    ...selected.map((p, i) => ({ id: `a${i}`, text: p.a, imageUrl: p.imageA ?? p.imageB, pairId: i, flipped: false, matched: false })),
    ...selected.map((p, i) => ({ id: `b${i}`, text: p.a, imageUrl: p.imageA ?? p.imageB, pairId: i, flipped: false, matched: false })),
  ]);
  return {
    mode: "home-coppie",
    themePhase: "playing",
    roundIndex,
    category,
    selectedTheme: category,
    cards: coppieCards,
    currentFlipped: [],
    matchedPairs: 0,
    totalPairs: selected.length,
    points: 150,
    lastFlippedBy: null,
    timeLimit: 180,
    proposedThemes: [],
    themeTimerEndsAt: null,
    visibilityUsed: {},
    visibilityActiveUntil: null,
  };
}

/** 3. Quizzone — carica domande dal DB (quiz_packs). Answers are shuffled per round. */
async function loadQuizRounds(): Promise<RoundPayload[]> {
  const [pack] = await db.select().from(quizPacksTable)
    .where(eq(quizPacksTable.status, "generated"))
    .orderBy(desc(quizPacksTable.createdAt)).limit(1);

  if (!pack || !Array.isArray(pack.generatedJson)) return fallbackQuiz();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions = pack.generatedJson as any[];
  return questions.map((q, i) => {
    const rawAnswers: string[] = q.answers ?? ["A", "B", "C", "D"];
    const rawCorrect: number = q.correctAnswer ?? q.correctIndex ?? q.correct_index ?? 0;
    const { answers, correctIndex } = shuffleWithCorrectIndex(rawAnswers, rawCorrect);
    return {
      mode: "home-quiz",
      roundIndex: i,
      category: pack.title ?? "Quiz",
      question: q.questionText ?? q.question ?? `Domanda ${i + 1}`,
      answers,
      correctIndex,
      explanation: q.explanation ?? q.jonnyLine ?? "",
      points: q.points ?? 200,
      timeLimit: q.timeLimit ?? q.time_limit ?? 15,
      questionStartedAt: null,
      revealed: false,
    };
  });
}

function fallbackQuiz(): RoundPayload[] {
  const qs = [
    { question: "Chi era il commissario di Gotham City?",      answers: ["Batman","Robin","James Gordon","Il Pinguino"],   correctIndex: 2, explanation: "James Gordon era il commissario di polizia!" },
    { question: "Quante strisce ha la bandiera italiana?",      answers: ["2","3","4","5"],                                 correctIndex: 1, explanation: "Verde, bianco e rosso: tre strisce verticali!" },
    { question: "Quale pianeta è il più grande del sistema solare?", answers: ["Saturno","Marte","Giove","Nettuno"],      correctIndex: 2, explanation: "Giove è così grande che ci entrerebbero 1.300 Terre!" },
    { question: "In quale città si trova la Torre Eiffel?",    answers: ["Roma","Berlino","Parigi","Madrid"],               correctIndex: 2, explanation: "Parigi, costruita nel 1889 da Gustave Eiffel." },
    { question: "Quante zampe ha un ragno?",                    answers: ["4","6","8","10"],                                correctIndex: 2, explanation: "I ragni hanno sempre 8 zampe, sono aracnidi!" },
    { question: "Qual è la capitale dell'Australia?",          answers: ["Sydney","Melbourne","Brisbane","Canberra"],       correctIndex: 3, explanation: "Molti pensano Sydney, ma la capitale è Canberra!" },
    { question: "Chi ha dipinto la Gioconda?",                 answers: ["Michelangelo","Leonardo da Vinci","Raffaello","Botticelli"], correctIndex: 1, explanation: "Leonardo la dipinse tra il 1503 e il 1519." },
  ];
  return qs.map((q, i) => {
    const { answers, correctIndex } = shuffleWithCorrectIndex(q.answers, q.correctIndex);
    return {
      mode: "home-quiz", roundIndex: i, category: "Quiz",
      question: q.question, answers, correctIndex,
      explanation: q.explanation, points: 200, timeLimit: 15, revealed: false,
    };
  });
}

const SARA_FALLBACK_TITLES = [
  "Bohemian Rhapsody", "Smells Like Teen Spirit", "Hotel California",
  "Sweet Child O' Mine", "Purple Rain", "Like a Prayer", "Billie Jean",
  "Don't Stop Believin'", "Eye of the Tiger", "Africa",
];

/** Build 6 shuffled choices (1 correct + 5 distractors) for a SaraMusica round. */
function buildSaraChoices(correctTitle: string, allTitles: string[]): { choices: string[]; correctChoiceIndex: number } {
  const distractors = allTitles
    .filter(t => t !== correctTitle)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  // Pad with global fallbacks if the set has fewer than 6 tracks
  const fallbackPool = SARA_FALLBACK_TITLES.filter(fb => fb !== correctTitle && !distractors.includes(fb));
  while (distractors.length < 5) distractors.push(fallbackPool.shift() ?? `Canzone ${distractors.length + 1}`);
  const choices = [correctTitle, ...distractors].sort(() => Math.random() - 0.5);
  return { choices, correctChoiceIndex: choices.indexOf(correctTitle) };
}

/** 4. SaraMusica — carica tracce dal DB. Each round includes 6 shuffled answer choices. */
async function loadSaraMusicaRounds(): Promise<RoundPayload[]> {
  logger.error("[FLOW_BUG] SaraMusica should not enter old static-only mode — use new bypass");
  const [set] = await db.select().from(saraMusicaSetsTable)
    .where(eq(saraMusicaSetsTable.isActive, true))
    .orderBy(desc(saraMusicaSetsTable.createdAt)).limit(1);
  if (!set) return fallbackSaraMusica();

  const tracks = await db.select().from(saraMusicaTracksTable)
    .where(and(eq(saraMusicaTracksTable.setId, set.id), eq(saraMusicaTracksTable.isActive, true)))
    .orderBy(asc(saraMusicaTracksTable.orderIndex));

  if (tracks.length === 0) return fallbackSaraMusica();

  const allTitles = tracks.map(t => t.title);
  return tracks.map((t, i) => {
    const { choices, correctChoiceIndex } = buildSaraChoices(t.title, allTitles);
    return {
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
      choices,
      correctChoiceIndex,
      revealed: false,
    };
  });
}

function fallbackSaraMusica(): RoundPayload[] {
  const { choices, correctChoiceIndex } = buildSaraChoices("Under Pressure", []);
  return [
    { mode: "home-saramusica", roundIndex: 0, setName: "SaraMusica",
      title: "Under Pressure", artist: "Queen & David Bowie",
      snippetHint: "Un classico degli anni '80 su un tema molto pesante...",
      audioUrl: null, durationSeconds: 30, points: 150,
      choices, correctChoiceIndex, revealed: false },
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

  return shuffleArr(challenges).slice(0, 4).map((c, i) => ({
    mode: "home-ballo",
    roundIndex: i,
    name: c.name,
    description: c.description,
    duration: c.duration ?? 15,
    timeLimit: c.duration ?? 15,
    musicHint: c.musicHint ?? "",
    difficulty: c.difficulty ?? "medium",
    startedAt: null,
  }));
}

function fallbackBallo(): RoundPayload[] {
  return [
    { mode: "home-ballo", roundIndex: 0, name: "Sfida Freestyle",    description: "Balla liberamente — più energia hai, meglio è!",                         duration: 15, timeLimit: 15, musicHint: "", startedAt: null },
    { mode: "home-ballo", roundIndex: 1, name: "La Coreografia",     description: "Inventate insieme una mossa — tutti la ripetono!",                       duration: 15, timeLimit: 15, musicHint: "", startedAt: null },
    { mode: "home-ballo", roundIndex: 2, name: "Stile Libero",       description: "Balla come vuoi, senza regole — giudica solo l'energia!",                 duration: 15, timeLimit: 15, musicHint: "", startedAt: null },
    { mode: "home-ballo", roundIndex: 3, name: "Il Gran Finale",     description: "Ultimo round — tutto quello che hai!",                                    duration: 15, timeLimit: 15, musicHint: "", startedAt: null },
  ];
}

// ── GameFlowEngine: load ballo rounds for a chosen theme ─────────────────────
// Called by the flow/confirm route after countdown starts.
async function loadBalloRoundsForTheme(
  selectedTheme: { id: string; name: string } | null,
): Promise<RoundPayload[]> {
  if (selectedTheme?.id === "fallback") return fallbackBallo();
  const challenges = await db.select().from(danceChallengesTable)
    .orderBy(desc(danceChallengesTable.createdAt));
  if (challenges.length === 0) return fallbackBallo();
  const selected = selectedTheme
    ? challenges.find((c) => c.id === selectedTheme.id)
    : null;
  const others = selected
    ? challenges.filter((c) => c.id !== selectedTheme!.id)
    : challenges;
  const pool = selected ? [selected, ...shuffleArr(others)] : shuffleArr(challenges);
  return pool.slice(0, 4).map((c, i) => ({
    mode: "home-ballo",
    roundIndex: i,
    name: c.name,
    description: c.description,
    duration: c.duration ?? 15,
    timeLimit: c.duration ?? 15,
    musicHint: c.musicHint ?? "",
    difficulty: c.difficulty ?? "medium",
    startedAt: null,
  }));
}

// ── GameFlowEngine: load themes + maxPlayers config for every game ────────────

interface GameFlowConfig {
  themes: Array<{ id: string; name: string; description: string }>;
  maxPlayers: number; // 0 = no booking step (everyone plays)
}

async function loadThemesForGame(gameSlug: string): Promise<GameFlowConfig> {
  switch (gameSlug) {
    case "sfida-ballo": {
      const challenges = await db.select().from(danceChallengesTable)
        .orderBy(desc(danceChallengesTable.createdAt)).limit(6);
      const themes = challenges.length > 0
        ? challenges.map(c => ({ id: c.id, name: c.name, description: c.description ?? "" }))
        : [{ id: "fallback", name: "SFIDA LIBERA", description: "Balla liberamente — più energia hai, meglio è!" }];
      return { themes, maxPlayers: 2 };
    }
    case "adult-only": {
      const decks = await db.select().from(adultOnlyDecksTable)
        .orderBy(desc(adultOnlyDecksTable.createdAt)).limit(6);
      const themes = decks.length > 0
        ? decks.map(d => ({ id: d.id, name: d.name, description: d.description ?? "" }))
        : [{ id: "fallback", name: "Classico", description: "Il mazzo standard di Adult Only" }];
      return { themes, maxPlayers: 1 };
    }
    case "parola-alle-spalle": {
      const sets = await db.select().from(wordBackSetsTable)
        .where(eq(wordBackSetsTable.isActive, true))
        .orderBy(desc(wordBackSetsTable.createdAt)).limit(6);
      const themes = sets.length > 0
        ? sets.map(s => ({ id: s.id, name: s.title, description: s.description ?? "" }))
        : [{ id: "fallback", name: "Classici Italiani", description: "Parole della tradizione italiana" }];
      return { themes, maxPlayers: 2 };
    }
    case "karaoke-battle": {
      const sets = await db.select().from(karaokeSetsTable)
        .where(eq(karaokeSetsTable.isActive, true))
        .orderBy(desc(karaokeSetsTable.createdAt)).limit(6);
      const themes = sets.length > 0
        ? sets.map(s => ({ id: s.id, name: s.title, description: s.description ?? "" }))
        : [{ id: "fallback", name: "Classici Italiani", description: "I grandi successi della musica italiana" }];
      return { themes, maxPlayers: 1 };
    }
    case "percorso-a-risate": {
      const sets = await db.select().from(laughingPathSetsTable)
        .orderBy(desc(laughingPathSetsTable.createdAt)).limit(6);
      const themes = sets.length > 0
        ? sets.map(s => ({ id: s.id, name: s.name, description: s.description ?? "" }))
        : [{ id: "fallback", name: "Serata Classica", description: "Sfide e risate per tutti" }];
      return { themes, maxPlayers: 2 };
    }
    case "quizzone": {
      const packs = await db.select().from(quizPacksTable)
        .where(eq(quizPacksTable.status, "generated"))
        .orderBy(desc(quizPacksTable.createdAt)).limit(6);
      const themes = packs.length > 0
        ? packs.map(p => ({ id: p.id, name: p.title ?? "Quiz", description: "" }))
        : [{ id: "fallback", name: "Quiz Generale", description: "Domande di cultura generale" }];
      return { themes, maxPlayers: 0 };
    }
    case "gioco-coppie": {
      const sets = await db.select().from(cardSetsTable)
        .orderBy(desc(cardSetsTable.createdAt)).limit(6);
      const themes = sets.length > 0
        ? sets.map(s => ({ id: s.id, name: s.name, description: s.description ?? "" }))
        : [{ id: "fallback", name: "Classici", description: "Abbina le coppie!" }];
      return { themes, maxPlayers: 0 };
    }
    case "saramusica": {
      const sets = await db.select().from(saraMusicaSetsTable)
        .where(eq(saraMusicaSetsTable.isActive, true))
        .orderBy(desc(saraMusicaSetsTable.createdAt)).limit(6);
      const themes = sets.length > 0
        ? sets.map(s => ({ id: s.id, name: s.title, description: s.description ?? "" }))
        : [{ id: "fallback", name: "Classici", description: "Indovina la canzone!" }];
      return { themes, maxPlayers: 0 };
    }
    default:
      return { themes: [{ id: "fallback", name: "Standard", description: "" }], maxPlayers: 0 };
  }
}

// ── GameFlowEngine: load coppie board for a specific set ID ───────────────────

async function loadCoppieByTheme(setId: string): Promise<CoppiePayload> {
  const [set] = await db.select().from(cardSetsTable).where(eq(cardSetsTable.id, setId));
  if (!set) return buildCoppiePayload(FALLBACK_COPPIE_ITEMS.map(w => ({ a: w, b: w })), 0, "Coppie");
  const cards = await db.select().from(cardsTable)
    .where(eq(cardsTable.cardSetId, setId))
    .orderBy(asc(cardsTable.createdAt));
  const pairMap = new Map<string, typeof cards>();
  for (const c of cards) {
    const pid = c.pairId ?? c.id;
    if (!pairMap.has(pid)) pairMap.set(pid, []);
    pairMap.get(pid)!.push(c);
  }
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
  if (pairs.length === 0) return buildCoppiePayload(FALLBACK_COPPIE_ITEMS.map(w => ({ a: w, b: w })), 0, set.name);
  return buildCoppiePayload(pairs, 0, set.name);
}

// ── GameFlowEngine: load rounds for a specific theme (all games) ───────────────
// Called by flow/confirm after countdown, dispatches to the right content loader.

async function loadGameRoundsForTheme(
  gameSlug: string,
  selectedTheme: { id: string; name: string } | null,
  selectedSubtype?: string,
): Promise<RoundPayload[]> {
  if (gameSlug === "sfida-ballo") return loadBalloRoundsForTheme(selectedTheme);

  const themeId = selectedTheme?.id ?? null;
  const isFallback = !themeId || themeId === "fallback";

  switch (gameSlug) {
    case "adult-only": {
      if (isFallback) return loadAdultOnlyRounds();
      const cards = await db.select().from(adultOnlyCardsTable)
        .where(and(eq(adultOnlyCardsTable.deckId, themeId!), eq(adultOnlyCardsTable.isActive, true)))
        .orderBy(asc(adultOnlyCardsTable.orderIndex));
      if (cards.length === 0) return loadAdultOnlyRounds();
      return shuffleArr(cards).map((c, i) => ({
        mode: "home-adult", roundIndex: i, deckName: selectedTheme!.name,
        title: c.title, body: c.body, category: c.category ?? "",
        points: c.points ?? 150, timeLimit: c.timeLimit ?? 90, level: c.level ?? "medium", revealed: false,
      }));
    }
    case "parola-alle-spalle": {
      if (isFallback) return loadWordBackRounds();
      const cards = await db.select().from(wordBackCardsTable)
        .where(and(eq(wordBackCardsTable.setId, themeId!), eq(wordBackCardsTable.isActive, true)))
        .orderBy(asc(wordBackCardsTable.orderIndex));
      if (cards.length === 0) return loadWordBackRounds();
      const allWords = cards.map(c => c.word);
      return shuffleArr(cards).map((c, i) => ({
        mode: "home-wordback", roundIndex: i, setName: selectedTheme!.name,
        word: c.word, tabooWords: generateTabooWords(c.word, c.hint ?? "", allWords, c.category ?? ""),
        hint: c.hint ?? "", category: c.category ?? "",
        difficulty: c.difficulty ?? "medium", points: c.points ?? 150, timeLimit: c.timeLimit ?? 45, guessed: false,
      }));
    }
    case "karaoke-battle": {
      logger.error({ gameSlug, selectedTheme }, "[FLOW_BUG] karaoke-battle hit loadGameRoundsForTheme — it should have bypassed GameFlowEngine in select-game");
      if (isFallback) return loadKaraokeRounds();
      const subtype = selectedSubtype ?? "mixed";

      // freestyle-only: themeId is a freestyle set ID
      if (subtype === "freestyle-only") {
        const fWords2 = await db.select().from(freestyleWordsTable)
          .where(and(eq(freestyleWordsTable.setId, themeId!), eq(freestyleWordsTable.isActive, true)))
          .orderBy(asc(freestyleWordsTable.orderIndex));
        const words = fWords2.length > 0 ? shuffleArr(fWords2).slice(0, 8) : [];
        if (words.length === 0) return fallbackKaraoke();
        return words.map((w, i) => ({
          mode: "home-freestyle", roundIndex: i, setName: selectedTheme?.name ?? "Freestyle",
          word: w.word, timeLimit: 30, points: 200, started: false,
        }));
      }

      const kTracks = await db.select().from(karaokeTracksTable)
        .where(and(eq(karaokeTracksTable.setId, themeId!), eq(karaokeTracksTable.isActive, true)))
        .orderBy(asc(karaokeTracksTable.orderIndex));
      if (kTracks.length === 0) return loadKaraokeRounds();

      const kRounds: RoundPayload[] = [];
      const kShuffled = shuffleArr(kTracks).slice(0, 8);

      if (subtype === "karaoke-only") {
        // Pure karaoke — no freestyle rounds
        return kShuffled.map((t, i) => ({
          mode: "home-karaoke", roundIndex: i, setName: selectedTheme!.name,
          title: t.title, artist: t.artist ?? "", lyricSnippet: t.lyricSnippet ?? "",
          audioUrl: t.audioUrl ?? null, durationSeconds: t.durationSeconds ?? 60,
          points: t.points ?? 150, category: t.category ?? "", started: false,
        }));
      }

      // mixed (default): alternate 2 karaoke + 1 freestyle
      const [fset] = await db.select().from(freestyleSetsTable)
        .where(eq(freestyleSetsTable.isActive, true))
        .orderBy(desc(freestyleSetsTable.createdAt)).limit(1);
      const fWords = fset ? await db.select().from(freestyleWordsTable)
        .where(and(eq(freestyleWordsTable.setId, fset.id), eq(freestyleWordsTable.isActive, true)))
        .orderBy(asc(freestyleWordsTable.orderIndex)) : [];
      const fShuffled = shuffleArr(fWords).slice(0, 6);
      let ki = 0, fi = 0, roundIdx = 0;
      while (ki < kShuffled.length || fi < fShuffled.length) {
        for (let n = 0; n < 2 && ki < kShuffled.length; n++, ki++) {
          const t = kShuffled[ki]!;
          kRounds.push({ mode: "home-karaoke", roundIndex: roundIdx++, setName: selectedTheme!.name, title: t.title, artist: t.artist ?? "", lyricSnippet: t.lyricSnippet ?? "", audioUrl: t.audioUrl ?? null, durationSeconds: t.durationSeconds ?? 60, points: t.points ?? 150, category: t.category ?? "", started: false });
        }
        if (fi < fShuffled.length) {
          const w = fShuffled[fi++]!;
          kRounds.push({ mode: "home-freestyle", roundIndex: roundIdx++, setName: fset?.title ?? "Freestyle", word: w.word, timeLimit: 30, points: 200, started: false });
        }
      }
      return kRounds.length > 0 ? kRounds : fallbackKaraoke();
    }
    case "percorso-a-risate": {
      logger.error({ gameSlug, selectedTheme }, "[FLOW_BUG] percorso-a-risate hit loadGameRoundsForTheme — it should have bypassed GameFlowEngine in select-game");
      if (isFallback) return loadPercorsoRounds();
      const steps = await db.select().from(laughingPathStepsTable)
        .where(and(eq(laughingPathStepsTable.setId, themeId!), eq(laughingPathStepsTable.isActive, true)))
        .orderBy(asc(laughingPathStepsTable.orderIndex));
      if (steps.length === 0) return loadPercorsoRounds();
      return steps.map((s, i) => ({
        mode: "home-percorso", roundIndex: i, setName: selectedTheme!.name,
        challengeType: s.challengeType ?? "sfida", title: s.title, description: s.description,
        points: s.points ?? 150, timeLimit: s.timeLimit ?? 60, timerStartedAt: null,
      }));
    }
    case "quizzone": {
      if (isFallback) return loadQuizRounds();
      const [pack] = await db.select().from(quizPacksTable)
        .where(eq(quizPacksTable.id, themeId!)).limit(1);
      if (!pack || !Array.isArray(pack.generatedJson)) return loadQuizRounds();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questions = pack.generatedJson as any[];
      return questions.map((q, i) => {
        const rawAnswers: string[] = q.answers ?? ["A", "B", "C", "D"];
        const rawCorrect: number = q.correctAnswer ?? q.correctIndex ?? q.correct_index ?? 0;
        const { answers, correctIndex } = shuffleWithCorrectIndex(rawAnswers, rawCorrect);
        return { mode: "home-quiz", roundIndex: i, category: pack.title ?? "Quiz", question: q.questionText ?? q.question ?? `Domanda ${i + 1}`, answers, correctIndex, explanation: q.explanation ?? q.jonnyLine ?? "", points: q.points ?? 200, timeLimit: q.timeLimit ?? q.time_limit ?? 15, revealed: false };
      });
    }
    case "gioco-coppie": {
      if (isFallback) return [(await loadCoppieRound(0)) as RoundPayload];
      return [(await loadCoppieByTheme(themeId!)) as RoundPayload];
    }
    case "saramusica": {
      if (isFallback) return loadSaraMusicaRounds();
      const tracks = await db.select().from(saraMusicaTracksTable)
        .where(and(eq(saraMusicaTracksTable.setId, themeId!), eq(saraMusicaTracksTable.isActive, true)))
        .orderBy(asc(saraMusicaTracksTable.orderIndex));
      if (tracks.length === 0) return loadSaraMusicaRounds();
      const allTitles = tracks.map(t => t.title);
      return tracks.map((t, i) => {
        const { choices, correctChoiceIndex } = buildSaraChoices(t.title, allTitles);
        return { mode: "home-saramusica", roundIndex: i, setName: selectedTheme!.name, title: t.title, artist: t.artist ?? "", challengeType: t.challengeType ?? "indovina", snippetHint: t.snippetHint ?? "", audioUrl: t.audioUrl ?? null, durationSeconds: t.durationSeconds ?? 30, points: t.points ?? 100, choices, correctChoiceIndex, revealed: false };
      });
    }
    default: return loadGameRounds(gameSlug);
  }
}

// ── Auto-score Ballo: highest peak energy wins ────────────────────────────────
async function autoScoreBallo(
  sessionId: string,
  players: { id: string; score: number; nickname: string }[],
): Promise<string | null> {
  logger.info({ sessionId, playerCount: players.length }, "[BalloTrace:score] autoScoreBallo called");
  const energies = getBalloEnergies(sessionId);
  clearBalloEnergies(sessionId);

  if (Object.keys(energies).length === 0) {
    logger.warn({ sessionId }, "[BalloTrace:score] energy map empty — no motion data received, skipping auto-score");
    return null;
  }
  logger.info({ sessionId, energies }, "[BalloTrace:score] energy map found");

  let winnerId = "";
  let maxEnergy = -1;
  for (const [pid, e] of Object.entries(energies)) {
    if (e > maxEnergy) { maxEnergy = e; winnerId = pid; }
  }
  if (!winnerId) return null;

  const winner = players.find((p) => p.id === winnerId);
  if (!winner) { logger.warn({ sessionId, winnerId }, "[BalloTrace:score] winner playerId not in players list"); return null; }

  logger.info({ sessionId, winnerId, winnerNickname: winner.nickname, maxEnergy }, "[BalloTrace:score] winner selected");

  const BALLO_POINTS = 150;
  const newScore = Math.max(0, winner.score + BALLO_POINTS);

  await db.update(homePlayersTable)
    .set({ score: newScore })
    .where(and(eq(homePlayersTable.id, winnerId), eq(homePlayersTable.sessionId, sessionId)));

  logger.info({ sessionId, winnerId, newScore }, "[BalloTrace:score] points updated in DB");

  emitToRoom(`home:${sessionId}`, "home:ballo_result", {
    winnerId,
    winnerNickname: winner.nickname,
    points: BALLO_POINTS,
    energies,
  });

  logger.info({ sessionId, winnerId, maxEnergy, newScore }, "[BalloTrace:score] emitted home:ballo_result");
  return winnerId;
}

// ── Taboo word generation ─────────────────────────────────────────────────────

const STATIC_TABOO: Record<string, string[]> = {
  "pizza": ["Napoletana", "Forno", "Mozzarella", "Pomodoro", "Rotonda"],
  "vespa": ["Moto", "Piaggio", "Scooter", "Guidare", "Ruote"],
  "gelato": ["Freddo", "Cono", "Crema", "Dolce", "Estate"],
  "spaghetti": ["Pasta", "Sugo", "Carbonara", "Forchetta", "Italiani"],
  "mandolino": ["Strumento", "Corde", "Musica", "Suonare", "Napoletano"],
  "colosseo": ["Roma", "Anfiteatro", "Gladiatori", "Antico", "Pietra"],
};

const CATEGORY_TABOO_FILLERS: Record<string, string[]> = {
  "italiani": ["Famoso", "Tradizionale", "Classico", "Storico", "Nazionale"],
  "cibo": ["Mangiare", "Gustoso", "Cucinare", "Ricetta", "Ingrediente"],
  "sport": ["Giocare", "Vincere", "Squadra", "Campo", "Partita"],
  "musica": ["Cantare", "Suonare", "Ritmo", "Melodia", "Strumento"],
  "cinema": ["Film", "Attore", "Scena", "Personaggio", "Regista"],
};

function generateTabooWords(word: string, hint: string, otherWords: string[], category: string): string[] {
  const wLow = word.toLowerCase();
  if (STATIC_TABOO[wLow]) return STATIC_TABOO[wLow]!;
  const STOP = new Set(["il","lo","la","le","gli","un","una","uno","di","da","in","con","su","per","tra","fra","che","non","ma","è","e","a"]);
  const fromHint = (hint || "")
    .split(/[\s,;.!?()\-]+/)
    .map(w => w.trim())
    .filter(w => w.length > 3 && !STOP.has(w.toLowerCase()) && w.toLowerCase() !== wLow)
    .slice(0, 3);
  const fromSet = shuffleArr(otherWords.filter(w => w.toLowerCase() !== wLow)).slice(0, 3);
  const candidates = [...new Set([...fromHint, ...fromSet])];
  const fillers = [...(CATEGORY_TABOO_FILLERS[category.toLowerCase()] ?? CATEGORY_TABOO_FILLERS["italiani"]!)];
  while (candidates.length < 5 && fillers.length > 0) {
    const fb = fillers.shift()!;
    if (!candidates.includes(fb)) candidates.push(fb);
  }
  const finalFallbacks = ["Oggetto", "Cosa", "Parola", "Tipo", "Tipico"];
  while (candidates.length < 5) {
    const fb = finalFallbacks.shift() ?? "X";
    if (!candidates.includes(fb)) candidates.push(fb);
  }
  return candidates.slice(0, 5).map(w => w.charAt(0).toUpperCase() + w.slice(1));
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

  const allWords = cards.map(c => c.word);
  return shuffleArr(cards).map((c, i) => ({
    mode: "home-wordback",
    roundIndex: i,
    setName: set.title,
    word: c.word,
    tabooWords: generateTabooWords(c.word, c.hint ?? "", allWords, c.category ?? ""),
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
    word: w, tabooWords: generateTabooWords(w, "", words, "italiani"),
    hint: "", category: "italiani", difficulty: "easy", points: 150, timeLimit: 45, guessed: false,
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

// ── GET /home/music-config  (PUBLIC — no auth required) ───────────────────────
// Returns only the musicPaths object from tenant.settings so unauthenticated
// devices (Home Mode TV board, player phones) can load custom audio tracks.
// home_sessions have no tenantId — merge musicPaths from all tenants.
// Audio slugs are game-specific and don't conflict between tenants.
router.get("/home/music-config", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, 'tenant.settings'));

    const merged: Record<string, string> = {};
    for (const row of rows) {
      const value = row.value;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const paths = (value as Record<string, unknown>).musicPaths as Record<string, string> | undefined;
      if (paths) Object.assign(merged, paths);
    }

    res.json({ musicPaths: merged });
  } catch (err) {
    req.log.error({ err }, 'home/music-config error');
    res.json({ musicPaths: {} });
  }
});

// ── POST /home/sessions ────────────────────────────────────────────────────────
router.post("/home/sessions", async (req, res): Promise<void> => {
  // Opportunistic cleanup of stale sessions before creating a new one
  void cleanupExpiredHomeSessions().catch(() => {});

  const hostName      = String(req.body?.hostName ?? "Casa").slice(0, 50);
  const maxPlayers    = 50; // unlimited — players join freely via QR
  const selectedGames = Array.isArray(req.body?.selectedGames) ? req.body.selectedGames as string[] : [];
  const matchDuration = String(req.body?.matchDuration ?? "normal");

  let joinCode = makeJoinCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: homeSessionsTable.id })
      .from(homeSessionsTable).where(eq(homeSessionsTable.joinCode, joinCode));
    if (!existing) break;
    joinCode = makeJoinCode();
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // lobby: 2 h inactivity window
  const [session] = await db.insert(homeSessionsTable).values({
    joinCode,
    hostName,
    maxPlayers,
    expiresAt,
    gameConfig: {
      phase: "join",
      gamesPlayed: [],
      preloadedRounds: [],
      selectedGames,
      matchDuration,
    },
  }).returning();

  res.status(201).json(session);
});

// ── GET /home/sessions/by-code/:code ──────────────────────────────────────────
router.get("/home/sessions/by-code/:code", async (req, res): Promise<void> => {
  void cleanupExpiredHomeSessions().catch(() => {});

  const code = String(req.params["code"]).toUpperCase().trim();
  const [session] = await db.select().from(homeSessionsTable)
    .where(eq(homeSessionsTable.joinCode, code));

  if (!session) { res.status(404).json({ error: "Sessione non trovata" }); return; }
  if (session.status === "ended") { res.status(409).json({ error: "Sessione terminata" }); return; }
  if (new Date() > session.expiresAt) { res.status(410).json({ error: "Sessione scaduta o abbandonata" }); return; }

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

  void cleanupExpiredHomeSessions().catch(() => {});

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status === "ended") { res.status(409).json({ error: "Sessione terminata" }); return; }
  if (new Date() > session.expiresAt) { res.status(410).json({ error: "Sessione scaduta o abbandonata" }); return; }

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

// ── POST /home/sessions/:id/answer — phone reports a quiz answer ────────────────
router.post("/home/sessions/:id/answer", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const { playerId, answerIndex, round } = req.body as { playerId: string; answerIndex: number; round: number };
  if (!playerId || typeof answerIndex !== "number" || typeof round !== "number") {
    res.status(400).json({ error: "Parametri mancanti" }); return;
  }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }

  const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(payload.mode ?? "") !== "home-quiz") {
    res.status(400).json({ error: "Non in modalità quiz" }); return;
  }
  if (session.currentRound !== round) {
    res.status(409).json({ error: "Round non corrispondente" }); return;
  }

  // Store answer (first answer per player wins — no changing answer after submission)
  if (!quizAnswerMap.has(id)) quizAnswerMap.set(id, new Map());
  const roundMap = quizAnswerMap.get(id)!;
  if (!roundMap.has(round)) roundMap.set(round, new Map());
  const answerMap = roundMap.get(round)!;
  const alreadyAnswered = answerMap.has(playerId);
  if (!alreadyAnswered) answerMap.set(playerId, answerIndex);
  logger.info({ sessionId: id, playerId, answerIndex, round, alreadyAnswered }, "[QuizTrace:server] answer saved");

  // Check whether all active players have now answered.
  // Use only CONNECTED players so disconnected/ghost devices don't block the reveal.
  const players = await getPlayers(id);
  const connectedPlayers = players.filter(p => p.isConnected);
  const effectiveCount = connectedPlayers.length > 0
    ? connectedPlayers.length
    : players.length > 0 ? players.length : answerMap.size;
  logger.info({ sessionId: id, round, answeredCount: answerMap.size, playerCount: players.length, effectiveCount, allAnswered: answerMap.size >= effectiveCount }, "[QuizTrace:server] answer count check");

  if (effectiveCount > 0 && answerMap.size >= effectiveCount) {
    logger.info({ sessionId: id, round }, "[QuizTrace:server] all answered — emitting home:quiz_all_answered");
    emitToRoom(homeRoom(id), "home:quiz_all_answered", {
      sessionId: id,
      round,
      correctIndex: Number(payload.correctIndex ?? 0),
      answers: Object.fromEntries(answerMap.entries()),
    });
    // Remove round entry so a late-arriving duplicate doesn't re-emit
    roundMap.delete(round);
    logger.info({ sessionId: id, round }, "[QuizTrace:server] emitted home:quiz_all_answered");
  }

  res.json({ ok: true });
});

// ── POST /home/sessions/:id/saramusica-answer — first correct answer wins ──────
router.post("/home/sessions/:id/saramusica-answer", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const { playerId, choiceIndex, round } = req.body as { playerId: string; choiceIndex: number; round: number };
  if (!playerId || typeof choiceIndex !== "number" || typeof round !== "number") {
    res.status(400).json({ error: "Parametri mancanti" }); return;
  }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(payload.mode ?? "") !== "home-saramusica") {
    res.status(400).json({ error: "Non in modalità SaraMusica" }); return;
  }

  // If this round already has a winner, reject late arrivals
  if (!saraMusicaWinnerMap.has(id)) saraMusicaWinnerMap.set(id, new Map());
  const roundWinners = saraMusicaWinnerMap.get(id)!;
  if (roundWinners.has(round)) {
    res.json({ ok: true, correct: false, alreadyWon: true }); return;
  }

  const correctChoiceIndex = Number(payload.correctChoiceIndex ?? 0);
  const isCorrect = choiceIndex === correctChoiceIndex;

  if (isCorrect) {
    roundWinners.set(round, playerId);
    const players = await getPlayers(id);
    const winner = players.find(p => p.id === playerId);
    if (winner) {
      const pts = Number(payload.points ?? 100);
      await db.update(homePlayersTable)
        .set({ score: winner.score + pts })
        .where(eq(homePlayersTable.id, playerId));
      emitToRoom(homeRoom(id), "home:saramusica_winner", {
        playerId,
        nickname: winner.nickname,
        round,
        points: pts,
      });
      logger.info({ sessionId: id, playerId, round, pts }, "[SaraTrace:server] winner found");
    }
  }

  res.json({ ok: true, correct: isCorrect });
});

// ── Quizzone Home Live Show routes ────────────────────────────────────────────

// Helper: update quizzone payload and emit home:state
async function qzUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const sess = await getSession(id);
  if (!sess) return;
  const rp = (sess.roundPayload ?? {}) as Record<string, unknown>;
  const updated = await db.update(homeSessionsTable)
    .set({ roundPayload: { ...rp, ...patch } })
    .where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated[0], players });
}

/** Shared reveal logic — called by route handler and auto-reveal timer */
async function performQzReveal(id: string, expectedIndex: number): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone" || rp["phase"] !== "question") return;
  if (Number(rp["currentIndex"] ?? 0) !== expectedIndex) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions = (rp["questions"] as any[]) ?? [];
  const q = questions[expectedIndex];
  if (!q) return;
  const correctAnswerIndex = Number(q.correctAnswerIndex ?? 0);
  const qType = String(q.type ?? "multiple_choice");
  const timeLimit = Number(q.timeLimit ?? 15);
  const currentClueIndex = Number(rp["currentClueIndex"] ?? 0);
  const questionStartedAt = rp["questionStartedAt"] ? new Date(String(rp["questionStartedAt"])).getTime() : Date.now();
  const players = await getPlayers(id);
  const qMap = quizzoneAnswerMap.get(id)?.get(expectedIndex);
  const playerResults: { playerId: string; nickname: string; answerIndex: number | null; correct: boolean; points: number }[] = [];
  const scoreUpdates: Promise<unknown>[] = [];
  for (const player of players) {
    const ans = qMap?.get(player.id);
    const correct = ans !== undefined && ans.answerIndex === correctAnswerIndex;
    let points = 0;
    if (correct) {
      switch (qType) {
        case "true_false": points = 80; break;
        case "speed_round": {
          const elapsed = (ans?.answeredAt ?? Date.now()) - questionStartedAt;
          const speedBonus = Math.round(50 * Math.max(0, 1 - elapsed / (timeLimit * 1000)));
          points = 100 + speedBonus;
          break;
        }
        case "progressive_clue": points = Math.max(50, 150 - currentClueIndex * 50); break;
        case "order_choice": points = 120; break;
        case "final_bomb": points = 200; break;
        default: points = Number(q.points ?? 100);
      }
      scoreUpdates.push(
        db.update(homePlayersTable).set({ score: player.score + points }).where(eq(homePlayersTable.id, player.id))
      );
    }
    playerResults.push({ playerId: player.id, nickname: player.nickname, answerIndex: ans?.answerIndex ?? null, correct, points });
  }
  await Promise.all(scoreUpdates);
  quizzoneAnswerMap.get(id)?.delete(expectedIndex);
  const revealData = { correctAnswerIndex, playerResults };
  await qzUpdate(id, { phase: "reveal", revealData, allAnsweredForCurrent: false });
  emitToRoom(homeRoom(id), "home:quizzone_reveal", { sessionId: id, questionIndex: expectedIndex, revealData });
  logger.info({ sessionId: id, questionIndex: expectedIndex }, "[QuizzoneHome] reveal completed");
}

function scheduleQzAutoReveal(sessionId: string, questionIndex: number, endsAtMs: number): void {
  const existing = quizzoneRevealTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(100, endsAtMs - Date.now()) + 700;
  const timer = setTimeout(() => {
    quizzoneRevealTimers.delete(sessionId);
    performQzReveal(sessionId, questionIndex).catch(() => {});
  }, delay);
  quizzoneRevealTimers.set(sessionId, timer);
}

// POST /home/sessions/:id/quiz/suggest-theme — player proposes a theme
router.post("/home/sessions/:id/quiz/suggest-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone") { res.status(409).json({ error: "Non in modalità quizzone" }); return; }
  if (rp["phase"] !== "setup_theme") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const { playerId, nickname, text } = req.body as { playerId: string; nickname: string; text: string };
  if (!playerId || !text?.trim()) { res.status(400).json({ error: "playerId e text obbligatori" }); return; }
  const cleanText = text.trim().slice(0, 50);
  const existing = (rp["quizSuggestions"] as { playerId: string; nickname: string; text: string }[] | undefined) ?? [];
  // One suggestion per player — replace if already submitted
  const filtered = existing.filter(s => s.playerId !== playerId);
  if (filtered.length >= 20) { res.status(409).json({ error: "Massimo 20 suggerimenti raggiunto" }); return; }
  const updated = [...filtered, { playerId, nickname: nickname ?? 'Giocatore', text: cleanText }];
  await qzUpdate(id, { quizSuggestions: updated });
  req.log.info({ sessionId: id, playerId, text: cleanText }, "[QuizzoneHome] theme suggested");
  res.json({ ok: true });
});

// POST /home/sessions/:id/quiz/select-theme
router.post("/home/sessions/:id/quiz/select-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone") { res.status(409).json({ error: "Non in modalità quizzone" }); return; }
  if (rp["phase"] !== "setup_theme") { res.status(409).json({ error: "Fase non corretta" }); return; }
  let { themeId } = req.body as { themeId: string };
  if (!themeId) { res.status(400).json({ error: "themeId obbligatorio" }); return; }
  // "random" themeId: use top suggested theme or pick a random known theme
  if (themeId === "random") {
    const suggestions = (rp["quizSuggestions"] as { text: string }[] | undefined) ?? [];
    if (suggestions.length > 0) {
      const counts: Record<string, number> = {};
      for (const s of suggestions) { const k = s.text.trim().toLowerCase(); counts[k] = (counts[k] ?? 0) + 1; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      themeId = QUIZ_THEMES.find(t => t.label.toLowerCase() === top)?.id ?? top;
    } else {
      themeId = QUIZ_THEMES[Math.floor(Math.random() * QUIZ_THEMES.length)]?.id ?? "cultura_generale";
    }
  }
  const themeObj = QUIZ_THEMES.find(t => t.id === themeId);
  await qzUpdate(id, { theme: themeId, themeName: themeObj?.label ?? themeId, phase: "setup_count", quizSuggestions: [] });
  res.json({ ok: true });
});

// POST /home/sessions/:id/quiz/select-count
router.post("/home/sessions/:id/quiz/select-count", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone") { res.status(409).json({ error: "Non in modalità quizzone" }); return; }
  if (rp["phase"] !== "setup_count") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const count = Number(req.body?.count ?? 10);
  const validCounts = [5, 10, 15, 20];
  const questionCount = validCounts.includes(count) ? count : 10;
  const themeId = String(rp["theme"] ?? "cultura_generale");
  // Start generating
  await qzUpdate(id, { phase: "generating", questionCount });
  res.json({ ok: true });
  // After 3s generate questions and start countdown
  setTimeout(async () => {
    try {
      const questions = generateQuiz(themeId, questionCount);
      const sess2 = await getSession(id);
      if (!sess2) return;
      const rp2 = (sess2.roundPayload ?? {}) as Record<string, unknown>;
      // Countdown 3
      await qzUpdate(id, { ...rp2, questions, phase: "countdown", countdownValue: 3 });
      setTimeout(async () => {
        await qzUpdate(id, { countdownValue: 2 });
        setTimeout(async () => {
          await qzUpdate(id, { countdownValue: 1 });
          setTimeout(async () => {
            const firstQ = questions[0];
            const firstEndsAt = Date.now() + (firstQ?.timeLimit ?? 15) * 1000;
            await qzUpdate(id, {
              phase: "question",
              currentIndex: 0,
              countdownValue: null,
              questionStartedAt: new Date().toISOString(),
              questionEndsAt: new Date(firstEndsAt).toISOString(),
              currentClueIndex: 0,
              allAnsweredForCurrent: false,
              answeredCount: 0,
              revealData: null,
              rankingData: null,
              totalRounds: questionCount,
            });
            scheduleQzAutoReveal(id, 0, firstEndsAt);
            await db.update(homeSessionsTable)
              .set({ totalRounds: questionCount, currentRound: 0 })
              .where(eq(homeSessionsTable.id, id));
            logger.info({ sessionId: id, firstQ: firstQ?.type }, "[QuizzoneHome] first question ready");
          }, 1200);
        }, 1000);
      }, 1000);
    } catch (err) {
      logger.error({ err, sessionId: id }, "[QuizzoneHome] generate failed");
    }
  }, 3000);
});

// POST /home/sessions/:id/quiz/answer — phone submits answer
router.post("/home/sessions/:id/quiz/answer", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { playerId, answerIndex } = req.body as { playerId: string; answerIndex: number };
  if (!playerId || typeof answerIndex !== "number") { res.status(400).json({ error: "Parametri mancanti" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone") { res.status(409).json({ error: "Non in modalità quizzone" }); return; }
  if (rp["phase"] !== "question") { res.status(409).json({ error: "Non in fase domanda" }); return; }
  const qEndsAt = rp["questionEndsAt"] as string | undefined;
  if (qEndsAt && Date.now() > new Date(qEndsAt).getTime()) {
    res.status(409).json({ error: "Tempo scaduto", code: "time_expired" }); return;
  }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  if (!quizzoneAnswerMap.has(id)) quizzoneAnswerMap.set(id, new Map());
  const sessionMap = quizzoneAnswerMap.get(id)!;
  if (!sessionMap.has(currentIndex)) sessionMap.set(currentIndex, new Map());
  const qMap = sessionMap.get(currentIndex)!;
  if (qMap.has(playerId)) { res.json({ ok: true, duplicate: true }); return; }
  qMap.set(playerId, { answerIndex, answeredAt: Date.now() });
  // Update answeredCount in payload and check if all answered
  const players = await getPlayers(id);
  const connected = players.filter(p => p.isConnected);
  const effectiveCount = connected.length > 0 ? connected.length : players.length;
  const answeredCount = qMap.size;
  const allAnswered = effectiveCount > 0 && answeredCount >= effectiveCount;
  await qzUpdate(id, { answeredCount, allAnsweredForCurrent: allAnswered });
  if (allAnswered) {
    const existingTimer = quizzoneRevealTimers.get(id);
    if (existingTimer) { clearTimeout(existingTimer); quizzoneRevealTimers.delete(id); }
    emitToRoom(homeRoom(id), "home:quiz_all_answered", { sessionId: id, round: currentIndex, correctIndex: 0 });
  }
  res.json({ ok: true });
});

// POST /home/sessions/:id/quiz/next-clue — advance progressive clue
router.post("/home/sessions/:id/quiz/next-clue", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone" || rp["phase"] !== "question") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const current = Number(rp["currentClueIndex"] ?? 0);
  await qzUpdate(id, { currentClueIndex: Math.min(current + 1, 2) });
  res.json({ ok: true });
});

// POST /home/sessions/:id/quiz/reveal — reveal answer + score
router.post("/home/sessions/:id/quiz/reveal", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone" || rp["phase"] !== "question") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  // Cancel auto-reveal timer (host revealing manually)
  const existingTimer = quizzoneRevealTimers.get(id);
  if (existingTimer) { clearTimeout(existingTimer); quizzoneRevealTimers.delete(id); }
  await performQzReveal(id, currentIndex);
  res.json({ ok: true });
});

// POST /home/sessions/:id/quiz/next — advance to next question / ranking / finale
router.post("/home/sessions/:id/quiz/next", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-quizzone") { res.status(409).json({ error: "Non in modalità quizzone" }); return; }
  if (rp["phase"] !== "reveal" && rp["phase"] !== "ranking") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions = (rp["questions"] as any[]) ?? [];
  const nextIndex = currentIndex + 1;
  // Build ranking data from current player scores
  const players = await getPlayers(id);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const prevRankingData = (rp["rankingData"] as { playerId: string; score: number }[] | null) ?? null;
  const rankingData = sortedPlayers.map(p => ({
    playerId: p.id,
    nickname: p.nickname,
    avatarColor: (p as Record<string, unknown>).avatarColor as string ?? "#A78BFA",
    score: p.score,
    delta: p.score - (prevRankingData?.find(r => r.playerId === p.id)?.score ?? p.score),
  }));
  if (nextIndex >= questions.length) {
    // FINALE
    await qzUpdate(id, { phase: "finale", rankingData, revealData: null });
    await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
    res.json({ ok: true });
    return;
  }
  // Show ranking every 3 questions (at indices 2, 5, 8, ...) when coming from reveal
  const showRanking = rp["phase"] === "reveal" && nextIndex > 0 && nextIndex % 3 === 0;
  if (showRanking) {
    await qzUpdate(id, { phase: "ranking", rankingData, revealData: null });
    await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
    res.json({ ok: true });
    return;
  }
  // Next question
  const nextQ = questions[nextIndex];
  const nextEndsAt = Date.now() + (nextQ?.timeLimit ?? 15) * 1000;
  await qzUpdate(id, {
    phase: "question",
    currentIndex: nextIndex,
    questionStartedAt: new Date().toISOString(),
    questionEndsAt: new Date(nextEndsAt).toISOString(),
    currentClueIndex: 0,
    allAnsweredForCurrent: false,
    answeredCount: 0,
    revealData: null,
    rankingData: rp["phase"] === "ranking" ? rankingData : rp["rankingData"],
  });
  scheduleQzAutoReveal(id, nextIndex, nextEndsAt);
  await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
  logger.info({ sessionId: id, nextIndex, qType: nextQ?.type }, "[QuizzoneHome] advanced to next question");
  res.json({ ok: true });
});

// ── Sara'Musica Home Live Show routes ─────────────────────────────────────────

const smAnswerMap = new Map<string, Map<number, Map<string, { answerIndex: number; answeredAt: number }>>>();
const smRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function smUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const sess = await getSession(id);
  if (!sess) return;
  const rp = (sess.roundPayload ?? {}) as Record<string, unknown>;
  const updated = await db.update(homeSessionsTable)
    .set({ roundPayload: { ...rp, ...patch } })
    .where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated[0], players });
}

async function performSmReveal(id: string, expectedIndex: number): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica" || rp["phase"] !== "question") return;
  if (Number(rp["currentIndex"] ?? 0) !== expectedIndex) return;
  const rounds = (rp["rounds"] ?? []) as MusicRound[];
  const q = rounds[expectedIndex];
  if (!q) return;
  const correctAnswerIndex = Number(q.correctAnswerIndex ?? 0);
  const qType = q.type;
  const timeLimit = Number(q.timeLimit ?? 20);
  const currentClueIndex = Number(rp["currentClueIndex"] ?? 0);
  const questionStartedAt = rp["questionStartedAt"] ? new Date(String(rp["questionStartedAt"])).getTime() : Date.now();
  const players = await getPlayers(id);
  const qMap = smAnswerMap.get(id)?.get(expectedIndex);
  const playerResults: { playerId: string; nickname: string; answerIndex: number | null; correct: boolean; points: number }[] = [];
  const scoreUpdates: Promise<unknown>[] = [];
  for (const player of players) {
    const ans = qMap?.get(player.id);
    const correct = ans !== undefined && ans.answerIndex === correctAnswerIndex;
    let points = 0;
    if (correct) {
      switch (qType) {
        case "speed_music": {
          const elapsed = (ans?.answeredAt ?? Date.now()) - questionStartedAt;
          const speedBonus = Math.round(50 * Math.max(0, 1 - elapsed / (timeLimit * 1000)));
          points = 100 + speedBonus;
          break;
        }
        case "progressive_clue_music": points = Math.max(50, 150 - currentClueIndex * 50); break;
        case "final_tormentone": points = 200; break;
        case "complete_lyrics": points = 120; break;
        default: points = Number(q.points ?? 100);
      }
      scoreUpdates.push(
        db.update(homePlayersTable).set({ score: player.score + points }).where(eq(homePlayersTable.id, player.id))
      );
    }
    playerResults.push({ playerId: player.id, nickname: player.nickname, answerIndex: ans?.answerIndex ?? null, correct, points });
  }
  await Promise.all(scoreUpdates);
  smAnswerMap.get(id)?.delete(expectedIndex);
  const revealData = { correctAnswerIndex, playerResults };
  await smUpdate(id, { phase: "reveal", revealData, allAnsweredForCurrent: false });
  emitToRoom(homeRoom(id), "home:saramusica_reveal", { sessionId: id, questionIndex: expectedIndex, revealData });
  logger.info({ sessionId: id, questionIndex: expectedIndex }, "[SaraMusicaHome] reveal completed");
}

function scheduleSmAutoReveal(sessionId: string, questionIndex: number, endsAtMs: number): void {
  const existing = smRevealTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(100, endsAtMs - Date.now()) + 700;
  const timer = setTimeout(() => {
    smRevealTimers.delete(sessionId);
    performSmReveal(sessionId, questionIndex).catch(() => {});
  }, delay);
  smRevealTimers.set(sessionId, timer);
}

// POST /home/sessions/:id/saramusica/select-theme
router.post("/home/sessions/:id/saramusica/select-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica") { res.status(409).json({ error: "Non in modalità saramusica" }); return; }
  if (rp["phase"] !== "setup_theme") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const { themeId } = req.body as { themeId: string };
  if (!themeId) { res.status(400).json({ error: "themeId obbligatorio" }); return; }
  const themeObj = SM_THEMES.find(t => t.id === themeId);
  await smUpdate(id, { theme: themeId, themeName: themeObj?.label ?? themeId, phase: "setup_count" });
  res.json({ ok: true });
});

// POST /home/sessions/:id/saramusica/select-count
router.post("/home/sessions/:id/saramusica/select-count", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica") { res.status(409).json({ error: "Non in modalità saramusica" }); return; }
  if (rp["phase"] !== "setup_count") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const count = Number((req.body as Record<string,unknown>)?.count ?? 10);
  const validCounts = [5, 10, 15, 20];
  const roundCount = validCounts.includes(count) ? count : 10;
  const themeId = String(rp["theme"] ?? "anni90");
  await smUpdate(id, { phase: "generating", roundCount });
  res.json({ ok: true });
  setTimeout(async () => {
    try {
      const rounds = await generateSaraMusicaRounds(themeId, roundCount);
      const sess2 = await getSession(id);
      if (!sess2) return;
      const rp2 = (sess2.roundPayload ?? {}) as Record<string, unknown>;
      await smUpdate(id, { ...rp2, rounds, phase: "countdown", countdownValue: 3 });
      setTimeout(async () => {
        await smUpdate(id, { countdownValue: 2 });
        setTimeout(async () => {
          await smUpdate(id, { countdownValue: 1 });
          setTimeout(async () => {
            const firstQ = rounds[0] as MusicRound | undefined;
            const firstEndsAt = Date.now() + (firstQ?.timeLimit ?? 20) * 1000;
            await smUpdate(id, {
              phase: "question",
              currentIndex: 0,
              countdownValue: null,
              questionStartedAt: new Date().toISOString(),
              questionEndsAt: new Date(firstEndsAt).toISOString(),
              currentClueIndex: 0,
              allAnsweredForCurrent: false,
              answeredCount: 0,
              revealData: null,
              rankingData: null,
              totalRounds: roundCount,
            });
            scheduleSmAutoReveal(id, 0, firstEndsAt);
            await db.update(homeSessionsTable)
              .set({ totalRounds: roundCount, currentRound: 0 })
              .where(eq(homeSessionsTable.id, id));
            logger.info({ sessionId: id, themeId, roundCount }, "[SaraMusicaHome] first question ready");
          }, 1200);
        }, 1000);
      }, 1000);
    } catch (err) {
      logger.error({ err, sessionId: id }, "[SaraMusicaHome] generate failed");
    }
  }, 3000);
});

// POST /home/sessions/:id/saramusica/answer
router.post("/home/sessions/:id/saramusica/answer", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { playerId, answerIndex } = req.body as { playerId: string; answerIndex: number };
  if (!playerId || typeof answerIndex !== "number") { res.status(400).json({ error: "Parametri mancanti" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica") { res.status(409).json({ error: "Non in modalità saramusica" }); return; }
  if (rp["phase"] !== "question") { res.status(409).json({ error: "Non in fase domanda" }); return; }
  const qEndsAt = rp["questionEndsAt"] as string | undefined;
  if (qEndsAt && Date.now() > new Date(qEndsAt).getTime()) {
    res.status(409).json({ error: "Tempo scaduto", code: "time_expired" }); return;
  }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  if (!smAnswerMap.has(id)) smAnswerMap.set(id, new Map());
  const sessionMap = smAnswerMap.get(id)!;
  if (!sessionMap.has(currentIndex)) sessionMap.set(currentIndex, new Map());
  const qMap = sessionMap.get(currentIndex)!;
  if (qMap.has(playerId)) { res.json({ ok: true, duplicate: true }); return; }
  qMap.set(playerId, { answerIndex, answeredAt: Date.now() });
  const players = await getPlayers(id);
  const connected = players.filter(p => p.isConnected);
  const effectiveCount = connected.length > 0 ? connected.length : players.length;
  const answeredCount = qMap.size;
  const allAnswered = effectiveCount > 0 && answeredCount >= effectiveCount;
  await smUpdate(id, { answeredCount, allAnsweredForCurrent: allAnswered });
  if (allAnswered) {
    const existing = smRevealTimers.get(id);
    if (existing) { clearTimeout(existing); smRevealTimers.delete(id); }
  }
  res.json({ ok: true });
});

// POST /home/sessions/:id/saramusica/next-clue
router.post("/home/sessions/:id/saramusica/next-clue", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica" || rp["phase"] !== "question") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const current = Number(rp["currentClueIndex"] ?? 0);
  await smUpdate(id, { currentClueIndex: Math.min(current + 1, 2) });
  res.json({ ok: true });
});

// POST /home/sessions/:id/saramusica/reveal
router.post("/home/sessions/:id/saramusica/reveal", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica" || rp["phase"] !== "question") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  const existing = smRevealTimers.get(id);
  if (existing) { clearTimeout(existing); smRevealTimers.delete(id); }
  await performSmReveal(id, currentIndex);
  res.json({ ok: true });
});

// POST /home/sessions/:id/saramusica/next
router.post("/home/sessions/:id/saramusica/next", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-saramusica") { res.status(409).json({ error: "Non in modalità saramusica" }); return; }
  if (rp["phase"] !== "reveal" && rp["phase"] !== "ranking") { res.status(409).json({ error: "Fase non corretta" }); return; }
  const currentIndex = Number(rp["currentIndex"] ?? 0);
  const rounds = (rp["rounds"] ?? []) as MusicRound[];
  const roundCount = Number(rp["roundCount"] ?? rounds.length);
  const nextIndex = currentIndex + 1;
  const players = await getPlayers(id);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const prevRankingData = (rp["rankingData"] as { playerId: string; score: number }[] | null) ?? null;
  const rankingData = sortedPlayers.map(p => ({
    playerId: p.id,
    nickname: p.nickname,
    avatarColor: (p as Record<string, unknown>).avatarColor as string ?? "#60A5FA",
    score: p.score,
    delta: p.score - (prevRankingData?.find(r => r.playerId === p.id)?.score ?? p.score),
  }));
  if (nextIndex >= roundCount) {
    await smUpdate(id, { phase: "finale", rankingData, revealData: null });
    await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
    res.json({ ok: true });
    return;
  }
  const showRanking = rp["phase"] === "reveal" && nextIndex > 0 && nextIndex % 3 === 0;
  if (showRanking) {
    await smUpdate(id, { phase: "ranking", rankingData, revealData: null });
    await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
    res.json({ ok: true });
    return;
  }
  const nextQ = (rounds[nextIndex] as MusicRound | undefined);
  const nextEndsAt = Date.now() + (nextQ?.timeLimit ?? 20) * 1000;
  await smUpdate(id, {
    phase: "question",
    currentIndex: nextIndex,
    questionStartedAt: new Date().toISOString(),
    questionEndsAt: new Date(nextEndsAt).toISOString(),
    currentClueIndex: 0,
    allAnsweredForCurrent: false,
    answeredCount: 0,
    revealData: null,
    rankingData: rp["phase"] === "ranking" ? rankingData : rp["rankingData"],
  });
  scheduleSmAutoReveal(id, nextIndex, nextEndsAt);
  await db.update(homeSessionsTable).set({ currentRound: nextIndex }).where(eq(homeSessionsTable.id, id));
  logger.info({ sessionId: id, nextIndex }, "[SaraMusicaHome] advanced to next question");
  res.json({ ok: true });
});

// ── Adult Only — Bottiglia Party Engine ───────────────────────────────────────

async function adultUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const sess = await getSession(id);
  if (!sess) return;
  const rp = (sess.roundPayload ?? {}) as Record<string, unknown>;
  const updated = await db.update(homeSessionsTable)
    .set({ roundPayload: { ...rp, ...patch } })
    .where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated[0], players });
}

type AoPlayer = Awaited<ReturnType<typeof getPlayers>>[number];
function aoRanking(players: AoPlayer[], deltas: Record<string, number> = {}): { playerId: string; nickname: string; score: number; delta: number }[] {
  return [...players].sort((a, b) => b.score - a.score).map(p => ({ playerId: p.id, nickname: p.nickname, score: p.score, delta: deltas[p.id] ?? 0 }));
}

async function pickBottleChallenge(level: number, usedIds: string[]): Promise<BottleChallenge | null> {
  if (level <= 3) return pickFromBank(level as BottleLevel, usedIds);
  const where = usedIds.length > 0
    ? and(eq(adultBottleChallengesTable.level, level), eq(adultBottleChallengesTable.isActive, true), notInArray(adultBottleChallengesTable.id, usedIds))
    : and(eq(adultBottleChallengesTable.level, level), eq(adultBottleChallengesTable.isActive, true));
  const rows = await db.select().from(adultBottleChallengesTable).where(where).limit(20);
  const pool = rows.length > 0 ? rows : await db.select().from(adultBottleChallengesTable).where(and(eq(adultBottleChallengesTable.level, level), eq(adultBottleChallengesTable.isActive, true))).limit(20);
  if (pool.length === 0) return null;
  const row = pool[Math.floor(Math.random() * pool.length)]!;
  return { id: row.id, level: row.level as BottleLevel, category: row.category ?? "", text: row.text, requiredPlayers: row.requiredPlayers, durationSeconds: row.durationSeconds, requiresConsent: row.requiresConsent, allowPublicVote: row.allowPublicVote, tags: row.tags ?? [] };
}

// POST /adult/set-level — change game level during consent phase
router.post("/home/sessions/:id/adult/set-level", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult") { res.status(409).json({ error: "Non in modalità adult" }); return; }
  const { level } = req.body as { level: number };
  if (![1,2,3,4,5].includes(level)) { res.status(400).json({ error: "Livello non valido" }); return; }
  const levelObj = BOTTLE_LEVELS.find(l => l.level === level);
  await adultUpdate(id, { level, levelLabel: levelObj?.label ?? `Livello ${level}`, levelColor: levelObj?.color ?? "#34D399" });
  res.json({ ok: true });
});

// POST /adult/consent — player records participation preference
router.post("/home/sessions/:id/adult/consent", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "consent") { res.status(409).json({ error: "Consenso non aperto" }); return; }
  const { playerId, response } = req.body as { playerId: string; response: "participate" | "watch" | "leave" };
  if (!["participate", "watch", "leave"].includes(response)) { res.status(400).json({ error: "Risposta non valida" }); return; }
  const players = await getPlayers(id);
  const consentMap = { ...((rp["consentMap"] ?? {}) as Record<string, string>), [playerId]: response };
  const activePlayers = players.filter(p => consentMap[p.id] === "participate").map(p => p.id);
  const spectatorPlayers = players.filter(p => !consentMap[p.id] || consentMap[p.id] === "watch").map(p => p.id);
  await adultUpdate(id, { consentMap, activePlayers, spectatorPlayers });
  res.json({ ok: true });
});

// POST /adult/spin — host spins bottle: selects random player + challenge
router.post("/home/sessions/:id/adult/spin", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult") { res.status(409).json({ error: "Non in modalità adult" }); return; }
  if (!["consent", "result", "escalation"].includes(String(rp["phase"] ?? ""))) { res.status(409).json({ error: "Fase non corretta" }); return; }
  const players = await getPlayers(id);
  const consentMap = (rp["consentMap"] ?? {}) as Record<string, string>;
  const activePlayers: string[] = String(rp["phase"]) === "consent"
    ? players.filter(p => consentMap[p.id] !== "leave").map(p => p.id)
    : (rp["activePlayers"] ?? []) as string[];
  const spectatorPlayers = players.filter(p => !activePlayers.includes(p.id)).map(p => p.id);
  if (activePlayers.length === 0) { res.status(400).json({ error: "Nessun giocatore attivo" }); return; }
  const level = Number(rp["level"] ?? 1);
  const usedIds = (rp["usedChallengeIds"] ?? []) as string[];
  const roundNumber = Number(rp["roundNumber"] ?? 0) + 1;
  const selectedId = activePlayers[Math.floor(Math.random() * activePlayers.length)]!;
  const challenge = await pickBottleChallenge(level, usedIds);
  if (!challenge) { res.status(400).json({ error: "Nessuna sfida disponibile. Aggiungi contenuti nel pannello admin." }); return; }
  const challengeEndsAt = new Date(Date.now() + (challenge.durationSeconds ?? 60) * 1000).toISOString();
  const spectatorPowers = assignSpectatorPowers(spectatorPlayers, (rp["spectatorPowers"] ?? {}) as Record<string, string | null>);
  await adultUpdate(id, {
    phase: "challenge", roundNumber, activePlayers, spectatorPlayers,
    selectedPlayerId: selectedId, selectedPlayerNickname: players.find(p => p.id === selectedId)?.nickname ?? "?",
    currentChallenge: challenge, challengeEndsAt,
    votes: {}, votingEndsAt: null, lastValidated: null, lastPoints: 0,
    doublePoints: false, forcePublicVote: false, forcedValidate: false,
    activePower: null, spectatorPowers, usedChallengeIds: [...usedIds, challenge.id],
  });
  await db.update(homeSessionsTable).set({ currentRound: roundNumber }).where(eq(homeSessionsTable.id, id));
  req.log.info({ sessionId: id, round: roundNumber, player: players.find(p => p.id === selectedId)?.nickname }, "[AdultBottle] spin → challenge");
  res.json({ ok: true });
});

// POST /adult/use-power — spectator uses superpower
router.post("/home/sessions/:id/adult/use-power", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "challenge") { res.status(409).json({ error: "Non in fase sfida" }); return; }
  const { playerId, power } = req.body as { playerId: string; power: string };
  const spectatorPowers = { ...((rp["spectatorPowers"] ?? {}) as Record<string, string | null>) };
  if (spectatorPowers[playerId] !== power) { res.status(409).json({ error: "Potere non disponibile" }); return; }
  const players = await getPlayers(id);
  const patch: Record<string, unknown> = {
    spectatorPowers: { ...spectatorPowers, [playerId]: null },
    activePower: { playerId, nickname: players.find(p => p.id === playerId)?.nickname ?? "?", power },
  };
  if (power === "reroll") {
    const nc = await pickBottleChallenge(Number(rp["level"] ?? 1), (rp["usedChallengeIds"] ?? []) as string[]);
    if (nc) { patch["currentChallenge"] = nc; patch["usedChallengeIds"] = [...(rp["usedChallengeIds"] ?? []) as string[], nc.id]; patch["challengeEndsAt"] = new Date(Date.now() + (nc.durationSeconds ?? 60) * 1000).toISOString(); }
  } else if (power === "extra_time") {
    patch["challengeEndsAt"] = new Date(new Date(String(rp["challengeEndsAt"] ?? new Date())).getTime() + 30_000).toISOString();
  } else if (power === "swap_player") {
    const active = (rp["activePlayers"] ?? []) as string[];
    const others = active.filter(p => p !== String(rp["selectedPlayerId"]));
    if (others.length > 0) { const nid = others[Math.floor(Math.random() * others.length)]!; patch["selectedPlayerId"] = nid; patch["selectedPlayerNickname"] = players.find(p => p.id === nid)?.nickname ?? "?"; }
  } else if (power === "validate") { patch["forcedValidate"] = true;
  } else if (power === "double_points") { patch["doublePoints"] = true;
  } else if (power === "public_vote") { patch["forcePublicVote"] = true; }
  await adultUpdate(id, patch);
  res.json({ ok: true });
});

// POST /adult/complete — challenge done → voting (if allowPublicVote) or instant result
router.post("/home/sessions/:id/adult/complete", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "challenge") { res.status(409).json({ error: "Non in fase sfida" }); return; }
  const challenge = rp["currentChallenge"] as BottleChallenge | null;
  const selectedId = String(rp["selectedPlayerId"] ?? "");
  const basePoints = (challenge?.durationSeconds ?? 60) >= 90 ? 200 : 150;
  const pts = Boolean(rp["doublePoints"]) ? basePoints * 2 : basePoints;
  const players = await getPlayers(id);
  if (Boolean(rp["forcedValidate"])) {
    const sel = players.find(p => p.id === selectedId);
    if (sel) await db.update(homePlayersTable).set({ score: sel.score + pts }).where(eq(homePlayersTable.id, selectedId));
    const updated = await getPlayers(id);
    await adultUpdate(id, { phase: "result", lastValidated: true, lastPoints: pts, rankingData: aoRanking(updated, { [selectedId]: pts }), activePower: null });
  } else if ((challenge?.allowPublicVote ?? false) || Boolean(rp["forcePublicVote"])) {
    await adultUpdate(id, { phase: "voting", votes: {}, votingEndsAt: new Date(Date.now() + 30_000).toISOString(), activePower: null });
  } else {
    const sel = players.find(p => p.id === selectedId);
    if (sel) await db.update(homePlayersTable).set({ score: sel.score + pts }).where(eq(homePlayersTable.id, selectedId));
    const updated = await getPlayers(id);
    await adultUpdate(id, { phase: "result", lastValidated: true, lastPoints: pts, rankingData: aoRanking(updated, { [selectedId]: pts }), activePower: null });
  }
  res.json({ ok: true });
});

// POST /adult/skip — skip challenge, no points → result
router.post("/home/sessions/:id/adult/skip", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "challenge") { res.status(409).json({ error: "Non in fase sfida" }); return; }
  await adultUpdate(id, { phase: "result", lastValidated: false, lastPoints: 0, rankingData: aoRanking(await getPlayers(id)), activePower: null });
  res.json({ ok: true });
});

// POST /adult/vote — player votes ok/fail during voting phase
router.post("/home/sessions/:id/adult/vote", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "voting") { res.status(409).json({ error: "Votazione non aperta" }); return; }
  const { playerId, vote } = req.body as { playerId: string; vote: "ok" | "fail" };
  if (!["ok", "fail"].includes(vote)) { res.status(400).json({ error: "Voto non valido" }); return; }
  const votes = { ...((rp["votes"] ?? {}) as Record<string, string>), [playerId]: vote };
  const players = await getPlayers(id);
  const selectedId = String(rp["selectedPlayerId"] ?? "");
  const voterIds = [...new Set([...(rp["activePlayers"] ?? []) as string[], ...(rp["spectatorPlayers"] ?? []) as string[]])].filter(v => v !== selectedId);
  if (voterIds.every(vid => votes[vid])) {
    const ok = Object.values(votes).filter(v => v === "ok").length;
    const validated = ok >= Object.values(votes).filter(v => v === "fail").length;
    const challenge = rp["currentChallenge"] as BottleChallenge | null;
    const base = (challenge?.durationSeconds ?? 60) >= 90 ? 200 : 150;
    const pts = validated ? (Boolean(rp["doublePoints"]) ? base * 2 : base) : 0;
    if (validated) { const sel = players.find(p => p.id === selectedId); if (sel) await db.update(homePlayersTable).set({ score: sel.score + pts }).where(eq(homePlayersTable.id, selectedId)); }
    const updated = await getPlayers(id);
    await adultUpdate(id, { votes, phase: "result", lastValidated: validated, lastPoints: pts, rankingData: aoRanking(updated, validated ? { [selectedId]: pts } : {}) });
  } else {
    await adultUpdate(id, { votes });
  }
  res.json({ ok: true });
});

// POST /adult/close-vote — host closes voting early
router.post("/home/sessions/:id/adult/close-vote", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "voting") { res.status(409).json({ error: "Votazione non aperta" }); return; }
  const votes = (rp["votes"] ?? {}) as Record<string, string>;
  const ok = Object.values(votes).filter(v => v === "ok").length;
  const validated = ok >= Object.values(votes).filter(v => v === "fail").length;
  const challenge = rp["currentChallenge"] as BottleChallenge | null;
  const base = (challenge?.durationSeconds ?? 60) >= 90 ? 200 : 150;
  const pts = validated ? (Boolean(rp["doublePoints"]) ? base * 2 : base) : 0;
  const selectedId = String(rp["selectedPlayerId"] ?? "");
  const players = await getPlayers(id);
  if (validated) { const sel = players.find(p => p.id === selectedId); if (sel) await db.update(homePlayersTable).set({ score: sel.score + pts }).where(eq(homePlayersTable.id, selectedId)); }
  const updated = await getPlayers(id);
  await adultUpdate(id, { phase: "result", lastValidated: validated, lastPoints: pts, rankingData: aoRanking(updated, validated ? { [selectedId]: pts } : {}) });
  res.json({ ok: true });
});

// POST /adult/propose-level — propose level escalation
router.post("/home/sessions/:id/adult/propose-level", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult") { res.status(409).json({ error: "Non in modalità adult" }); return; }
  const { targetLevel } = req.body as { targetLevel: number };
  if (![1,2,3,4,5].includes(targetLevel)) { res.status(400).json({ error: "Livello non valido" }); return; }
  await adultUpdate(id, { phase: "escalation", escalationTarget: targetLevel, escalationVotes: {} });
  res.json({ ok: true });
});

// POST /adult/level-vote — player votes on escalation
router.post("/home/sessions/:id/adult/level-vote", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult" || String(rp["phase"]) !== "escalation") { res.status(409).json({ error: "Escalation non aperta" }); return; }
  const { playerId, approve } = req.body as { playerId: string; approve: boolean };
  const escalationVotes = { ...((rp["escalationVotes"] ?? {}) as Record<string, boolean>), [playerId]: approve };
  const activePlayers = (rp["activePlayers"] ?? []) as string[];
  if (activePlayers.every(pid => escalationVotes[pid] !== undefined)) {
    const approved = activePlayers.filter(pid => escalationVotes[pid] === true);
    const declined = activePlayers.filter(pid => escalationVotes[pid] === false);
    const targetLevel = Number(rp["escalationTarget"] ?? Number(rp["level"] ?? 1));
    const levelObj = BOTTLE_LEVELS.find(l => l.level === targetLevel);
    if (approved.length === 0) {
      await adultUpdate(id, { escalationVotes, phase: "result", escalationTarget: null });
    } else {
      await adultUpdate(id, {
        escalationVotes, phase: "result", escalationTarget: null,
        level: targetLevel, levelLabel: levelObj?.label ?? `Livello ${targetLevel}`, levelColor: levelObj?.color ?? "#F87171",
        activePlayers: approved, spectatorPlayers: [...((rp["spectatorPlayers"] ?? []) as string[]), ...declined],
        usedChallengeIds: [],
      });
    }
  } else {
    await adultUpdate(id, { escalationVotes });
  }
  res.json({ ok: true });
});

// POST /adult/emergency — emergency stop
router.post("/home/sessions/:id/adult/emergency", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult") { res.status(409).json({ error: "Non in modalità adult" }); return; }
  await adultUpdate(id, { phase: "ended", emergencyStop: true, rankingData: aoRanking(await getPlayers(id)) });
  res.json({ ok: true });
});

// POST /adult/end — end game
router.post("/home/sessions/:id/adult/end", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-adult") { res.status(409).json({ error: "Non in modalità adult" }); return; }
  await adultUpdate(id, { phase: "ended", emergencyStop: false, rankingData: aoRanking(await getPlayers(id)) });
  res.json({ ok: true });
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

  // ── BYPASS: karaoke-battle → direct KaraokeLiveBoard (no theme_select / booking) ──
  if (gameSlug === "karaoke-battle") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] karaoke-battle → KaraokeLiveBoard direct, skipping GameFlowEngine");
    const kPlayers = await getPlayers(id);
    const karaokeState = createBlankKaraokeState(
      kPlayers.map(p => ({ id: p.id, nickname: p.nickname, avatarColor: (p as Record<string,unknown>)["avatarColor"] as string ?? "#A78BFA" }))
    );
    const karaokePayload: RoundPayload = { mode: "home-karaoke-live", gameSlug: "karaoke-battle" } as RoundPayload;
    const karaokeCfg = { ...cfg, phase: "playing", gamesPlayed, karaokeHomeState: karaokeState };
    const [karaokeUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: karaokeCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 1,
      roundPayload: karaokePayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    const kPlayersAfter = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: karaokeUpdated, players: kPlayersAfter, payload: karaokePayload });
    emitToRoom(homeRoom(id), "home:state", { session: karaokeUpdated, players: kPlayersAfter });
    res.json({ session: karaokeUpdated, players: kPlayersAfter });
    return;
  }

  // ── BYPASS: quizzone → direct QuizzoneBoard with full setup flow ─────────────
  if (gameSlug === "quizzone") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] quizzone → QuizzoneBoard setup flow");
    const qPayload: RoundPayload = {
      mode: "home-quizzone",
      phase: "setup_theme",
      theme: null,
      themeName: null,
      questionCount: 10,
      questions: [],
      currentIndex: -1,
      countdownValue: null,
      currentClueIndex: 0,
      allAnsweredForCurrent: false,
      revealData: null,
      rankingData: null,
    };
    const qCfg = { ...cfg, phase: "playing", gamesPlayed };
    const [qUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: qCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 0,
      roundPayload: qPayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    const qPlayers = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: qUpdated, players: qPlayers, payload: qPayload });
    emitToRoom(homeRoom(id), "home:state", { session: qUpdated, players: qPlayers });
    res.json({ session: qUpdated, players: qPlayers });
    return;
  }

  // ── BYPASS: percorso-a-risate → direct PercorsoBoard/RisateEngine (no theme_select) ──
  if (gameSlug === "percorso-a-risate") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] percorso-a-risate → PercorsoBoard direct, skipping GameFlowEngine");
    const percorsoPayload: RoundPayload = { mode: "home-percorso", gameSlug: "percorso-a-risate" } as RoundPayload;
    const percorsoCfg = { ...cfg, phase: "playing", gamesPlayed };
    const [percorsoUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: percorsoCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 1,
      roundPayload: percorsoPayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    const pPlayers = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: percorsoUpdated, players: pPlayers, payload: percorsoPayload });
    emitToRoom(homeRoom(id), "home:state", { session: percorsoUpdated, players: pPlayers });
    res.json({ session: percorsoUpdated, players: pPlayers });
    return;
  }

  // ── BYPASS: gioco-coppie → direct home-coppie suggestion phase ───────────────
  if (gameSlug === "gioco-coppie") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] gioco-coppie → home-coppie suggestion phase, skipping old theme_select");
    const coppiePayload = await loadCoppieRound(0) as RoundPayload;
    const coppieCfg = { ...cfg, phase: "playing", gamesPlayed };
    const [coppieUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: coppieCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 1,
      roundPayload: coppiePayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    if (!coppieUpdated) { res.status(500).json({ error: "Errore avvio coppie" }); return; }
    const coppPlayers = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: coppieUpdated, players: coppPlayers, payload: coppiePayload });
    emitToRoom(homeRoom(id), "home:state", { session: coppieUpdated, players: coppPlayers });
    res.json({ session: coppieUpdated, players: coppPlayers });
    return;
  }

  // ── BYPASS: saramusica → Sara'Musica new Jonny AI show flow ─────────────────
  if (gameSlug === "saramusica") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] saramusica → Sara'Musica new show flow, skipping old DB loader");
    const smPayload: RoundPayload = {
      mode: "home-saramusica",
      phase: "setup_theme",
      theme: null,
      themeName: null,
      roundCount: 10,
      rounds: [],
      currentIndex: -1,
      countdownValue: null,
      currentClueIndex: 0,
      allAnsweredForCurrent: false,
      answeredCount: 0,
      revealData: null,
      rankingData: null,
    };
    const smCfg = { ...cfg, phase: "playing", gamesPlayed };
    const [smUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: smCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 0,
      roundPayload: smPayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    if (!smUpdated) { res.status(500).json({ error: "Errore avvio saramusica" }); return; }
    const smPlayers = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: smUpdated, players: smPlayers, payload: smPayload });
    emitToRoom(homeRoom(id), "home:state", { session: smUpdated, players: smPlayers });
    res.json({ session: smUpdated, players: smPlayers });
    return;
  }

  // ── BYPASS: adult-only → Bottiglia Party Engine v2 ──────────────────────────
  if (gameSlug === "adult-only") {
    req.log.info({ sessionId: id }, "[FLOW_BYPASS] adult-only → Bottiglia Party Engine v2 (consent → challenge loop)");
    const adultPayload: RoundPayload = {
      mode: "home-adult",
      phase: "consent",
      level: 1,
      levelLabel: "Sociale",
      levelColor: "#34D399",
      roundNumber: 0,
      consentMap: {},
      activePlayers: [],
      spectatorPlayers: [],
      selectedPlayerId: null,
      selectedPlayerNickname: null,
      currentChallenge: null,
      challengeEndsAt: null,
      votes: {},
      votingEndsAt: null,
      lastValidated: null,
      lastPoints: 0,
      doublePoints: false,
      forcePublicVote: false,
      forcedValidate: false,
      activePower: null,
      spectatorPowers: {},
      usedChallengeIds: [],
      escalationTarget: null,
      escalationVotes: {},
      rankingData: [],
      emergencyStop: false,
    };
    const adultCfg = { ...cfg, phase: "playing", gamesPlayed };
    const [adultUpdated] = await db.update(homeSessionsTable).set({
      gameSlug,
      gameConfig: adultCfg,
      status: "playing",
      currentRound: 0,
      totalRounds: 0,
      roundPayload: adultPayload,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    }).where(eq(homeSessionsTable.id, id)).returning();
    if (!adultUpdated) { res.status(500).json({ error: "Errore avvio adult-only" }); return; }
    const adultPlayers = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:game_started", { session: adultUpdated, players: adultPlayers, payload: adultPayload });
    emitToRoom(homeRoom(id), "home:state", { session: adultUpdated, players: adultPlayers });
    res.json({ session: adultUpdated, players: adultPlayers });
    return;
  }

  // ── Universal GameFlowEngine: all other games enter the pre-game flow ──────────
  // theme_select → booking (if maxPlayers > 0) → confirm → countdown → launch
  const flowConfig = await loadThemesForGame(gameSlug);
  req.log.info({ sessionId: id, gameSlug, themeCount: flowConfig.themes.length, maxPlayers: flowConfig.maxPlayers }, "[GameFlow] select-game → entering flow");
  const flowPayload: RoundPayload = {
    mode: "home-flow",
    gameFlowPhase: "theme_select",
    gameSlug,
    themes: flowConfig.themes,
    selectedTheme: null,
    bookedPlayers: [],
    maxPlayers: flowConfig.maxPlayers,
  };
  const newFlowCfg = { ...cfg, phase: "playing", gamesPlayed };
  const [flowUpdated] = await db.update(homeSessionsTable).set({
    gameSlug,
    gameConfig: newFlowCfg,
    status: "playing",
    currentRound: 0,
    totalRounds: 0,
    roundPayload: flowPayload,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  }).where(eq(homeSessionsTable.id, id)).returning();
  const flowPlayers = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:game_started", { session: flowUpdated, players: flowPlayers, payload: flowPayload });
  emitToRoom(homeRoom(id), "home:state", { session: flowUpdated, players: flowPlayers });
  res.json({ session: flowUpdated, players: flowPlayers });
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
  const firstRound = { ...(preloadedRounds[0] ?? {}), roundStartedAt: new Date().toISOString() };
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

// ── POST /home/sessions/:id/flow/select-theme ─────────────────────────────────
router.post("/home/sessions/:id/flow/select-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-flow") { res.status(409).json({ error: "Sessione non in modalità flow" }); return; }

  // ── Idempotency: if theme is already selected (past theme_select), re-emit and return OK ──
  // Covers double-clicks, lost socket events, and retries from any device.
  if (rp["selectedTheme"] != null && rp["gameFlowPhase"] !== "theme_select") {
    req.log.info({ sessionId: id, gameFlowPhase: rp["gameFlowPhase"] }, "[HomeFlow] select-theme already past theme_select — re-emitting home:state");
    const players = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:state", { session, players });
    res.json({ session, players });
    return;
  }

  if (rp["gameFlowPhase"] !== "theme_select") { res.status(409).json({ error: "Fase non corretta" }); return; }

  const { themeId, themeName, themeDescription } = req.body as {
    themeId: string; themeName: string; themeDescription?: string;
  };
  if (!themeId || !themeName) { res.status(400).json({ error: "themeId e themeName obbligatori" }); return; }

  const selectedTheme = { id: themeId, name: themeName, description: themeDescription ?? "" };
  req.log.info({ sessionId: id, themeId, themeName }, "[BalloTheme] select-theme storing selectedTheme → booking");

  const updatedRp: RoundPayload = { ...rp, gameFlowPhase: "booking", selectedTheme } as RoundPayload;
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp })
    .where(eq(homeSessionsTable.id, id)).returning();

  if (!updated) {
    req.log.error({ sessionId: id }, "[BalloTheme] select-theme DB update returned no rows");
    res.status(500).json({ error: "Errore interno: sessione non aggiornata" }); return;
  }

  const phaseAfter = (updated.roundPayload as Record<string,unknown>)?.["gameFlowPhase"];
  req.log.info({ sessionId: id, phaseAfter, selectedTheme }, "[BalloTheme] phase after select-theme");

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ session: updated, players });
});

// ── POST /home/sessions/:id/flow/select-subtype (karaoke-battle only) ───────────
router.post("/home/sessions/:id/flow/select-subtype", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-flow") { res.status(409).json({ error: "Sessione non in modalità flow" }); return; }
  if (rp["gameSlug"] === "karaoke-battle") {
    req.log.error({ sessionId: id }, "[FLOW_BUG] karaoke-battle hit select-subtype — it should have bypassed GameFlowEngine in select-game");
  }
  if (rp["gameFlowPhase"] !== "subtype_select") { res.status(409).json({ error: "Fase non corretta" }); return; }

  const { subtype } = req.body as { subtype?: string };
  if (!subtype || !["karaoke-only", "freestyle-only", "mixed"].includes(subtype)) {
    res.status(400).json({ error: "subtype non valido (karaoke-only | freestyle-only | mixed)" }); return;
  }

  req.log.info({ sessionId: id, subtype }, "[KaraokeFlow] select-subtype");

  // For freestyle-only: replace themes with available freestyle sets
  let themes = (rp["themes"] as Array<{ id: string; name: string; description: string }>) ?? [];
  if (subtype === "freestyle-only") {
    const fSets = await db.select().from(freestyleSetsTable)
      .where(eq(freestyleSetsTable.isActive, true))
      .orderBy(desc(freestyleSetsTable.createdAt)).limit(6);
    themes = fSets.length > 0
      ? fSets.map(s => ({ id: s.id, name: s.title, description: "" }))
      : [{ id: "fallback", name: "Freestyle Classico", description: "Parole per rap improvvisato" }];
  }

  const updatedRp: RoundPayload = { ...rp, selectedSubtype: subtype, themes, gameFlowPhase: "theme_select" } as RoundPayload;
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp })
    .where(eq(homeSessionsTable.id, id)).returning();

  if (!updated) { res.status(500).json({ error: "Errore interno: sessione non aggiornata" }); return; }

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ session: updated, players });
});

// ── POST /home/sessions/:id/flow/book-player ──────────────────────────────────
router.post("/home/sessions/:id/flow/book-player", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-flow") { res.status(409).json({ error: "Sessione non in modalità flow" }); return; }
  if (rp["gameFlowPhase"] !== "booking") { res.status(409).json({ error: "Prenotazione non aperta" }); return; }

  const { playerId, nickname, avatarColor, action, role } = req.body as {
    playerId: string; nickname?: string; avatarColor?: string; action: "book" | "unbook"; role?: "guesser" | "suggester";
  };
  if (!playerId) { res.status(400).json({ error: "playerId obbligatorio" }); return; }

  const maxPlayers = Number(rp["maxPlayers"] ?? 2);
  const players = await getPlayers(id);
  const gameSlug = String(rp["gameSlug"] ?? "");

  // Purge disconnected bookings — but always treat the requesting player as connected
  // (their isConnected flag may be momentarily false during a socket reconnect).
  const connectedIds = new Set(players.filter((p) => p.isConnected || p.id === playerId).map((p) => p.id));
  let booked = ((rp["bookedPlayers"] as Array<{ id: string; nickname: string; avatarColor: string; role?: string }>) ?? [])
    .filter((b) => connectedIds.has(b.id));

  if (action === "unbook") {
    booked = booked.filter((b) => b.id !== playerId);
  } else {
    if (booked.length >= maxPlayers) {
      res.status(409).json({ error: "Posti esauriti" }); return;
    }
    // For parola-alle-spalle: each role slot (guesser/suggester) can only be taken by one player
    if (gameSlug === "parola-alle-spalle" && role) {
      const roleConflict = (booked as Array<{ id: string; role?: string }>).find(b => b.role === role && b.id !== playerId);
      if (roleConflict) {
        res.status(409).json({ error: "Ruolo già occupato" }); return;
      }
    }
    if (!booked.find((b) => b.id === playerId)) {
      booked = [...booked, { id: playerId, nickname: nickname ?? "?", avatarColor: avatarColor ?? "#A78BFA", ...(role ? { role } : {}) }];
    }
  }

  // Explicitly carry selectedTheme forward (belt-and-suspenders on top of ...rp spread)
  const selectedTheme = (rp["selectedTheme"] as Record<string,unknown> | null | undefined) ?? null;
  const updatedRp: RoundPayload = { ...rp, selectedTheme, bookedPlayers: booked } as RoundPayload;
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp })
    .where(eq(homeSessionsTable.id, id)).returning();
  req.log.info({ sessionId: id, action, playerId, bookedCount: booked.length, bookedIds: booked.map(b => b.id) }, "[BalloTheme] bookedPlayers after book-player");
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  emitToRoom(homeRoom(id), "home:player_booked", { bookedPlayers: booked });
  res.json({ session: updated, bookedPlayers: booked });
});

// ── POST /home/sessions/:id/flow/confirm ──────────────────────────────────────
router.post("/home/sessions/:id/flow/confirm", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (rp["mode"] !== "home-flow") { res.status(409).json({ error: "Sessione non in modalità flow" }); return; }
  if (rp["gameFlowPhase"] === "countdown" || rp["gameFlowPhase"] === "confirm") {
    res.status(409).json({ error: "Già in avvio" }); return;
  }
  if (rp["gameFlowPhase"] !== "booking") { res.status(409).json({ error: "Fase non corretta" }); return; }

  const maxPlayers = Number(rp["maxPlayers"] ?? 2);
  const players = await getPlayers(id);

  // Purge disconnected bookings
  const connectedIds = new Set(players.filter((p) => p.isConnected).map((p) => p.id));
  const booked = ((rp["bookedPlayers"] as Array<{ id: string }>) ?? [])
    .filter((b) => connectedIds.has(b.id));

  if (booked.length < maxPlayers) {
    res.status(409).json({ error: `Servono ${maxPlayers} giocatori connessi (prenotati: ${booked.length})` }); return;
  }

  const selectedTheme = rp["selectedTheme"] as { id: string; name: string } | null;

  // Move to confirm phase (brief transition shown to TV/phones)
  logger.info({ sessionId: id, bookedCount: booked.length }, "[BalloFlow] confirm");
  const confirmRp: RoundPayload = { ...rp, gameFlowPhase: "confirm", bookedPlayers: booked } as RoundPayload;
  const [confirmUpdated] = await db.update(homeSessionsTable)
    .set({ roundPayload: confirmRp })
    .where(eq(homeSessionsTable.id, id)).returning();
  emitToRoom(homeRoom(id), "home:state", { session: confirmUpdated, players });
  res.json({ ok: true });

  // After a brief pause: move to countdown, then load real ballo rounds
  setTimeout(async () => {
    try {
      logger.info({ sessionId: id }, "[BalloFlow] countdown");
      const countdownRp: RoundPayload = { ...confirmRp, gameFlowPhase: "countdown" } as RoundPayload;
      const [cdUpdated] = await db.update(homeSessionsTable)
        .set({ roundPayload: countdownRp })
        .where(eq(homeSessionsTable.id, id)).returning();
      const cdPlayers = await getPlayers(id);
      emitToRoom(homeRoom(id), "home:state", { session: cdUpdated, players: cdPlayers });

      // After countdown (4s) load real ballo rounds and fire home:round
      logger.info({ sessionId: id }, "[BalloFlow] countdown done — waiting 4s for ballo launch");
      setTimeout(async () => {
        try {
          const launchSlug = String(rp["gameSlug"] ?? "sfida-ballo");
          logger.info({ sessionId: id, selectedTheme, gameSlug: launchSlug }, "[GameFlow] launching game");
          const selectedSubtype = rp["selectedSubtype"] ? String(rp["selectedSubtype"]) : undefined;
          const preloadedRounds = await loadGameRoundsForTheme(launchSlug, selectedTheme, selectedSubtype);
          const bp = ((confirmRp as Record<string, unknown>)["bookedPlayers"] as Array<{id: string; nickname: string}>) ?? [];
          // For parola-alle-spalle: stamp guesserId/suggesterId from role-based booking.
          // Players choose their role (guesser/suggester) at booking time — fixed for all rounds.
          // Falls back to index 0/1 if no explicit roles were assigned.
          const typedBp = bp as Array<{ id: string; nickname: string; role?: string }>;
          const guesserBp   = typedBp.find(b => b.role === "guesser")   ?? bp[0];
          const suggesterBp = typedBp.find(b => b.role === "suggester") ?? bp[1];
          const stampedRounds = launchSlug === "parola-alle-spalle" && bp.length >= 2
            ? preloadedRounds.map((r) => ({
                ...r,
                guesserId:         guesserBp?.id       ?? null,
                guesserNickname:   guesserBp?.nickname  ?? null,
                suggesterId:       suggesterBp?.id      ?? null,
                suggesterNickname: suggesterBp?.nickname ?? null,
              }))
            : preloadedRounds;
          // Carry bookedPlayers into the round payload so TV boards can filter participants.
          const firstRound: RoundPayload = {
            ...(stampedRounds[0] ?? {}),
            roundStartedAt: new Date().toISOString(),
            bookedPlayers: bp,
          } as RoundPayload;
          logger.info({ sessionId: id, mode: firstRound["mode"], bookedCount: bp.length, gameSlug: launchSlug }, "[GameFlow] payload mode");
          const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
          const gamesPlayed = (cfg["gamesPlayed"] as string[]) ?? [];
          // FIX: auto-init karaokeHomeState v3 so KaraokeLiveBoard can mount
          const karaokeInit = launchSlug === "karaoke-battle"
            ? { karaokeHomeState: createBlankKaraokeState(
                bp.map(p => ({ id: p.id, nickname: p.nickname, avatarColor: (p as Record<string,unknown>)["avatarColor"] as string ?? "#A78BFA" }))
              ) }
            : {};
          const newCfg = { ...cfg, phase: "playing", gamesPlayed, preloadedRounds: stampedRounds, ...karaokeInit };
          const [gameUpdated] = await db.update(homeSessionsTable).set({
            gameConfig: newCfg,
            currentRound: 0,
            totalRounds: preloadedRounds.length,
            roundPayload: firstRound,
          }).where(eq(homeSessionsTable.id, id)).returning();
          const gamePlayers = await getPlayers(id);
          emitToRoom(homeRoom(id), "home:round", { round: 0, payload: firstRound });
          emitToRoom(homeRoom(id), "home:state", { session: gameUpdated, players: gamePlayers });
          logger.info({ sessionId: id }, "[BalloFlow] home:round emitted");
        } catch (err) {
          logger.error({ err, sessionId: id }, "flow/confirm: ballo round load failed");
        }
      }, 4000);
    } catch (err) {
      logger.error({ err, sessionId: id }, "flow/confirm: countdown transition failed");
    }
  }, 500);
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

  // Auto-score Ballo before advancing — highest peak energy wins this round
  const currentPayload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(currentPayload.mode ?? "") === "home-ballo") {
    const playersForBallo = await getPlayers(id);
    await autoScoreBallo(id, playersForBallo).catch((err) =>
      logger.error({ err, sessionId: id }, "autoScoreBallo failed in /next"),
    );
  }

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

  // ── WordBack rotation: after every 3 words, open a 10-second booking window ──
  const currentMode = String(currentPayload.mode ?? "");
  if (currentMode === "home-wordback-booking") {
    // Booking timer is managing advancement — reject duplicate next calls
    res.status(409).json({ error: "Fase di prenotazione in corso" });
    return;
  }
  let wbCompletedCount = Number(cfg.wordBackPairRoundCount ?? 0);
  if (currentMode === "home-wordback") {
    wbCompletedCount += 1;
    if (wbCompletedCount >= 3) {
      const prevPair = {
        guesserId:   String(currentPayload["guesserId"]   ?? ""),
        suggesterId: String(currentPayload["suggesterId"] ?? ""),
      };
      await enterWordBackBookingPhase(id, nextRound, preloadedRounds, cfg, prevPair);
      res.json({ gameEnded: false, bookingPhase: true });
      return;
    }
  }

  // Next round within current game — stamp authoritative start time.
  // Carry bookedPlayers forward so TV boards (e.g. BalloBoard) can filter participants on every round.
  const bookedPlayers = Array.isArray(currentPayload["bookedPlayers"]) ? currentPayload["bookedPlayers"] : [];

  // For parola-alle-spalle: carry the active pair forward on every non-rotating round
  const wordbackPairFields = currentMode === "home-wordback" ? {
    guesserId:         currentPayload["guesserId"]         ?? null,
    guesserNickname:   currentPayload["guesserNickname"]   ?? null,
    suggesterId:       currentPayload["suggesterId"]       ?? null,
    suggesterNickname: currentPayload["suggesterNickname"] ?? null,
  } : {};

  const nextPayload = {
    ...(preloadedRounds[nextRound] ?? { mode: "unknown", roundIndex: nextRound }),
    roundStartedAt: new Date().toISOString(),
    ...(bookedPlayers.length > 0 ? { bookedPlayers } : {}),
    ...wordbackPairFields,
  };

  const [updated] = await db.update(homeSessionsTable).set({
    currentRound: nextRound,
    roundPayload: nextPayload,
    ...(currentMode === "home-wordback"
      ? { gameConfig: { ...cfg, wordBackPairRoundCount: wbCompletedCount } }
      : {}),
  }).where(eq(homeSessionsTable.id, id)).returning();

  emitToRoom(homeRoom(id), "home:round", { round: nextRound, payload: nextPayload });
  await broadcastState(id);
  res.json({ gameEnded: false, session: updated, payload: nextPayload });
});

// ── Ballo Tournament: shared types ────────────────────────────────────────────
type BalloTeamPlayer = { id: string; nickname: string; avatarColor: string };
type BalloTeam = { teamId: "A" | "B"; players: BalloTeamPlayer[]; pendingRequests: BalloTeamPlayer[] };

// ── autoScoreBalloTournament — scores a completed ballo round ─────────────────
// Stage 1: highest individual energy wins; Stage 2/3: team with highest combined energy wins.
async function autoScoreBalloTournament(
  sessionId: string,
  players: { id: string; score: number; nickname: string }[],
  payload: Record<string, unknown>,
): Promise<void> {
  const splitPrize = Boolean(payload["splitPrize"]);
  const prizePoints = Number(payload["prizePoints"] ?? 150);
  const teams = (payload["teams"] ?? []) as BalloTeam[];

  const energies = getBalloEnergies(sessionId);
  clearBalloEnergies(sessionId);

  if (!splitPrize || teams.length === 0) {
    // Stage 1: solo — highest energy player wins
    if (Object.keys(energies).length === 0) {
      emitToRoom(`home:${sessionId}`, "home:ballo_result", {
        winnerId: null, winnerNickname: null, points: prizePoints, energies: {}, teamResult: null,
      });
      return;
    }
    let winnerId = "", maxEnergy = -1;
    for (const [pid, e] of Object.entries(energies)) {
      if (e > maxEnergy) { maxEnergy = e; winnerId = pid; }
    }
    const winner = players.find((p) => p.id === winnerId);
    if (!winner) {
      logger.warn({ sessionId, winnerId }, "[BalloCrashGuard] solo winner id not in players list — emitting null result so TV transitions to result phase");
      emitToRoom(`home:${sessionId}`, "home:ballo_result", {
        winnerId: null, winnerNickname: null, points: prizePoints, energies, teamResult: null,
      });
      return;
    }
    const newScore = winner.score + prizePoints;
    await db.update(homePlayersTable).set({ score: newScore })
      .where(and(eq(homePlayersTable.id, winnerId), eq(homePlayersTable.sessionId, sessionId)));
    logger.info({ sessionId, winnerId, prizePoints, newScore }, "[Ballo] solo winner scored");
    emitToRoom(`home:${sessionId}`, "home:ballo_result", {
      winnerId,
      winnerNickname: winner.nickname,
      points: prizePoints,
      energies,
      teamResult: null,
    });
    return;
  }

  // Stages 2/3: team competition — sum energy per team, winning team splits prize
  const teamScores = teams.map((team) => {
    const totalEnergy = team.players.reduce((s, p) => s + (energies[p.id] ?? 0), 0);
    return { team, totalEnergy };
  });
  teamScores.sort((a, b) => b.totalEnergy - a.totalEnergy);

  const winningEntry = teamScores[0];
  if (!winningEntry || winningEntry.team.players.length === 0) {
    logger.warn({ sessionId, teamsLen: teams.length }, "[BalloCrashGuard] no winning team entry or empty players — emitting null teamResult so TV transitions to result phase");
    emitToRoom(`home:${sessionId}`, "home:ballo_result", {
      winnerId: null, winnerNickname: null, points: prizePoints, energies,
      teamResult: null,
    });
    return;
  }

  const perPlayer = Math.floor(prizePoints / winningEntry.team.players.length);
  for (const member of winningEntry.team.players) {
    const p = players.find((pl) => pl.id === member.id);
    if (!p) continue;
    await db.update(homePlayersTable).set({ score: p.score + perPlayer })
      .where(and(eq(homePlayersTable.id, member.id), eq(homePlayersTable.sessionId, sessionId)));
  }
  logger.info({ sessionId, winnerTeamId: winningEntry.team.teamId, prizePoints, perPlayer }, "[Ballo] team winner scored");
  emitToRoom(`home:${sessionId}`, "home:ballo_result", {
    winnerId: null,
    winnerNickname: null,
    points: prizePoints,
    energies,
    teamResult: {
      winnerTeamId: winningEntry.team.teamId,
      winnerTeamPlayers: winningEntry.team.players,
      perPlayer,
      teamScores: teamScores.map((ts) => ({
        teamId: ts.team.teamId, players: ts.team.players, totalEnergy: ts.totalEnergy,
      })),
    },
  });
}

// ── POST /home/sessions/:id/ballo-round-end ───────────────────────────────────
// Called by the TV frontend when the dance timer reaches zero.
// Scores the round and transitions to 'result' phase WITHOUT advancing the round.
router.post("/home/sessions/:id/ballo-round-end", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp["mode"] ?? "") !== "home-ballo") {
    res.status(409).json({ error: "Sessione non in modalità ballo" }); return;
  }
  const balloPhase = String(rp["balloPhase"] ?? "dancing");
  if (balloPhase === "result") {
    res.json({ ok: true, already: true }); return; // idempotent
  }

  const players = await getPlayers(id);
  await autoScoreBalloTournament(id, players, rp);

  // Persist the result phase + store stage1WinnerId for ballo-stage-next
  const energies = {}; // already consumed by autoScoreBalloTournament
  const stage1WinnerId = Number(rp["balloStage"] ?? 1) === 1
    ? String((rp["bookedPlayers"] as BalloTeamPlayer[] ?? [])[0]?.id ?? "")
    : String(rp["stage1WinnerId"] ?? ""); // carry forward

  const resultRp = { ...rp, balloPhase: "result", stage1WinnerId, lastEnergies: energies };
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: resultRp })
    .where(eq(homeSessionsTable.id, id)).returning();

  const updatedPlayers = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players: updatedPlayers });
  res.json({ ok: true });
});

// ── POST /home/sessions/:id/ballo-stage-next ──────────────────────────────────
// Host clicks "PROSSIMA SFIDA" — advances from stage N result to stage N+1 booking.
// Stage 1 → 2: creates teams A/B from the 2 solo dancers (winner = team A).
// Stage 2 → 3: keeps existing teams, updates prizePoints to 1800.
router.post("/home/sessions/:id/ballo-stage-next", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp["mode"] ?? "") !== "home-ballo" || String(rp["balloPhase"] ?? "") !== "result") {
    res.status(409).json({ error: "Non in fase risultato ballo" }); return;
  }

  const balloStage = Number(rp["balloStage"] ?? 1);
  const nextStage = balloStage + 1;
  if (nextStage > 3) { res.status(409).json({ error: "Torneo ballo già concluso" }); return; }

  const bookedPlayers = (rp["bookedPlayers"] ?? []) as BalloTeamPlayer[];
  const existingTeams = (rp["teams"] ?? []) as BalloTeam[];

  let newTeams: BalloTeam[];
  if (balloStage === 1) {
    // Create teams from the 2 solo stage-1 dancers
    const winnerId = String(rp["stage1WinnerId"] ?? "");
    const teamAPlayer = bookedPlayers.find((p) => p.id === winnerId) ?? bookedPlayers[0];
    const teamBPlayer = bookedPlayers.find((p) => p.id !== (teamAPlayer?.id ?? "")) ?? bookedPlayers[1];
    if (!teamAPlayer || !teamBPlayer) {
      res.status(409).json({ error: "Dati stage 1 non sufficienti per creare le squadre" }); return;
    }
    newTeams = [
      { teamId: "A", players: [teamAPlayer], pendingRequests: [] },
      { teamId: "B", players: [teamBPlayer], pendingRequests: [] },
    ];
  } else {
    // Carry existing teams forward, clear pending requests for new round
    newTeams = existingTeams.map((t) => ({ ...t, pendingRequests: [] }));
  }

  const prizeMap: Record<number, number> = { 2: 500, 3: 1800 };
  const prizePoints = prizeMap[nextStage] ?? 500;

  // Load a fresh challenge for the next stage
  const challenges = await db.select().from(danceChallengesTable)
    .orderBy(desc(danceChallengesTable.createdAt));
  const raw = challenges.length > 0 ? (shuffleArr(challenges)[0] ?? challenges[0]) : null;
  const stageName = nextStage === 2 ? "Sfida 2: Coppie" : "Sfida Finale: Terzetti";
  const stageDesc = nextStage === 2
    ? "Le coppie si sfidano — 500 punti al duo vincente!"
    : "Il gran finale! 1800 punti al trio campione!";

  const stageRp: Record<string, unknown> = {
    mode: "home-ballo",
    balloPhase: "booking",
    balloStage: nextStage,
    teams: newTeams,
    bookedPlayers: newTeams.flatMap((t) => t.players), // existing members auto-counted
    activeDancerIds: newTeams.flatMap((t) => t.players.map((p) => p.id)),
    prizePoints,
    splitPrize: true,
    selectedTheme: rp["selectedTheme"] ?? null,
    stage1WinnerId: String(rp["stage1WinnerId"] ?? ""),
    roundIndex: session.currentRound,
    name: raw?.name ?? stageName,
    description: raw?.description ?? stageDesc,
    duration: raw?.duration ?? (nextStage === 2 ? 20 : 25),
    timeLimit: raw?.duration ?? (nextStage === 2 ? 20 : 25),
    musicHint: raw?.musicHint ?? "",
    startedAt: null,
  };

  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: stageRp })
    .where(eq(homeSessionsTable.id, id)).returning();

  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ ok: true, balloStage: nextStage, teams: newTeams });
});

// ── POST /home/sessions/:id/ballo-join-team ───────────────────────────────────
// New player requests to join team A or B during stages 2/3 booking.
router.post("/home/sessions/:id/ballo-join-team", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { playerId, nickname, avatarColor, teamId } = req.body as {
    playerId: string; nickname: string; avatarColor: string; teamId: "A" | "B";
  };
  if (!playerId || !teamId) { res.status(400).json({ error: "playerId e teamId obbligatori" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp["mode"] ?? "") !== "home-ballo" || String(rp["balloPhase"] ?? "") !== "booking") {
    res.status(409).json({ error: "Non in fase booking ballo" }); return;
  }

  const teams: BalloTeam[] = JSON.parse(JSON.stringify((rp["teams"] ?? []) as BalloTeam[]));
  const target = teams.find((t) => t.teamId === teamId);
  if (!target) { res.status(404).json({ error: "Squadra non trovata" }); return; }

  // Player already in a team → no-op
  if (teams.some((t) => t.players.some((p) => p.id === playerId))) {
    res.status(409).json({ error: "Sei già in una squadra" }); return;
  }
  // Remove any existing pending request from this player (changed mind)
  for (const team of teams) {
    team.pendingRequests = team.pendingRequests.filter((p) => p.id !== playerId);
  }
  target.pendingRequests = [...target.pendingRequests, { id: playerId, nickname: nickname ?? "?", avatarColor: avatarColor ?? "#A78BFA" }];

  const updatedRp = { ...rp, teams };
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp }).where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  emitToRoom(homeRoom(id), "home:ballo_team_updated", { teams });
  res.json({ ok: true, teams });
});

// ── POST /home/sessions/:id/ballo-accept-player ───────────────────────────────
// Existing team member accepts a pending join request.
router.post("/home/sessions/:id/ballo-accept-player", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { acceptingPlayerId, newPlayerId, teamId } = req.body as {
    acceptingPlayerId: string; newPlayerId: string; teamId: "A" | "B";
  };
  if (!acceptingPlayerId || !newPlayerId || !teamId) {
    res.status(400).json({ error: "acceptingPlayerId, newPlayerId, teamId obbligatori" }); return;
  }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp["mode"] ?? "") !== "home-ballo" || String(rp["balloPhase"] ?? "") !== "booking") {
    res.status(409).json({ error: "Non in fase booking ballo" }); return;
  }

  const teams: BalloTeam[] = JSON.parse(JSON.stringify((rp["teams"] ?? []) as BalloTeam[]));
  const target = teams.find((t) => t.teamId === teamId);
  if (!target) { res.status(404).json({ error: "Squadra non trovata" }); return; }
  if (!target.players.some((p) => p.id === acceptingPlayerId)) {
    res.status(403).json({ error: "Non sei membro di questa squadra" }); return;
  }
  const pending = target.pendingRequests.find((p) => p.id === newPlayerId);
  if (!pending) { res.status(404).json({ error: "Richiesta non trovata" }); return; }

  target.pendingRequests = target.pendingRequests.filter((p) => p.id !== newPlayerId);
  target.players = [...target.players, pending];

  const activeDancerIds = teams.flatMap((t) => t.players.map((p) => p.id));
  const bookedPlayers = teams.flatMap((t) => t.players);

  const updatedRp = { ...rp, teams, activeDancerIds, bookedPlayers };
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp }).where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  emitToRoom(homeRoom(id), "home:ballo_team_updated", { teams });
  res.json({ ok: true, teams });
});

// ── POST /home/sessions/:id/ballo-start-dance ─────────────────────────────────
// Host starts the dance for stages 2/3 after all teams are assembled.
router.post("/home/sessions/:id/ballo-start-dance", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp["mode"] ?? "") !== "home-ballo" || String(rp["balloPhase"] ?? "") !== "booking") {
    res.status(409).json({ error: "Non in fase booking ballo" }); return;
  }

  const teams = (rp["teams"] ?? []) as BalloTeam[];
  const balloStage = Number(rp["balloStage"] ?? 2);
  const requiredPerTeam = balloStage; // stage 2: 2 per team, stage 3: 3 per team

  for (const team of teams) {
    if (team.players.length < requiredPerTeam) {
      res.status(409).json({ error: `Squadra ${team.teamId}: ${team.players.length}/${requiredPerTeam} giocatori` }); return;
    }
  }

  const activeDancerIds = teams.flatMap((t) => t.players.map((p) => p.id));
  const bookedPlayers = teams.flatMap((t) => t.players);
  const danceRp = { ...rp, balloPhase: "dancing", activeDancerIds, bookedPlayers, roundStartedAt: new Date().toISOString() };

  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: danceRp }).where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:round", { round: session.currentRound, payload: danceRp });
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ ok: true, session: updated });
});

// ── POST /home/sessions/:id/ballo-reset-booking ───────────────────────────────
// Resets a running ballo round back to the booking phase so a fresh pair of
// players can sign up for the next sfida without ending the overall game.
router.post("/home/sessions/:id/ballo-reset-booking", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const currentPayload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(currentPayload.mode ?? "") !== "home-ballo") {
    res.status(409).json({ error: "Sessione non in modalità ballo" }); return;
  }
  const selectedTheme = (currentPayload["selectedTheme"] ?? null) as Record<string, unknown> | null;
  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const flowConfig = await loadThemesForGame("sfida-ballo");
  const freshRp: RoundPayload = {
    mode: "home-flow",
    gameFlowPhase: "booking",
    gameSlug: "sfida-ballo",
    themes: flowConfig.themes,
    selectedTheme,
    bookedPlayers: [],
    maxPlayers: flowConfig.maxPlayers,
  } as RoundPayload;
  const newCfg = { ...cfg, phase: "playing", preloadedRounds: [] };
  const [updated] = await db.update(homeSessionsTable).set({
    status: "playing",
    gameSlug: "sfida-ballo",
    gameConfig: newCfg,
    currentRound: 0,
    totalRounds: 0,
    roundPayload: freshRp,
  }).where(eq(homeSessionsTable.id, id)).returning();
  const players = await getPlayers(id);
  req.log.info({ sessionId: id }, "[BalloReset] reset to fresh booking phase");
  emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ session: updated, players });
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

  // Auto-score Ballo before ending — skip if ballo-round-end already scored this round
  const endGamePayload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(endGamePayload.mode ?? "") === "home-ballo" && String(endGamePayload.balloPhase ?? "dancing") !== "result") {
    const playersForBallo = await getPlayers(id);
    await autoScoreBallo(id, playersForBallo).catch((err) =>
      logger.error({ err, sessionId: id }, "autoScoreBallo failed in /end-game"),
    );
  }

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

// ── WordBack booking helpers ────────────────────────────────────────────────────
const wordbackBookingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Advance to the next actual wordback round after booking resolves. */
async function advanceToWordBackRound(
  sessionId: string,
  guesser: { id: string; nickname: string },
  suggester: { id: string; nickname: string },
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.status !== "playing") return;
  const cfg = (session.gameConfig ?? {}) as Record<string, unknown>;
  const preloadedRounds = (cfg.preloadedRounds as RoundPayload[]) ?? [];
  const pendingRoundIndex = Number(cfg.wordBackPendingRoundIndex ?? (session.currentRound + 1));
  const players = await getPlayers(sessionId);

  if (pendingRoundIndex >= session.totalRounds) {
    const gamesPlayed = (cfg.gamesPlayed as string[]) ?? [];
    const slug = session.gameSlug ?? "";
    const newGamesPlayed = slug && !gamesPlayed.includes(slug) ? [...gamesPlayed, slug] : gamesPlayed;
    const gameScoreSnapshot = (cfg.gameScores ?? {}) as Record<string, Record<string, number>>;
    if (slug) gameScoreSnapshot[slug] = Object.fromEntries(players.map(p => [p.id, p.score]));
    const newCfg = { ...cfg, phase: "board", gamesPlayed: newGamesPlayed, gameScores: gameScoreSnapshot, preloadedRounds: [] };
    const [ended] = await db.update(homeSessionsTable)
      .set({ status: "lobby", gameSlug: null, gameConfig: newCfg, roundPayload: {} as RoundPayload })
      .where(eq(homeSessionsTable.id, sessionId)).returning();
    if (ended) emitToRoom(homeRoom(sessionId), "home:game_ended", { session: ended, players, gameSlug: slug });
    return;
  }

  const baseRound: RoundPayload = preloadedRounds[pendingRoundIndex]
    ?? ({ mode: "home-wordback", roundIndex: pendingRoundIndex } as RoundPayload);
  const nextPayload: RoundPayload = {
    ...baseRound,
    guesserId: guesser.id,
    guesserNickname: guesser.nickname,
    suggesterId: suggester.id,
    suggesterNickname: suggester.nickname,
    roundStartedAt: new Date().toISOString(),
    wordBackPairRoundCount: 0,
  };
  const newCfg = { ...cfg, wordBackPairRoundCount: 0, wordBackPendingRoundIndex: null };
  const [updated] = await db.update(homeSessionsTable)
    .set({ currentRound: pendingRoundIndex, roundPayload: nextPayload, gameConfig: newCfg })
    .where(eq(homeSessionsTable.id, sessionId)).returning();
  if (updated) {
    emitToRoom(homeRoom(sessionId), "home:round", { round: pendingRoundIndex, payload: nextPayload });
    emitToRoom(homeRoom(sessionId), "home:state", { session: updated, players });
  }
}

/** Enter the 10-second role-booking interlude. */
async function enterWordBackBookingPhase(
  sessionId: string,
  nextRoundIndex: number,
  preloadedRounds: RoundPayload[],
  cfg: Record<string, unknown>,
  prevPair: { guesserId: string; suggesterId: string },
): Promise<void> {
  const players = await getPlayers(sessionId);
  const bookingUntil = Date.now() + 10_000;
  const bookingPayload: RoundPayload = {
    mode: "home-wordback-booking",
    roundIndex: nextRoundIndex,
    bookingOpenUntil: bookingUntil,
    bookedRoles: { guesser: null, suggester: null },
  };
  // Preserve preloadedRounds in cfg so advanceToWordBackRound can read them after the DB round-trip
  const newCfg = {
    ...cfg,
    wordBackPairRoundCount: 0,
    wordBackPendingRoundIndex: nextRoundIndex,
    wordBackPrevPair: prevPair,
    preloadedRounds,
  };
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: bookingPayload, gameConfig: newCfg })
    .where(eq(homeSessionsTable.id, sessionId)).returning();
  if (updated) {
    emitToRoom(homeRoom(sessionId), "home:round", { round: nextRoundIndex, payload: bookingPayload });
    emitToRoom(homeRoom(sessionId), "home:state", { session: updated, players });
  }

  const existing = wordbackBookingTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    wordbackBookingTimers.delete(sessionId);
    void autoSelectWordBackPair(sessionId, prevPair);
  }, 10_200);
  wordbackBookingTimers.set(sessionId, timer);
}

/** Auto-select pair after timer expiry; respects any partial bookings already made. */
async function autoSelectWordBackPair(
  sessionId: string,
  prevPair: { guesserId: string; suggesterId: string },
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.status !== "playing") return;
  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp.mode ?? "") !== "home-wordback-booking") return;

  const players = await getPlayers(sessionId);
  const connected = players.filter(p => p.isConnected);
  if (connected.length < 2) {
    const errPayload = { ...rp, bookingError: "Servono almeno 2 giocatori connessi" };
    const [updated] = await db.update(homeSessionsTable)
      .set({ roundPayload: errPayload })
      .where(eq(homeSessionsTable.id, sessionId)).returning();
    if (updated) emitToRoom(homeRoom(sessionId), "home:state", { session: updated, players });
    return;
  }

  const bookedRoles = (rp.bookedRoles as {
    guesser: { id: string; nickname: string } | null;
    suggester: { id: string; nickname: string } | null;
  } | null) ?? { guesser: null, suggester: null };
  let guesser = bookedRoles.guesser;
  let suggester = bookedRoles.suggester;

  if (!guesser || !suggester) {
    // Prefer players who didn't participate in the previous pair when pool is large enough
    let pool = connected;
    if (connected.length >= 4) {
      const nonPrev = connected.filter(p => p.id !== prevPair.guesserId && p.id !== prevPair.suggesterId);
      if (nonPrev.length >= 2) pool = nonPrev;
    }
    const shuffled = shuffleArr([...pool]);
    if (!guesser && shuffled[0]) guesser = { id: shuffled[0].id, nickname: shuffled[0].nickname };
    if (!suggester) {
      const sg = shuffled.find(p => p.id !== guesser?.id);
      if (sg) suggester = { id: sg.id, nickname: sg.nickname };
    }
    if (!guesser || !suggester) {
      logger.warn({ sessionId }, "autoSelectWordBackPair: not enough distinct players");
      return;
    }
  }

  await advanceToWordBackRound(sessionId, guesser, suggester);
}

// ── WordBack per-round state ────────────────────────────────────────────────────
// Tracks wrong-attempt count + closed flag per sessionId+roundIndex so the server
// owns all game-rule enforcement (penalty, 3-strike close, timer-expire close).
interface WBRoundState {
  wrongAttempts: number;
  closed: boolean;
  closeReason: "correct" | "timer_expired" | "too_many_wrong_answers" | null;
}
const wordbackRoundState = new Map<string, Map<number, WBRoundState>>();

function getWBState(sessionId: string, roundIndex: number): WBRoundState {
  if (!wordbackRoundState.has(sessionId)) wordbackRoundState.set(sessionId, new Map());
  const m = wordbackRoundState.get(sessionId)!;
  if (!m.has(roundIndex)) m.set(roundIndex, { wrongAttempts: 0, closed: false, closeReason: null });
  return m.get(roundIndex)!;
}

function normalizeWordForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

// Shared helper: close a wordback round (timeout or 3-wrong), award +50 to others.
async function closeWordBackRoundFailed(
  sessionId: string,
  roundIndex: number,
  reason: "timer_expired" | "too_many_wrong_answers",
  guesserId: string,
  suggesterId: string,
  players: Array<{ id: string; score: number; nickname: string }>,
): Promise<{ bonusPlayerIds: string[]; bonusNicknames: string[] }> {
  const state = getWBState(sessionId, roundIndex);
  state.closed = true;
  state.closeReason = reason;

  const eligible = players.filter(p => p.id !== guesserId && p.id !== suggesterId);
  await Promise.all(
    eligible.map(p =>
      db.update(homePlayersTable)
        .set({ score: p.score + 50 })
        .where(and(eq(homePlayersTable.id, p.id), eq(homePlayersTable.sessionId, sessionId)))
    ),
  );
  return { bonusPlayerIds: eligible.map(p => p.id), bonusNicknames: eligible.map(p => p.nickname) };
}

// ── POST /home/sessions/:id/wordback-correct ────────────────────────────────────
router.post("/home/sessions/:id/wordback-correct", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (payload["mode"] !== "home-wordback") {
    res.status(400).json({ error: "Sessione non in modalità wordback" }); return;
  }

  const { playerId, answerText } = req.body as { playerId?: string; answerText?: string };
  if (!playerId || !answerText) {
    res.status(400).json({ error: "playerId e answerText obbligatori" }); return;
  }

  const guesserId   = String(payload["guesserId"]   ?? "");
  const suggesterId = String(payload["suggesterId"] ?? "");
  const word        = String(payload["word"]        ?? "");
  const pts         = Number(payload["points"]      ?? 150);
  const roundIndex  = typeof payload["roundIndex"] === "number" ? payload["roundIndex"] : 0;

  if (!guesserId || playerId !== guesserId) {
    res.status(403).json({ error: "Solo l'indovinatore può rispondere" }); return;
  }

  const wbState = getWBState(id, roundIndex);

  // ── Round already closed (correct answer or timeout or 3-wrong) ──────────────
  if (wbState.closed) {
    res.status(409).json({ error: "round_closed" }); return;
  }

  // ── Server-side timer check ───────────────────────────────────────────────────
  const roundStartedAt = payload["roundStartedAt"] as string | null;
  const timeLimit      = Number(payload["timeLimit"] ?? 45);
  if (roundStartedAt) {
    const elapsed = (Date.now() - new Date(roundStartedAt).getTime()) / 1000;
    if (elapsed > timeLimit) {
      // Timer already expired — close now (idempotent, TV may or may not have fired yet)
      const players = await getPlayers(id);
      const guesserPlayer = players.find(p => p.id === guesserId);
      const { bonusPlayerIds, bonusNicknames } = await closeWordBackRoundFailed(
        id, roundIndex, "timer_expired", guesserId, suggesterId, players,
      );
      emitToRoom(homeRoom(id), "home:wordback_timeout", {
        reason: "timer_expired",
        guesserId,
        suggesterId,
        guesserNickname: guesserPlayer?.nickname ?? "",
        word,
        bonusPlayerIds,
        bonusNicknames,
        bonusPoints: 50,
      });
      await broadcastState(id);
      res.status(409).json({ error: "round_closed", reason: "timer_expired" }); return;
    }
  }

  // ── Answer matching ───────────────────────────────────────────────────────────
  const normAnswer = normalizeWordForMatch(answerText);
  const normWord   = normalizeWordForMatch(word);
  const matched = normWord.length > 0 && normAnswer.length > 0 &&
    (normAnswer === normWord || normAnswer.includes(normWord) || normWord.includes(normAnswer));

  if (!matched) {
    // ── Wrong answer: apply -50 penalty, track attempts ──────────────────────
    const players = await getPlayers(id);
    const guesserPlayer = players.find(p => p.id === guesserId);
    const PENALTY = 50;
    wbState.wrongAttempts += 1;
    const wrongAttempts = wbState.wrongAttempts;
    const MAX_ATTEMPTS  = 3;

    // Apply -50 to guesser (clamped at 0)
    if (guesserPlayer) {
      await db.update(homePlayersTable)
        .set({ score: Math.max(0, guesserPlayer.score - PENALTY) })
        .where(and(eq(homePlayersTable.id, guesserId), eq(homePlayersTable.sessionId, id)));
    }

    if (wrongAttempts >= MAX_ATTEMPTS) {
      // ── 3-strike: close round, award +50 to others, emit timeout ─────────
      const { bonusPlayerIds, bonusNicknames } = await closeWordBackRoundFailed(
        id, roundIndex, "too_many_wrong_answers", guesserId, suggesterId, players,
      );
      emitToRoom(homeRoom(id), "home:wordback_timeout", {
        reason: "too_many_wrong_answers",
        guesserId,
        suggesterId,
        guesserNickname: guesserPlayer?.nickname ?? "",
        word,
        wrongAttempts,
        bonusPlayerIds,
        bonusNicknames,
        bonusPoints: 50,
      });
      await broadcastState(id);
      res.status(422).json({
        correct: false,
        wrongAttempts,
        remainingAttempts: 0,
        penalty: PENALTY,
        roundClosed: true,
      });
      return;
    }

    // ── Still has attempts left — emit wrong-answer event for TV overlay ──
    emitToRoom(homeRoom(id), "home:wordback_wrong", {
      guesserId,
      guesserNickname: guesserPlayer?.nickname ?? "",
      word,
      wrongAttempts,
      remainingAttempts: MAX_ATTEMPTS - wrongAttempts,
      penalty: PENALTY,
    });
    await broadcastState(id);
    res.status(422).json({
      correct: false,
      wrongAttempts,
      remainingAttempts: MAX_ATTEMPTS - wrongAttempts,
      penalty: PENALTY,
      roundClosed: false,
    });
    return;
  }

  // ── Correct answer ────────────────────────────────────────────────────────────
  // Idempotent: if state was closed between the check above and here, skip.
  if (wbState.closed) { res.status(409).json({ error: "round_closed" }); return; }
  wbState.closed = true;
  wbState.closeReason = "correct";

  const players = await getPlayers(id);
  const guesserPlayer   = players.find(p => p.id === guesserId);
  const suggesterPlayer = suggesterId ? players.find(p => p.id === suggesterId) : null;

  const updates: Promise<unknown>[] = [];
  if (guesserPlayer) {
    updates.push(
      db.update(homePlayersTable)
        .set({ score: Math.max(0, guesserPlayer.score + pts) })
        .where(and(eq(homePlayersTable.id, guesserId), eq(homePlayersTable.sessionId, id)))
    );
  }
  if (suggesterPlayer) {
    updates.push(
      db.update(homePlayersTable)
        .set({ score: Math.max(0, suggesterPlayer.score + pts) })
        .where(and(eq(homePlayersTable.id, suggesterId), eq(homePlayersTable.sessionId, id)))
    );
  }
  await Promise.all(updates);

  emitToRoom(homeRoom(id), "home:wordback_correct", {
    guesserId,
    suggesterId,
    guesserNickname:   guesserPlayer?.nickname   ?? "",
    suggesterNickname: suggesterPlayer?.nickname  ?? "",
    word,
    answerText,
    pts,
  });

  await broadcastState(id);
  res.json({ ok: true, pts });
});

// ── POST /home/sessions/:id/wordback-timeout ─────────────────────────────────
// Called by the TV client when the client-side countdown reaches 0.
// Idempotent: if the round is already closed (e.g. server already caught it via
// the answer-endpoint timer-check) the request is silently accepted (200).
router.post("/home/sessions/:id/wordback-timeout", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (payload["mode"] !== "home-wordback") {
    res.status(400).json({ error: "Sessione non in modalità wordback" }); return;
  }

  const roundIndex  = typeof payload["roundIndex"] === "number" ? payload["roundIndex"] : 0;
  const guesserId   = String(payload["guesserId"]   ?? "");
  const suggesterId = String(payload["suggesterId"] ?? "");
  const word        = String(payload["word"]        ?? "");

  const wbState = getWBState(id, roundIndex);

  // Already closed — idempotent, acknowledge without re-emitting
  if (wbState.closed) {
    res.json({ ok: true, alreadyClosed: true, closeReason: wbState.closeReason }); return;
  }

  const players = await getPlayers(id);
  const guesserPlayer = players.find(p => p.id === guesserId);

  const { bonusPlayerIds, bonusNicknames } = await closeWordBackRoundFailed(
    id, roundIndex, "timer_expired", guesserId, suggesterId, players,
  );

  emitToRoom(homeRoom(id), "home:wordback_timeout", {
    reason: "timer_expired",
    guesserId,
    suggesterId,
    guesserNickname: guesserPlayer?.nickname ?? "",
    word,
    wrongAttempts: wbState.wrongAttempts,
    bonusPlayerIds,
    bonusNicknames,
    bonusPoints: 50,
  });

  await broadcastState(id);
  res.json({ ok: true, bonusPlayerIds, bonusPoints: 50 });
});

// ── POST /home/sessions/:id/wordback-book-role ────────────────────────────────
router.post("/home/sessions/:id/wordback-book-role", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

  const rp = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(rp.mode ?? "") !== "home-wordback-booking") {
    res.status(409).json({ error: "Non in fase di prenotazione wordback" }); return;
  }

  const { playerId, nickname, role } = req.body as {
    playerId?: string; nickname?: string; role?: "guesser" | "suggester";
  };
  if (!playerId || !role || !["guesser", "suggester"].includes(role)) {
    res.status(400).json({ error: "playerId e role (guesser/suggester) obbligatori" }); return;
  }

  const bookedRoles = { ...(rp.bookedRoles as { guesser: unknown; suggester: unknown } ?? { guesser: null, suggester: null }) };
  if (bookedRoles[role]) { res.status(409).json({ error: "Ruolo già occupato" }); return; }
  bookedRoles[role] = { id: playerId, nickname: nickname ?? "?" };

  const updatedRp = { ...rp, bookedRoles };
  const players = await getPlayers(id);
  const [updated] = await db.update(homeSessionsTable)
    .set({ roundPayload: updatedRp })
    .where(eq(homeSessionsTable.id, id)).returning();
  if (updated) emitToRoom(homeRoom(id), "home:state", { session: updated, players });
  res.json({ ok: true, bookedRoles });

  // If both roles are now filled: cancel the 10-second timer and advance immediately
  const gRole = bookedRoles.guesser as { id: string; nickname: string } | null;
  const sRole = bookedRoles.suggester as { id: string; nickname: string } | null;
  if (gRole && sRole) {
    const timer = wordbackBookingTimers.get(id);
    if (timer) { clearTimeout(timer); wordbackBookingTimers.delete(id); }
    await advanceToWordBackRound(id, gRole, sRole);
  }
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

  // Server-side timer validation — reject late submissions (anti-cheat)
  const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
  const rsa = payload.roundStartedAt as string | null;
  const tl = Number(payload.timeLimit ?? 0);
  if (rsa && tl > 0) {
    const elapsedMs = Date.now() - new Date(rsa).getTime();
    if (elapsedMs > (tl + 3) * 1000) {  // 3 s grace for network latency
      res.status(409).json({ error: "Tempo scaduto" }); return;
    }
  }

  const [scoreResult] = await db.update(homePlayersTable).set({
    score: Math.max(0, points),
  }).where(and(eq(homePlayersTable.id, playerId), eq(homePlayersTable.sessionId, id))).returning({ id: homePlayersTable.id, score: homePlayersTable.score });
  req.log.info({ sessionId: id, playerId, points, updated: !!scoreResult, newScore: scoreResult?.score }, "[Score] score update result");

  await broadcastState(id);
  res.json({ ok: true, score: scoreResult?.score ?? null });
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
  if (payload.themePhase === "suggestion") { res.status(409).json({ error: "Il tema non è ancora stato scelto" }); return; }

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

// ── POST /home/sessions/:id/coppie-preview — broadcast 10-s visibility to all phones ──
router.post("/home/sessions/:id/coppie-preview", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }
  const until = Date.now() + 10_000;
  emitToRoom(homeRoom(id), "home:coppie_visibility_preview", { sessionId: id, until });
  res.json({ ok: true, until });
});

// ── POST /home/sessions/:id/coppie/propose-theme — phone proposes a word theme ──
router.post("/home/sessions/:id/coppie/propose-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const payload = session.roundPayload as CoppiePayload;
  if (payload.mode !== "home-coppie" || payload.themePhase !== "suggestion") {
    res.status(409).json({ error: "Non in fase proposta tema" }); return;
  }
  const { playerId, theme } = req.body as { playerId?: string; theme?: string };
  if (!theme || typeof theme !== "string" || theme.trim().length === 0) {
    res.status(400).json({ error: "Tema mancante" }); return;
  }
  const trimmed = theme.trim().slice(0, 40);
  const proposedThemes = [...(payload.proposedThemes ?? [])];
  if (proposedThemes.length >= 12) { res.json({ ok: true, themes: proposedThemes }); return; }
  if (proposedThemes.some(t => t.text.toLowerCase() === trimmed.toLowerCase())) {
    res.json({ ok: true, themes: proposedThemes }); return;
  }
  const newTheme = { id: `t${Date.now()}`, text: trimmed, proposedBy: playerId ?? "unknown" };
  proposedThemes.push(newTheme);
  const newPayload: CoppiePayload = { ...payload, proposedThemes };
  await db.update(homeSessionsTable).set({ roundPayload: newPayload }).where(eq(homeSessionsTable.id, id));
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: { ...session, roundPayload: newPayload }, players });
  res.json({ ok: true, themes: proposedThemes });
});

// ── POST /home/sessions/:id/coppie/select-theme — finalize theme, build cards ──
router.post("/home/sessions/:id/coppie/select-theme", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const payload = session.roundPayload as CoppiePayload;
  if (payload.mode !== "home-coppie" || payload.themePhase !== "suggestion") {
    res.status(409).json({ error: "Non in fase proposta tema" }); return;
  }
  const { themeText, setId } = req.body as { themeText?: string; setId?: string };

  // ── Path A: DB card set selected (by ID) ──────────────────────────────────
  if (setId && typeof setId === "string") {
    logger.info({ sessionId: id, setId }, "[JONNY_COPPIE_AI] DB set selected");
    const newPayload = await loadCoppieByTheme(setId) as RoundPayload;
    await db.update(homeSessionsTable).set({ roundPayload: newPayload }).where(eq(homeSessionsTable.id, id));
    const players = await getPlayers(id);
    emitToRoom(homeRoom(id), "home:state", { session: { ...session, roundPayload: newPayload }, players });
    res.json({ ok: true, theme: (newPayload as Record<string,unknown>)["category"] ?? setId });
    return;
  }

  // ── Path B: word-bank or player-proposed theme ────────────────────────────
  const proposals = payload.proposedThemes ?? [];
  let selected = themeText?.trim() ?? proposals[proposals.length - 1]?.text;
  if (!selected) {
    const keys = Object.keys(THEMED_WORD_BANKS);
    selected = keys[Math.floor(Math.random() * keys.length)] ?? "cibo";
  }
  const bankKey = Object.keys(THEMED_WORD_BANKS).find(k =>
    selected!.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(selected!.toLowerCase())
  );
  const words = bankKey ? THEMED_WORD_BANKS[bankKey] : FALLBACK_COPPIE_ITEMS;
  logger.info({ sessionId: id, theme: selected, bankKey }, "[JONNY_COPPIE_AI] word-bank theme selected");
  const newPayload = buildCoppieFromWords(words!, payload.roundIndex, selected);
  await db.update(homeSessionsTable).set({ roundPayload: newPayload }).where(eq(homeSessionsTable.id, id));
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: { ...session, roundPayload: newPayload }, players });
  res.json({ ok: true, theme: selected });
});

// ── POST /home/sessions/:id/coppie/request-visibility — phone requests 10s peek ─
router.post("/home/sessions/:id/coppie/request-visibility", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const session = await getSession(id);
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  if (session.status !== "playing") { res.status(409).json({ error: "Sessione non in corso" }); return; }
  const payload = session.roundPayload as CoppiePayload;
  if (payload.mode !== "home-coppie" || payload.themePhase !== "playing") {
    res.status(409).json({ error: "Non in gioco" }); return;
  }
  const { playerId } = req.body as { playerId?: string };
  if (!playerId) { res.status(400).json({ error: "playerId obbligatorio" }); return; }
  const visibilityUsed = payload.visibilityUsed ?? {};
  if (visibilityUsed[playerId]) {
    res.status(409).json({ error: "Già usato", alreadyUsed: true }); return;
  }
  const now = Date.now();
  const activeUntil = payload.visibilityActiveUntil ?? 0;
  if (activeUntil > now) {
    res.status(409).json({ error: "Visibilità già attiva" }); return;
  }
  const until = now + 10_000;
  const newPayload: CoppiePayload = {
    ...payload,
    visibilityUsed: { ...visibilityUsed, [playerId]: true },
    visibilityActiveUntil: until,
  };
  await db.update(homeSessionsTable).set({ roundPayload: newPayload }).where(eq(homeSessionsTable.id, id));
  emitToRoom(homeRoom(id), "home:coppie_visibility_preview", { sessionId: id, until });
  const players = await getPlayers(id);
  emitToRoom(homeRoom(id), "home:state", { session: { ...session, roundPayload: newPayload }, players });
  res.json({ ok: true, until });
});

// ── POST /home/sessions/:id/champion ──────────────────────────────────────────
router.post("/home/sessions/:id/champion", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const [updated] = await db.update(homeSessionsTable).set({
    status: "ended",
    gameSlug: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // ended: retained 24 h
  }).where(eq(homeSessionsTable.id, id)).returning();

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

// ── POST /home/sessions/:id/wordback-transcribe-answer ─────────────────────────
// Chrome iOS path: receives a recorded audio blob, transcribes via Whisper,
// validates against the current round word, then scores + emits if correct.
// No session auth required — guesserId check provides the authorization.
const _transcribeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^audio\//.test(file.mimetype) ||
      /\.(webm|mp4|m4a|wav|mp3|ogg)$/i.test(file.originalname);
    cb(null, ok);
  },
});

router.post(
  "/home/sessions/:id/wordback-transcribe-answer",
  _transcribeUpload.single("audio"),
  async (req, res): Promise<void> => {
    const id = String(req.params["id"]);
    if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

    const session = await getSession(id);
    if (!session) { res.status(404).json({ error: "Non trovata" }); return; }

    const payload = (session.roundPayload ?? {}) as Record<string, unknown>;
    if (payload["mode"] !== "home-wordback") {
      res.status(400).json({ error: "Sessione non in modalità wordback" }); return;
    }

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) { res.status(400).json({ error: "playerId obbligatorio" }); return; }

    if (!req.file || !req.file.buffer || req.file.buffer.length < 500) {
      res.status(400).json({ error: "Audio non ricevuto o troppo corto" }); return;
    }

    const guesserId   = String(payload["guesserId"]   ?? "");
    const suggesterId = String(payload["suggesterId"] ?? "");
    const word        = String(payload["word"]        ?? "");
    const pts         = Number(payload["points"]      ?? 150);
    const roundIndex  = typeof payload["roundIndex"] === "number" ? payload["roundIndex"] : 0;

    if (!guesserId || playerId !== guesserId) {
      res.status(403).json({ error: "Solo l'indovinatore può rispondere" }); return;
    }

    // Duplicate prevention — reuse the unified per-round state guard
    const wbStateTranscribe = getWBState(id, roundIndex);
    if (wbStateTranscribe.closed) {
      res.status(409).json({ error: "Risposta già registrata per questo round" }); return;
    }

    // Transcription — requires AI integration key
    const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    const apiKey  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    if (!apiKey) {
      res.status(503).json({ error: "Trascrizione non configurata — usa risposta scritta" }); return;
    }

    let transcript = "";
    try {
      const openai   = new OpenAI({ baseURL, apiKey });
      const mimeType = req.file.mimetype || "audio/webm";
      const ext      = mimeType.includes("mp4") ? "mp4"
                     : mimeType.includes("wav")  ? "wav"
                     : mimeType.includes("ogg")  ? "ogg"
                     : "webm";
      // Node 24 has a global File class
      const audioFile = new File([new Uint8Array(req.file.buffer)], `answer.${ext}`, { type: mimeType });
      logger.info({ sessionId: id, size: req.file.size, ext }, "[WordbackTranscribe] transcribing");
      const result = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "it",
      });
      transcript = result.text ?? "";
      logger.info({ transcript }, "[WordbackTranscribe] done");
    } catch (err) {
      logger.error({ err }, "[WordbackTranscribe] Whisper error");
      res.status(503).json({ error: "Errore trascrizione audio — usa risposta scritta" }); return;
    }

    // Match transcript against the secret word
    const normT = normalizeWordForMatch(transcript);
    const normW = normalizeWordForMatch(word);
    const matched = normW.length > 0 && normT.length > 0 &&
      (normT === normW || normT.includes(normW) || normW.includes(normT));

    if (!matched) {
      res.json({ ok: false, correct: false, transcript }); return;
    }

    // Mark round as scored via the unified state guard
    wbStateTranscribe.closed = true;
    wbStateTranscribe.closeReason = "correct";

    // Award scores — identical logic to wordback-correct
    const players       = await getPlayers(id);
    const guesserPlayer   = players.find(p => p.id === guesserId);
    const suggesterPlayer = suggesterId ? players.find(p => p.id === suggesterId) : null;

    const updates: Promise<unknown>[] = [];
    if (guesserPlayer) {
      updates.push(
        db.update(homePlayersTable)
          .set({ score: Math.max(0, guesserPlayer.score + pts) })
          .where(and(eq(homePlayersTable.id, guesserId), eq(homePlayersTable.sessionId, id)))
      );
    }
    if (suggesterPlayer) {
      updates.push(
        db.update(homePlayersTable)
          .set({ score: Math.max(0, suggesterPlayer.score + pts) })
          .where(and(eq(homePlayersTable.id, suggesterId), eq(homePlayersTable.sessionId, id)))
      );
    }
    await Promise.all(updates);

    // Emit to all clients in room — triggers same downstream flow as web-speech path
    emitToRoom(homeRoom(id), "home:wordback_correct", {
      guesserId,
      suggesterId,
      guesserNickname:   guesserPlayer?.nickname   ?? "",
      suggesterNickname: suggesterPlayer?.nickname  ?? "",
      word,
      answerText: transcript,
      pts,
    });

    await broadcastState(id);
    res.json({ ok: true, transcript, pts });
  }
);

export default router;
