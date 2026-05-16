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
import { eq, and, or, lt, asc, desc, isNull } from "drizzle-orm";
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

// 12-pair fallback deck — always playable without any DB cards
const FALLBACK_COPPIE_PAIRS: { a: string; b: string }[] = [
  { a: "Roma",      b: "Colosseo"   }, { a: "Milano",   b: "Duomo"       },
  { a: "Venezia",   b: "Gondola"    }, { a: "Napoli",   b: "Pizza"        },
  { a: "Firenze",   b: "Uffizi"     }, { a: "Torino",   b: "Juventus"     },
  { a: "Pisa",      b: "Torre"      }, { a: "Sicilia",  b: "Etna"         },
  { a: "Sole",      b: "Luna"       }, { a: "Gatto",    b: "Miao"         },
  { a: "Mare",      b: "Spiaggia"   }, { a: "Pasta",    b: "Sugo"         },
];

/** 2. Gioco delle Coppie — carica carte dal DB */
async function loadCoppieRound(roundIndex: number): Promise<CoppiePayload> {
  const sets = await db.select().from(cardSetsTable).orderBy(desc(cardSetsTable.createdAt));
  // Pick set by cycling through available sets
  const set = sets[roundIndex % Math.max(sets.length, 1)] ?? sets[0];
  if (!set) return buildCoppiePayload(FALLBACK_COPPIE_PAIRS, roundIndex, "Coppie");

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
    return buildCoppiePayload(FALLBACK_COPPIE_PAIRS, roundIndex, set.name);
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
  const maxPlayers    = Math.min(Math.max(Number(req.body?.maxPlayers ?? 8), 2), 50);
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
  // Stamp authoritative start time so phones can calculate remaining time on restore
  const firstRound = { ...(preloadedRounds[0] ?? {}), roundStartedAt: new Date().toISOString() };

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
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // playing: 6 h inactivity window
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

  // Next round within current game — stamp authoritative start time
  const nextPayload = { ...(preloadedRounds[nextRound] ?? { mode: "unknown", roundIndex: nextRound }), roundStartedAt: new Date().toISOString() };

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

  // Auto-score Ballo before ending — highest peak energy wins
  const endGamePayload = (session.roundPayload ?? {}) as Record<string, unknown>;
  if (String(endGamePayload.mode ?? "") === "home-ballo") {
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

export default router;
