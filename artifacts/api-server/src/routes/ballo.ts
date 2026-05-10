import { Router, type IRouter } from "express";
import { eq, asc, or, isNull } from "drizzle-orm";
import OpenAI from "openai";
import {
  db,
  danceChallengesTable,
  danceSessionsTable,
  gameSessionsTable,
  eventsTable,
  teamsTable,
  scoresTable,
} from "@workspace/db";
import type { DanceState, DanceTeamInState } from "@workspace/db";
import { type AuthedRequest, requireAuth, loadUser } from "../middlewares/auth";
import { emitToEvent } from "../socket";

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
});

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(s: string) {
  return UUID_RE.test(s);
}

/* ── In-memory energy cache (transient, not persisted) ───────────────────── */
// sessionId -> teamId -> energy 0-100
const energyCache = new Map<string, Map<string, number>>();
// sessionId -> eventId (cache to avoid repeated DB lookups on hot path)
const sessionEventCache = new Map<string, string>();
// Debounce timers for dance:motion emit
const motionDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function getOrCreateEnergy(sessionId: string): Map<string, number> {
  let m = energyCache.get(sessionId);
  if (!m) {
    m = new Map<string, number>();
    energyCache.set(sessionId, m);
  }
  return m;
}

function mergeEnergy(state: DanceState, sessionId: string): DanceState {
  const em = energyCache.get(sessionId);
  if (!em) return state;
  return {
    ...state,
    teams: state.teams.map((t) => ({
      ...t,
      energy: em.get(t.id) ?? t.energy,
    })),
  };
}

async function getEventIdForSession(
  sessionId: string,
): Promise<string | null> {
  const cached = sessionEventCache.get(sessionId);
  if (cached) return cached;
  if (!isUUID(sessionId)) return null;
  const [s] = await db
    .select()
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));
  if (!s) return null;
  sessionEventCache.set(sessionId, s.eventId);
  return s.eventId;
}

async function getDanceState(
  sessionId: string,
): Promise<DanceState | null> {
  const [row] = await db
    .select()
    .from(danceSessionsTable)
    .where(eq(danceSessionsTable.sessionId, sessionId));
  return row?.state ?? null;
}

async function saveDanceState(
  sessionId: string,
  state: DanceState,
): Promise<void> {
  await db
    .update(danceSessionsTable)
    .set({ state })
    .where(eq(danceSessionsTable.sessionId, sessionId));
}

async function guardSession(
  req: AuthedRequest,
  sessionId: string,
): Promise<string | null> {
  const eventId = await getEventIdForSession(sessionId);
  if (!eventId) return null;
  const [e] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));
  if (!e) return null;
  if (req.user!.role !== "super_admin" && e.tenantId !== req.user!.tenantId)
    return null;
  return eventId;
}

/* ══════════════════════════════════════════════════════════════════════════
   CHALLENGES CRUD
══════════════════════════════════════════════════════════════════════════ */

router.get(
  "/dance-challenges",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const where =
      req.user!.role === "super_admin"
        ? undefined
        : or(
            eq(danceChallengesTable.tenantId, req.user!.tenantId!),
            isNull(danceChallengesTable.tenantId),
          );
    const rows = await db
      .select()
      .from(danceChallengesTable)
      .where(where)
      .orderBy(asc(danceChallengesTable.createdAt));
    res.json(rows);
  },
);

/* ── AI generation ──────────────────────────────────────────────────────── */

router.post(
  "/dance-challenges/generate",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { theme = "", count = 5, difficulty = "mixed" } = req.body as {
      theme?: string;
      count?: number;
      difficulty?: string;
    };

    const diffInstruction =
      difficulty === "mixed"
        ? 'Varia le difficoltà: metti alcune facili, alcune medie, alcune difficili.'
        : `Usa esclusivamente difficoltà "${difficulty}" per tutte le sfide.`;

    const prompt = `Sei un animatore esperto di feste italiane. Genera esattamente ${count} sfide di ballo originali e divertenti${theme ? ` a tema "${theme}"` : ''} per gruppi in una festa serale.

${diffInstruction}

Per ogni sfida fornisci:
- name: nome breve e accattivante (max 4 parole, in italiano)
- description: istruzioni brevi e chiare per i giocatori (1-2 frasi, in italiano, coinvolgenti)
- duration: durata in secondi (tra 30 e 120)
- difficulty: "easy" | "medium" | "hard"
- musicHint: suggerimento musicale reale (artista — brano, preferibilmente noto)

Rispondi con un oggetto JSON nel formato: {"challenges": [...array delle sfide...]}`;

    let generated: Array<{ name: string; description: string; duration: number; difficulty: string; musicHint: string }>;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { challenges?: unknown[] } | unknown[];
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown[]>)[Object.keys(parsed as object)[0]] ?? [];
      generated = arr as typeof generated;
    } catch (err) {
      req.log.error({ err }, "AI generation failed");
      res.status(502).json({ error: "Generazione AI fallita. Riprova." });
      return;
    }

    if (!Array.isArray(generated) || generated.length === 0) {
      res.status(502).json({ error: "Risposta AI non valida. Riprova." });
      return;
    }

    const tenantId = req.user!.role === "super_admin" ? null : req.user!.tenantId;
    const rows = await db
      .insert(danceChallengesTable)
      .values(
        generated.map((g) => ({
          name: String(g.name ?? "").trim().slice(0, 80),
          description: String(g.description ?? "").trim(),
          duration: Math.min(300, Math.max(15, Number(g.duration) || 60)),
          difficulty: ["easy", "medium", "hard"].includes(g.difficulty) ? g.difficulty : "medium",
          musicHint: String(g.musicHint ?? "").trim(),
          tenantId,
        }))
      )
      .returning();

    res.status(201).json(rows);
  },
);

router.post(
  "/dance-challenges",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { name, description, duration, difficulty, musicHint } =
      req.body as {
        name?: string;
        description?: string;
        duration?: number;
        difficulty?: string;
        musicHint?: string;
      };
    if (!name?.trim()) {
      res.status(400).json({ error: "name obbligatorio" });
      return;
    }
    const [row] = await db
      .insert(danceChallengesTable)
      .values({
        name: name.trim(),
        description: description?.trim() ?? "",
        duration: duration ?? 60,
        difficulty: difficulty ?? "medium",
        musicHint: musicHint?.trim() ?? "",
        tenantId:
          req.user!.role === "super_admin" ? null : req.user!.tenantId,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.delete(
  "/dance-challenges/:id",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const [ch] = await db
      .select()
      .from(danceChallengesTable)
      .where(eq(danceChallengesTable.id, id));
    if (!ch) {
      res.status(404).json({ error: "sfida non trovata" });
      return;
    }
    if (
      req.user!.role !== "super_admin" &&
      ch.tenantId !== req.user!.tenantId
    ) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }
    await db
      .delete(danceChallengesTable)
      .where(eq(danceChallengesTable.id, id));
    res.json({ ok: true });
  },
);

/* ══════════════════════════════════════════════════════════════════════════
   SESSION ENDPOINTS
══════════════════════════════════════════════════════════════════════════ */

/* GET /dance/sessions/:id/state — public (projector/phone access) */
router.get(
  "/dance/sessions/:id/state",
  loadUser,
  async (req, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const state = await getDanceState(id);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }
    res.json(mergeEnergy(state, id));
  },
);

/* POST /dance/sessions/:id/init — auth */
router.post(
  "/dance/sessions/:id/init",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const { challengeId } = req.body as { challengeId?: string };
    if (!challengeId || !isUUID(challengeId)) {
      res.status(400).json({ error: "challengeId obbligatorio" });
      return;
    }
    const eventId = await guardSession(req, id);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }

    const [challenge] = await db
      .select()
      .from(danceChallengesTable)
      .where(eq(danceChallengesTable.id, challengeId));
    if (!challenge) {
      res.status(404).json({ error: "sfida non trovata" });
      return;
    }

    const teamRows = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.eventId, eventId))
      .orderBy(asc(teamsTable.name));

    const teams: DanceTeamInState[] = teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? "#8B5CF6",
      score: 0,
      energy: 0,
    }));

    const state: DanceState = {
      challengeId: challenge.id,
      challengeName: challenge.name,
      duration: challenge.duration,
      musicHint: challenge.musicHint,
      difficulty: challenge.difficulty,
      teams,
      status: "idle",
      startedAt: null,
    };

    // Upsert dance session
    await db
      .insert(danceSessionsTable)
      .values({ sessionId: id, challengeId: challenge.id, state })
      .onConflictDoUpdate({
        target: danceSessionsTable.sessionId,
        set: { challengeId: challenge.id, state },
      });

    // Reset energy cache for fresh start
    energyCache.delete(id);

    res.json(state);
  },
);

/* POST /dance/sessions/:id/start — auth */
router.post(
  "/dance/sessions/:id/start",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const eventId = await guardSession(req, id);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }
    const state = await getDanceState(id);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }
    const updated: DanceState = {
      ...state,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    await saveDanceState(id, updated);
    energyCache.delete(id); // fresh energy on start
    emitToEvent(eventId, "dance:started", { state: updated });
    res.json(updated);
  },
);

/* POST /dance/sessions/:id/motion — public (no auth needed for phones) */
router.post(
  "/dance/sessions/:id/motion",
  async (req, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const { teamId, energy } = req.body as {
      teamId?: string;
      energy?: number;
    };
    if (!teamId || typeof energy !== "number") {
      res.status(400).json({ error: "teamId e energy richiesti" });
      return;
    }
    const clampedEnergy = Math.min(100, Math.max(0, Math.round(energy)));

    // Update energy cache
    const em = getOrCreateEnergy(id);
    em.set(teamId, clampedEnergy);

    // Debounce emit: only emit once every 300ms per session
    if (!motionDebounce.has(id)) {
      motionDebounce.set(
        id,
        setTimeout(async () => {
          motionDebounce.delete(id);
          try {
            const state = await getDanceState(id);
            if (!state || state.status !== "running") return;
            const merged = mergeEnergy(state, id);
            const eventId = await getEventIdForSession(id);
            if (eventId) emitToEvent(eventId, "dance:motion", { state: merged });
          } catch {
            /* silent */
          }
        }, 300),
      );
    }

    res.json({ ok: true });
  },
);

/* POST /dance/sessions/:id/bonus — auth, manual bonus per team */
router.post(
  "/dance/sessions/:id/bonus",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const eventId = await guardSession(req, id);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }
    const { teamId, points } = req.body as {
      teamId?: string;
      points?: number;
    };
    if (!teamId || typeof points !== "number" || points === 0) {
      res.status(400).json({ error: "teamId e points richiesti" });
      return;
    }
    const state = await getDanceState(id);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }
    const updated: DanceState = {
      ...state,
      teams: state.teams.map((t) =>
        t.id === teamId ? { ...t, score: Math.max(0, t.score + points) } : t,
      ),
    };
    await saveDanceState(id, updated);
    const merged = mergeEnergy(updated, id);
    emitToEvent(eventId, "dance:score_updated", { state: merged });
    res.json(merged);
  },
);

/* POST /dance/sessions/:id/end — auth */
router.post(
  "/dance/sessions/:id/end",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { id } = req.params as { id: string };
    if (!isUUID(id)) {
      res.status(400).json({ error: "id non valido" });
      return;
    }
    const eventId = await guardSession(req, id);
    if (!eventId) {
      res.status(403).json({ error: "non autorizzato" });
      return;
    }
    const state = await getDanceState(id);
    if (!state) {
      res.status(404).json({ error: "sessione non trovata" });
      return;
    }
    const updated: DanceState = { ...state, status: "ended" };
    await saveDanceState(id, updated);

    // Persist scores
    const toInsert = state.teams
      .filter((t) => t.score > 0)
      .map((t) => ({
        eventId,
        teamId: t.id,
        gameSlug: "sfida-ballo" as const,
        round: 1,
        points: t.score,
      }));
    if (toInsert.length > 0) {
      await db.insert(scoresTable).values(toInsert);
    }

    // Cleanup
    energyCache.delete(id);
    const existing = motionDebounce.get(id);
    if (existing) { clearTimeout(existing); motionDebounce.delete(id); }

    emitToEvent(eventId, "dance:ended", { state: updated });
    res.json(updated);
  },
);

export default router;
