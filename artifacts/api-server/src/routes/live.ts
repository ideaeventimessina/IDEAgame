/**
 * LIVE MODE routes — thin command layer over a Home session.
 * Regola architetturale: Live = Home runtime + Regia + Presenter.
 * La stanza Live non ha un runtime proprio: crea una home_session collegata,
 * la TV Live renderizza /home?s=HOME_SESSION_ID e Presenter/Regia la comandano.
 *
 *   POST /live/sessions              — crea stanza Live + home session collegata (auth)
 *   GET  /live/sessions              — lista stanze del tenant (auth)
 *   GET  /live/resolve/:code         — risolve tvCode|presenterCode (pubblico, self-healing)
 *   POST /live/sessions/:id/command  — comando sulla home session (gated da presenterCode)
 *   POST /live/sessions/:id/coppie   — crea mazzo Coppie Live e avvia il gioco (gated)
 */

import { Router, type IRouter, type Response } from "express";
import { randomUUID } from "node:crypto";
import { eq, or, and, desc } from "drizzle-orm";
import {
  db,
  liveSessionsTable,
  homeSessionsTable,
  homePlayersTable,
  cardSetsTable,
  cardsTable,
  type LiveSession,
  type HomeSession,
} from "@workspace/db";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";
import { emitToRoom } from "../socket";
import {
  createHomeSessionRecord,
  doSelectGame,
  doNextRound,
  doEndGame,
  doReady,
  getHomeSession,
  broadcastHomeState,
  homeRoom,
} from "./home";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

const LIVE_ROLES = ["super_admin", "tenant_owner", "game_manager", "entertainer"] as const;

// Stesso alfabeto di makeJoinCode (home.ts) — niente 0/O/1/I ambigui.
// Un codice deve essere unico su ENTRAMBE le colonne: /live/resolve/:code
// cerca su tvCode e presenterCode insieme.
function makeLiveCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function uniqueLiveCode(): Promise<string> {
  let code = makeLiveCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: liveSessionsTable.id }).from(liveSessionsTable)
      .where(or(eq(liveSessionsTable.tvCode, code), eq(liveSessionsTable.presenterCode, code)));
    if (!existing) break;
    code = makeLiveCode();
  }
  return code;
}

async function getLiveSession(id: string): Promise<LiveSession | null> {
  const [s] = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, id));
  return s ?? null;
}

/**
 * La home session collegata può morire (cleanup 2h in lobby) o finire:
 * in quel caso se ne crea una nuova con lo stesso nome e si riaggancia.
 * joinCode/QR cambiano — le pagine Live pollano il resolve e si aggiornano.
 */
async function ensureLinkedHomeSession(live: LiveSession): Promise<{ live: LiveSession; home: HomeSession }> {
  if (live.homeSessionId) {
    const home = await getHomeSession(live.homeSessionId);
    if (home && home.status !== "ended" && new Date() <= home.expiresAt) {
      return { live, home };
    }
  }
  const home = await createHomeSessionRecord({ hostName: live.name });
  const [updated] = await db.update(liveSessionsTable)
    .set({ homeSessionId: home.id })
    .where(eq(liveSessionsTable.id, live.id)).returning();
  return { live: updated ?? live, home };
}

function publicLive(live: LiveSession) {
  return { id: live.id, name: live.name, status: live.status, tvCode: live.tvCode, createdAt: live.createdAt };
}

function publicHome(home: HomeSession) {
  return {
    id: home.id,
    joinCode: home.joinCode,
    status: home.status,
    gameSlug: home.gameSlug,
    currentRound: home.currentRound,
    totalRounds: home.totalRounds,
  };
}

// ── POST /live/sessions ────────────────────────────────────────────────────────
router.post("/live/sessions", requireAuth, requireRole(...LIVE_ROLES), async (req: AuthedRequest, res): Promise<void> => {
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  if (!name) { res.status(400).json({ error: "Nome stanza obbligatorio" }); return; }

  const me = req.user!;
  const tenantId = me.role === "super_admin" && req.body?.tenantId
    ? String(req.body.tenantId)
    : me.tenantId;

  const home = await createHomeSessionRecord({ hostName: name });
  const tvCode = await uniqueLiveCode();
  let presenterCode = await uniqueLiveCode();
  if (presenterCode === tvCode) presenterCode = await uniqueLiveCode();

  const [live] = await db.insert(liveSessionsTable).values({
    tenantId: tenantId ?? null,
    name,
    homeSessionId: home.id,
    tvCode,
    presenterCode,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();

  res.status(201).json({ live, home: publicHome(home), joinCode: home.joinCode });
});

// ── GET /live/sessions ─────────────────────────────────────────────────────────
router.get("/live/sessions", requireAuth, requireRole(...LIVE_ROLES), async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const scope = me.role === "super_admin" ? undefined : eq(liveSessionsTable.tenantId, me.tenantId!);

  const rows = scope
    ? await db.select().from(liveSessionsTable).where(scope).orderBy(desc(liveSessionsTable.createdAt))
    : await db.select().from(liveSessionsTable).orderBy(desc(liveSessionsTable.createdAt));

  // Arricchisce con joinCode della home session collegata (senza self-heal: lista read-only)
  const result = await Promise.all(rows.map(async (live) => {
    const home = live.homeSessionId ? await getHomeSession(live.homeSessionId) : null;
    return { live, home: home ? publicHome(home) : null };
  }));

  res.json(result);
});

// ── GET /live/resolve/:code — pubblico (TV e Presenter) ───────────────────────
router.get("/live/resolve/:code", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  if (!code || code.length > 12) { res.status(400).json({ error: "Codice non valido" }); return; }

  const [found] = await db.select().from(liveSessionsTable)
    .where(or(eq(liveSessionsTable.tvCode, code), eq(liveSessionsTable.presenterCode, code)));

  if (!found) { res.status(404).json({ error: "Stanza Live non trovata" }); return; }
  if (found.status === "ended") { res.status(410).json({ error: "Stanza Live terminata" }); return; }
  if (new Date() > found.expiresAt) { res.status(410).json({ error: "Stanza Live scaduta" }); return; }

  const role = found.presenterCode === code ? "presenter" : "tv";
  const { live, home } = await ensureLinkedHomeSession(found);

  res.json({
    live: publicLive(live),
    home: publicHome(home),
    role,
    // Il presenterCode esce SOLO verso chi lo possiede già — mai alla TV.
    ...(role === "presenter" ? { presenterCode: live.presenterCode } : {}),
  });
});

// ── Command gate ───────────────────────────────────────────────────────────────
async function gateCommand(req: AuthedRequest, res: Response): Promise<{ live: LiveSession; home: HomeSession } | null> {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return null; }

  const live = await getLiveSession(id);
  if (!live) { res.status(404).json({ error: "Stanza Live non trovata" }); return null; }
  if (live.status === "ended") { res.status(410).json({ error: "Stanza Live terminata" }); return null; }

  const code = String(req.headers["x-presenter-code"] ?? req.body?.presenterCode ?? "").toUpperCase().trim();
  if (code !== live.presenterCode) { res.status(403).json({ error: "Codice presentatore non valido" }); return null; }

  return ensureLinkedHomeSession(live);
}

// Comandi socket-only: comportamenti TV-local (non hanno endpoint Home HTTP).
// HomeGame.tsx li ascolta nella stanza home:{id}.
const SOCKET_COMMANDS = new Set(["reveal", "pause", "resume", "ranking", "blackout", "audio"]);

// ── POST /live/sessions/:id/command ────────────────────────────────────────────
router.post("/live/sessions/:id/command", async (req: AuthedRequest, res): Promise<void> => {
  const ctx = await gateCommand(req, res);
  if (!ctx) return;
  const { home } = ctx;
  const hid = home.id;

  const body = req.body as Record<string, unknown>;
  const command = String(body["command"] ?? "");

  switch (command) {
    case "select-game": {
      const gameSlug = String(body["gameSlug"] ?? "");
      const cardSetId = body["cardSetId"] ? String(body["cardSetId"]) : undefined;
      const r = await doSelectGame(hid, gameSlug, { cardSetId, force: true });
      res.status(r.status).json(r.body);
      return;
    }
    case "board": {
      const r = await doReady(hid);
      res.status(r.status).json(r.body);
      return;
    }
    case "next": {
      const r = await doNextRound(hid);
      res.status(r.status).json(r.body);
      return;
    }
    case "end-game": {
      const r = await doEndGame(hid);
      res.status(r.status).json(r.body);
      return;
    }
    case "score": {
      const playerId = String(body["playerId"] ?? "");
      const delta = Number(body["delta"] ?? 0);
      if (!isUUID(playerId) || !Number.isFinite(delta)) {
        res.status(400).json({ error: "playerId e delta obbligatori" }); return;
      }
      const [p] = await db.select().from(homePlayersTable)
        .where(and(eq(homePlayersTable.id, playerId), eq(homePlayersTable.sessionId, hid)));
      if (!p) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
      await db.update(homePlayersTable)
        .set({ score: Math.max(0, p.score + delta) })
        .where(eq(homePlayersTable.id, playerId));
      await broadcastHomeState(hid);
      res.json({ ok: true });
      return;
    }
    default: {
      if (!SOCKET_COMMANDS.has(command)) {
        res.status(400).json({ error: `Comando non consentito: "${command}"` });
        return;
      }
      const eventMap: Record<string, string> = {
        reveal:   "home:reveal",
        pause:    "home:pause",
        resume:   "home:resume",
        ranking:  "home:show_ranking",
        blackout: "home:blackout",
        audio:    "home:audio",
      };
      const payload: Record<string, unknown> = {};
      if (command === "ranking")  payload["show"] = body["show"] !== false;
      if (command === "blackout") payload["on"] = body["on"] !== false;
      if (command === "audio")    payload["action"] = String(body["action"] ?? "stop");
      emitToRoom(homeRoom(hid), eventMap[command]!, payload);
      res.json({ ok: true, command });
      return;
    }
  }
});

// ── POST /live/sessions/:id/coppie — Coppie Live: mazzo dalle foto in sala ─────
router.post("/live/sessions/:id/coppie", async (req: AuthedRequest, res): Promise<void> => {
  const ctx = await gateCommand(req, res);
  if (!ctx) return;
  const { live, home } = ctx;

  const couples = Array.isArray(req.body?.couples) ? req.body.couples as Array<Record<string, unknown>> : [];
  if (couples.length < 2 || couples.length > 15) {
    res.status(400).json({ error: "Servono da 2 a 15 coppie" }); return;
  }

  const clean: { name: string; imageA: string; imageB: string }[] = [];
  for (let i = 0; i < couples.length; i++) {
    const c = couples[i]!;
    const name = String(c["name"] ?? `Coppia ${i + 1}`).trim().slice(0, 60) || `Coppia ${i + 1}`;
    const imageA = String(c["imageA"] ?? "").trim();
    const imageB = String(c["imageB"] ?? "").trim();
    if (!imageA || !imageB) {
      res.status(400).json({ error: `Coppia ${i + 1}: servono entrambe le foto (partner A e B)` }); return;
    }
    if (imageA === imageB) {
      res.status(400).json({ error: `Coppia ${i + 1}: le due foto devono essere diverse (partner A e B sono persone diverse)` }); return;
    }
    clean.push({ name, imageA, imageB });
  }

  const [set] = await db.insert(cardSetsTable).values({
    tenantId: live.tenantId,
    slug: `coppie-live-${randomUUID().slice(0, 6)}`,
    name: `Coppie Live — ${live.name}`,
    description: `Mazzo creato dal presentatore (${clean.length} coppie)`,
  }).returning();

  // Due carte per coppia con lo stesso pairId — partner A e partner B,
  // stesso formato che produce l'admin CardSets.
  await db.insert(cardsTable).values(clean.flatMap((c) => {
    const pairId = randomUUID().slice(0, 8);
    return [
      { cardSetId: set!.id, kind: "question" as const, prompts: { it: c.name }, imageUrl: c.imageA, pairId },
      { cardSetId: set!.id, kind: "question" as const, prompts: { it: c.name }, imageUrl: c.imageB, pairId },
    ];
  }));

  const r = await doSelectGame(home.id, "gioco-coppie", { cardSetId: set!.id, force: true });
  if (r.status !== 200) { res.status(r.status).json(r.body); return; }

  res.json({ ...r.body, cardSetId: set!.id, couples: clean.length });
});

// ── POST /live/sessions/:id/end — chiude la stanza Live ───────────────────────
router.post("/live/sessions/:id/end", requireAuth, requireRole(...LIVE_ROLES), async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }

  const live = await getLiveSession(id);
  if (!live) { res.status(404).json({ error: "Non trovata" }); return; }

  const me = req.user!;
  if (me.role !== "super_admin" && live.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [updated] = await db.update(liveSessionsTable)
    .set({ status: "ended" })
    .where(eq(liveSessionsTable.id, id)).returning();

  if (live.homeSessionId) {
    await db.update(homeSessionsTable).set({ status: "ended" })
      .where(eq(homeSessionsTable.id, live.homeSessionId));
    emitToRoom(homeRoom(live.homeSessionId), "home:ended", {});
  }

  res.json(updated);
});

export default router;
