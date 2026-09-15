/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — BURRACO (backend) ───────────────────────────────────
   Serate a coppie fisse con tavoli a rotazione. Isolato dai party game.
   Rotte pubbliche (nessun login): l'accesso è governato da masterCode/joinCode.
──────────────────────────────────────────────────────────────────────────── */

import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import {
  db,
  burracoSessionsTable,
  burracoPairsTable,
  burracoAssignmentsTable,
  type BurracoPair,
  type BurracoAssignment,
} from "@workspace/db";
import { emitToRoom } from "../socket.js";

const router = Router();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = (n = 6) => Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const room = (id: string) => `burraco:${id}`;
const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; };

async function loadState(id: string) {
  const [session] = await db.select().from(burracoSessionsTable).where(eq(burracoSessionsTable.id, id));
  if (!session) return null;
  const pairs = await db.select().from(burracoPairsTable).where(eq(burracoPairsTable.sessionId, id)).orderBy(asc(burracoPairsTable.createdAt));
  const assignments = session.currentRound > 0
    ? await db.select().from(burracoAssignmentsTable).where(and(eq(burracoAssignmentsTable.sessionId, id), eq(burracoAssignmentsTable.roundNumber, session.currentRound))).orderBy(asc(burracoAssignmentsTable.tableNumber))
    : [];
  const standings = [...pairs].sort((a, b) => b.totalScore - a.totalScore);
  return { session, pairs, assignments, standings };
}

async function broadcast(id: string) {
  const state = await loadState(id);
  if (state) emitToRoom(room(id), "burraco:state", state);
  return state;
}

// ── Crea serata ───────────────────────────────────────────────────────────────
router.post("/gestione/burraco/sessions", async (req, res): Promise<void> => {
  const name = String(req.body?.name ?? "Serata Burraco").slice(0, 80);
  let masterCode = makeCode(), joinCode = makeCode();
  for (let i = 0; i < 6; i++) {
    const [m] = await db.select({ id: burracoSessionsTable.id }).from(burracoSessionsTable).where(eq(burracoSessionsTable.masterCode, masterCode));
    const [j] = await db.select({ id: burracoSessionsTable.id }).from(burracoSessionsTable).where(eq(burracoSessionsTable.joinCode, joinCode));
    if (!m && !j) break;
    masterCode = makeCode(); joinCode = makeCode();
  }
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h
  const [session] = await db.insert(burracoSessionsTable).values({ name, masterCode, joinCode, expiresAt }).returning();
  res.status(201).json(session);
});

// ── Risolvi per codice (join O master) ─────────────────────────────────────────
router.get("/gestione/burraco/resolve/:code", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [byMaster] = await db.select().from(burracoSessionsTable).where(eq(burracoSessionsTable.masterCode, code));
  const [byJoin] = byMaster ? [undefined] : await db.select().from(burracoSessionsTable).where(eq(burracoSessionsTable.joinCode, code));
  const session = byMaster ?? byJoin;
  if (!session) { res.status(404).json({ error: "Serata non trovata" }); return; }
  res.json({ sessionId: session.id, isMaster: !!byMaster, name: session.name, status: session.status });
});

// ── Stato completo ──────────────────────────────────────────────────────────────
router.get("/gestione/burraco/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const state = await loadState(id);
  if (!state) { res.status(404).json({ error: "Non trovata" }); return; }
  res.json(state);
});

// Risolvi il tavolo dal suo codice (telefono al tavolo).
router.get("/gestione/burraco/table/:tableCode", async (req, res): Promise<void> => {
  const code = String(req.params["tableCode"]).toUpperCase().trim();
  const [a] = await db.select().from(burracoAssignmentsTable).where(eq(burracoAssignmentsTable.tableCode, code));
  if (!a) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const [session] = await db.select().from(burracoSessionsTable).where(eq(burracoSessionsTable.id, a.sessionId));
  if (!session || a.roundNumber !== session.currentRound) { res.status(409).json({ error: "Manche non più attiva" }); return; }
  const pairIds = [a.pairAId, a.pairBId].filter(Boolean) as string[];
  const pairs = await db.select().from(burracoPairsTable).where(eq(burracoPairsTable.sessionId, a.sessionId));
  const pairOf = (pid: string | null) => pairs.find(p => p.id === pid) ?? null;
  res.json({ assignment: a, pairA: pairOf(a.pairAId), pairB: pairOf(a.pairBId), sessionName: session.name, round: a.roundNumber });
});

// ── Coppie (master) ─────────────────────────────────────────────────────────────
router.post("/gestione/burraco/sessions/:id/pairs", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { name, player1, player2 } = req.body as { name?: string; player1?: string; player2?: string };
  const label = (name?.trim()) || [player1?.trim(), player2?.trim()].filter(Boolean).join(" & ") || "Coppia";
  const [pair] = await db.insert(burracoPairsTable).values({
    sessionId: id, name: label.slice(0, 60), player1: String(player1 ?? "").slice(0, 40), player2: String(player2 ?? "").slice(0, 40),
  }).returning();
  await broadcast(id);
  res.status(201).json(pair);
});

router.delete("/gestione/burraco/sessions/:id/pairs/:pairId", async (req, res): Promise<void> => {
  const id = String(req.params["id"]), pairId = String(req.params["pairId"]);
  await db.delete(burracoPairsTable).where(and(eq(burracoPairsTable.id, pairId), eq(burracoPairsTable.sessionId, id)));
  await broadcast(id);
  res.json({ ok: true });
});

// ── Genera la manche successiva (abbina coppie a tavoli, evitando ripetizioni) ──
router.post("/gestione/burraco/sessions/:id/generate-round", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [session] = await db.select().from(burracoSessionsTable).where(eq(burracoSessionsTable.id, id));
  if (!session) { res.status(404).json({ error: "Non trovata" }); return; }
  const pairs = await db.select().from(burracoPairsTable).where(eq(burracoPairsTable.sessionId, id));
  if (pairs.length < 2) { res.status(400).json({ error: "Servono almeno 2 coppie" }); return; }

  // Storico avversari (per evitare di ri-abbinare le stesse coppie).
  const past = await db.select().from(burracoAssignmentsTable).where(eq(burracoAssignmentsTable.sessionId, id));
  const met = new Set<string>();
  for (const a of past) if (a.pairAId && a.pairBId) { met.add(`${a.pairAId}|${a.pairBId}`); met.add(`${a.pairBId}|${a.pairAId}`); }

  // Accoppiamento greedy su ordine casuale, preferendo avversari mai incontrati.
  const pool = shuffle(pairs);
  const bye = pool.length % 2 === 1 ? pool.pop()! : null; // coppia in riposo
  const tables: Array<{ a: string; b: string }> = [];
  const used = new Set<string>();
  for (const p of pool) {
    if (used.has(p.id)) continue;
    used.add(p.id);
    let opp = pool.find(q => !used.has(q.id) && !met.has(`${p.id}|${q.id}`)) ?? pool.find(q => !used.has(q.id));
    if (!opp) continue;
    used.add(opp.id);
    tables.push({ a: p.id, b: opp.id });
  }

  const nextRound = session.currentRound + 1;
  const rows = tables.map((t, i) => ({
    sessionId: id, roundNumber: nextRound, tableNumber: i + 1, tableCode: makeCode(6),
    pairAId: t.a, pairBId: t.b,
  }));
  if (bye) rows.push({ sessionId: id, roundNumber: nextRound, tableNumber: rows.length + 1, tableCode: makeCode(6), pairAId: bye.id, pairBId: null as unknown as string });
  if (rows.length) await db.insert(burracoAssignmentsTable).values(rows);
  await db.update(burracoSessionsTable).set({ status: "playing", currentRound: nextRound, updatedAt: new Date() }).where(eq(burracoSessionsTable.id, id));
  const state = await broadcast(id);
  res.status(201).json({ ok: true, round: nextRound, tables: rows.length, byePair: bye?.id ?? null, state });
});

// ── Invio punteggio manche (dal tavolo) ────────────────────────────────────────
router.post("/gestione/burraco/assignments/:assignmentId/score", async (req, res): Promise<void> => {
  const aid = String(req.params["assignmentId"]);
  const scoreA = Number(req.body?.scoreA), scoreB = Number(req.body?.scoreB);
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) { res.status(400).json({ error: "Punteggi non validi" }); return; }
  const [a] = await db.select().from(burracoAssignmentsTable).where(eq(burracoAssignmentsTable.id, aid));
  if (!a) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  if (a.submitted) { res.status(409).json({ error: "Punteggio già inviato per questa manche" }); return; }

  // Applica delta ai totali (idempotenza garantita da submitted).
  await db.update(burracoAssignmentsTable).set({ scoreA: Math.round(scoreA), scoreB: Math.round(scoreB), submitted: true }).where(eq(burracoAssignmentsTable.id, aid));
  if (a.pairAId) await addToPair(a.pairAId, Math.round(scoreA));
  if (a.pairBId) await addToPair(a.pairBId, Math.round(scoreB));
  const state = await broadcast(a.sessionId);
  res.json({ ok: true, state });
});

async function addToPair(pairId: string, delta: number): Promise<void> {
  const [p] = await db.select().from(burracoPairsTable).where(eq(burracoPairsTable.id, pairId));
  if (p) await db.update(burracoPairsTable).set({ totalScore: p.totalScore + delta }).where(eq(burracoPairsTable.id, pairId));
}

// ── Fine serata ─────────────────────────────────────────────────────────────────
router.post("/gestione/burraco/sessions/:id/end", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  await db.update(burracoSessionsTable).set({ status: "ended", updatedAt: new Date() }).where(eq(burracoSessionsTable.id, id));
  await broadcast(id);
  res.json({ ok: true });
});

export type { BurracoPair, BurracoAssignment };
export default router;
