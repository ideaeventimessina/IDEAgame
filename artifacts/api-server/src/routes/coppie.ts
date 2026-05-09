import { Router, type IRouter, type Response, type Request } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  coppieBoardsTable,
  gameSessionsTable,
  eventsTable,
  teamsTable,
  cardsTable,
  scoresTable,
} from "@workspace/db";
import type { CoppieBoard, CoppieCard, CoppieTeam } from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const router: IRouter = Router();

const DIFFICULTY_PAIRS: Record<string, number> = {
  easy: 6,
  medium: 10,
  hard: 15,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean {
  return UUID_RE.test(s);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function getSessionMeta(
  sessionId: string,
): Promise<{ eventId: string } | null> {
  if (!isValidUUID(sessionId)) return null;
  const [session] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));
  if (!session) return null;
  return { eventId: session.eventId };
}

async function guardSession(
  req: AuthedRequest,
  sessionId: string,
): Promise<string | null> {
  const meta = await getSessionMeta(sessionId);
  if (!meta) return null;
  const [e] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, meta.eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId)
    return null;
  return meta.eventId;
}

/* ─── GET board (public: projection + player phones) ─────────────────── */
router.get(
  "/coppie/sessions/:id/board",
  async (req: Request, res): Promise<void> => {
    const sessionId = String(req.params["id"]);
    if (!isValidUUID(sessionId)) {
      res.status(400).json({ error: "sessionId non valido" });
      return;
    }
    const [row] = await db
      .select()
      .from(coppieBoardsTable)
      .where(eq(coppieBoardsTable.sessionId, sessionId));
    if (!row) {
      res.status(404).json({ error: "Board non inizializzata" });
      return;
    }
    res.json(row.board);
  },
);

/* ─── POST init (auth: entertainer initialises the board) ─────────────── */
router.post(
  "/coppie/sessions/:id/init",
  requireAuth,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const sessionId = String(req.params["id"]);
    if (!isValidUUID(sessionId)) {
      res.status(400).json({ error: "sessionId non valido" });
      return;
    }
    const eventId = await guardSession(req, sessionId);
    if (!eventId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const cardSetId = body["cardSetId"] as string | undefined;
    const difficulty =
      (body["difficulty"] as string | undefined) ?? "medium";
    const mode = (body["mode"] as string | undefined) ?? "teams";
    const rawTeamIds = body["teamIds"];
    const teamIds: string[] = Array.isArray(rawTeamIds)
      ? rawTeamIds.map(String)
      : [];

    if (!cardSetId) {
      res.status(400).json({ error: "cardSetId obbligatorio" });
      return;
    }
    if (!DIFFICULTY_PAIRS[difficulty]) {
      res
        .status(400)
        .json({ error: "difficulty deve essere easy, medium o hard" });
      return;
    }

    const allCards = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.cardSetId, cardSetId));
    const paired = allCards.filter((c) => c.imageUrl && c.pairId);

    const pairMap = new Map<string, typeof paired>();
    for (const c of paired) {
      if (!c.pairId) continue;
      const existing = pairMap.get(c.pairId) ?? [];
      existing.push(c);
      pairMap.set(c.pairId, existing);
    }

    const validPairs = [...pairMap.entries()].filter(
      ([, cards]) => cards.length >= 2,
    );
    if (validPairs.length === 0) {
      res.status(422).json({
        error:
          "Il deck non ha coppie valide (servono almeno 2 carte con stesso pairId e imageUrl)",
      });
      return;
    }

    const targetPairs = DIFFICULTY_PAIRS[difficulty]!;
    if (validPairs.length < targetPairs) {
      res.status(422).json({
        error: `Difficoltà ${difficulty} richiede ${targetPairs} coppie, il deck ne ha solo ${validPairs.length}`,
      });
      return;
    }

    const selectedPairs = shuffle(validPairs).slice(0, targetPairs);

    const rawCards: Omit<CoppieCard, "pos">[] = [];
    for (const [pairId, cards] of selectedPairs) {
      const a = cards[0]!;
      const b = cards[1]!;
      const label =
        (a.prompts as Record<string, string>)["it"] ?? pairId.slice(0, 8);
      rawCards.push(
        {
          cardId: a.id,
          pairId,
          imageUrl: a.imageUrl!,
          label,
          flipped: false,
          matched: false,
          matchedBy: null,
        },
        {
          cardId: b.id,
          pairId,
          imageUrl: b.imageUrl!,
          label,
          flipped: false,
          matched: false,
          matchedBy: null,
        },
      );
    }
    const shuffled = shuffle(rawCards);
    const boardCards: CoppieCard[] = shuffled.map((c, i) => ({
      ...c,
      pos: i,
    }));

    let teams: CoppieTeam[] = [];
    if (teamIds.length > 0) {
      const rows = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.eventId, eventId));
      teams = rows
        .filter((t) => teamIds.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color, score: 0 }));
    }
    if (teams.length === 0) {
      const rows = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.eventId, eventId));
      teams = rows.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        score: 0,
      }));
    }

    const board: CoppieBoard = {
      cards: boardCards,
      teams,
      mode: (mode as "teams" | "individual") ?? "teams",
      currentTeamIdx: 0,
      flipping: [],
      locked: false,
      status: "playing",
      winner: null,
      matchCount: 0,
      totalPairs: targetPairs,
    };

    await db
      .delete(coppieBoardsTable)
      .where(eq(coppieBoardsTable.sessionId, sessionId));
    await db
      .insert(coppieBoardsTable)
      .values({ sessionId, cardSetId, difficulty, mode, board });

    emitToEvent(eventId, "coppie:state", board);
    res.status(201).json(board);
  },
);

/**
 * In-memory lock to prevent concurrent flip requests on the same session.
 * Node.js is single-threaded: the check+add below is synchronous (no await),
 * so it is effectively atomic. Any second request arriving while the first
 * is awaiting DB operations will see the lock and get a 409.
 */
const _flipLocks = new Set<string>();

/* ─── POST flip (public: player phones flip cards) ────────────────────── */
router.post(
  "/coppie/sessions/:id/flip",
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = String(req.params["id"]);
    if (!isValidUUID(sessionId)) {
      res.status(400).json({ error: "sessionId non valido" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const pos = body["pos"];
    const teamId = body["teamId"];

    if (typeof pos !== "number" || typeof teamId !== "string") {
      res
        .status(400)
        .json({ error: "pos (number) e teamId (string) obbligatori" });
      return;
    }

    // Acquire per-session lock (prevents race condition on simultaneous flips)
    if (_flipLocks.has(sessionId)) {
      res.status(409).json({ error: "Flip in corso, riprova tra un momento" });
      return;
    }
    _flipLocks.add(sessionId);

    try {
      const [row] = await db
        .select()
        .from(coppieBoardsTable)
        .where(eq(coppieBoardsTable.sessionId, sessionId));
      if (!row) {
        res.status(404).json({ error: "Board non inizializzata" });
        return;
      }

      const meta = await getSessionMeta(sessionId);
      if (!meta) {
        res.status(404).json({ error: "Sessione non trovata" });
        return;
      }
      const { eventId } = meta;

      const board: CoppieBoard = JSON.parse(
        JSON.stringify(row.board),
      ) as CoppieBoard;

      // Validate teamId belongs to this board
      const validTeamIds = new Set(board.teams.map((t) => t.id));
      if (!validTeamIds.has(teamId)) {
        res.status(403).json({ error: "Squadra non appartenente a questo evento" });
        return;
      }

      if (board.locked || board.status !== "playing") {
        res.status(409).json({ error: "Board bloccata, attendi" });
        return;
      }
      if (board.flipping.length >= 2) {
        res.status(409).json({ error: "Aspetta la validazione" });
        return;
      }

      const currentTeam = board.teams[board.currentTeamIdx];
      if (board.mode === "teams" && currentTeam && currentTeam.id !== teamId) {
        res.status(409).json({ error: "Non è il turno della tua squadra" });
        return;
      }

      const card = board.cards[pos];
      if (!card) {
        res.status(400).json({ error: "Posizione non valida" });
        return;
      }
      if (card.matched || card.flipped) {
        res.status(409).json({ error: "Carta non disponibile" });
        return;
      }

      card.flipped = true;
      board.flipping.push(pos);

      if (board.flipping.length === 2) {
        const [p1, p2] = board.flipping as [number, number];
        const c1 = board.cards[p1]!;
        const c2 = board.cards[p2]!;

        if (c1.pairId === c2.pairId) {
          // MATCH
          c1.matched = true;
          c2.matched = true;
          c1.matchedBy = teamId;
          c2.matchedBy = teamId;
          board.flipping = [];
          board.matchCount += 1;

          const ti = board.teams.findIndex((t) => t.id === teamId);
          if (ti >= 0) board.teams[ti]!.score += 1;

          if (board.matchCount >= board.totalPairs) {
            board.status = "ended";
            const winner = [...board.teams].sort((a, b) => b.score - a.score)[0];
            board.winner = winner?.id ?? null;
            for (const t of board.teams) {
              if (t.score > 0) {
                await db
                  .insert(scoresTable)
                  .values({
                    eventId,
                    teamId: t.id,
                    gameSlug: "gioco-coppie",
                    points: t.score,
                    round: 0,
                  })
                  .catch(() => {});
              }
            }
          }

          await db
            .update(coppieBoardsTable)
            .set({ board })
            .where(eq(coppieBoardsTable.sessionId, sessionId));

          const matchedTeam = board.teams.find((t) => t.id === teamId);
          emitToEvent(eventId, "coppie:match", { p1, p2, teamId, matchedTeamName: matchedTeam?.name ?? '', board });
          if (board.status === "ended")
            emitToEvent(eventId, "coppie:end", { board });
          else emitToEvent(eventId, "coppie:state", board);
          res.json(board);
        } else {
          // MISMATCH
          board.locked = true;
          await db
            .update(coppieBoardsTable)
            .set({ board })
            .where(eq(coppieBoardsTable.sessionId, sessionId));

          const nextIdx = (board.currentTeamIdx + 1) % Math.max(board.teams.length, 1);
          const nextTeam = board.teams[nextIdx];
          emitToEvent(eventId, "coppie:mismatch", {
            p1,
            p2,
            teamId,
            nextTeamName: nextTeam?.name ?? '',
            board,
          });
          res.json(board);
        }
      } else {
        // First card flipped
        await db
          .update(coppieBoardsTable)
          .set({ board })
          .where(eq(coppieBoardsTable.sessionId, sessionId));
        emitToEvent(eventId, "coppie:flip", { pos, teamId, board });
        res.json(board);
      }
    } finally {
      // Always release the lock so the session doesn't deadlock
      _flipLocks.delete(sessionId);
    }
  },
);

/* ─── POST unflip (client calls after mismatch delay) ────────────────── */
router.post(
  "/coppie/sessions/:id/unflip",
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = String(req.params["id"]);
    if (!isValidUUID(sessionId)) {
      res.status(400).json({ error: "sessionId non valido" });
      return;
    }

    const [row] = await db
      .select()
      .from(coppieBoardsTable)
      .where(eq(coppieBoardsTable.sessionId, sessionId));
    if (!row) {
      res.status(404).json({ error: "Board non trovata" });
      return;
    }

    const meta = await getSessionMeta(sessionId);
    if (!meta) {
      res.status(404).json({ error: "Sessione non trovata" });
      return;
    }
    const { eventId } = meta;

    const board: CoppieBoard = JSON.parse(
      JSON.stringify(row.board),
    ) as CoppieBoard;

    // Idempotent: if not locked just return current state
    if (!board.locked || board.flipping.length !== 2) {
      res.json(board);
      return;
    }

    const [p1, p2] = board.flipping as [number, number];
    if (board.cards[p1]) board.cards[p1]!.flipped = false;
    if (board.cards[p2]) board.cards[p2]!.flipped = false;
    board.flipping = [];
    board.locked = false;
    board.currentTeamIdx =
      (board.currentTeamIdx + 1) % Math.max(board.teams.length, 1);

    await db
      .update(coppieBoardsTable)
      .set({ board })
      .where(eq(coppieBoardsTable.sessionId, sessionId));
    emitToEvent(eventId, "coppie:state", board);
    res.json(board);
  },
);

export default router;
