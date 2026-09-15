/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — CASINO (backend) ────────────────────────────────────
   Fish virtuali. Il dealer inquadra il QR del giocatore e paga/preleva fish.
   Cassa fish + classifiche per tavolo e serata (Master). Ledger completo.
   Rotte pubbliche: l'accesso è governato da masterCode / dealerCode / playerCode.
──────────────────────────────────────────────────────────────────────────── */

import { Router } from "express";
import { and, eq, desc, asc } from "drizzle-orm";
import {
  db,
  casinoSessionsTable,
  casinoTablesTable,
  casinoPlayersTable,
  casinoTransactionsTable,
} from "@workspace/db";
import { emitToRoom } from "../socket.js";

const router = Router();
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = (n = 6) => Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const room = (id: string) => `casino:${id}`;

async function loadState(id: string) {
  const [session] = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  if (!session) return null;
  const tables = await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.sessionId, id)).orderBy(asc(casinoTablesTable.tableNumber));
  const players = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.sessionId, id)).orderBy(desc(casinoPlayersTable.fishBalance));
  const cassaTotale = players.reduce((s, p) => s + p.fishBalance, 0);
  const perTable = tables.map(t => ({ tableId: t.id, tableNumber: t.tableNumber, name: t.name, total: players.filter(p => p.tableId === t.id).reduce((s, p) => s + p.fishBalance, 0), players: players.filter(p => p.tableId === t.id).length }));
  return { session, tables, players, standings: players, cassaTotale, perTable };
}
async function broadcast(id: string) { const s = await loadState(id); if (s) emitToRoom(room(id), "casino:state", s); return s; }

// ── Crea serata ───────────────────────────────────────────────────────────────
router.post("/gestione/casino/sessions", async (req, res): Promise<void> => {
  const name = String(req.body?.name ?? "Serata Casinò").slice(0, 80);
  let masterCode = makeCode(), joinCode = makeCode();
  for (let i = 0; i < 6; i++) {
    const [m] = await db.select({ id: casinoSessionsTable.id }).from(casinoSessionsTable).where(eq(casinoSessionsTable.masterCode, masterCode));
    const [j] = await db.select({ id: casinoSessionsTable.id }).from(casinoSessionsTable).where(eq(casinoSessionsTable.joinCode, joinCode));
    if (!m && !j) break;
    masterCode = makeCode(); joinCode = makeCode();
  }
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const [session] = await db.insert(casinoSessionsTable).values({ name, masterCode, joinCode, expiresAt }).returning();
  res.status(201).json(session);
});

// ── Risolvi codice (master | dealer | join) ─────────────────────────────────────
router.get("/gestione/casino/resolve/:code", async (req, res): Promise<void> => {
  const code = String(req.params["code"]).toUpperCase().trim();
  const [master] = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.masterCode, code));
  if (master) { res.json({ role: "master", sessionId: master.id, name: master.name }); return; }
  const [dealer] = await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, code));
  if (dealer) { res.json({ role: "dealer", sessionId: dealer.sessionId, tableId: dealer.id }); return; }
  const [join] = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.joinCode, code));
  if (join) { res.json({ role: "join", sessionId: join.id, name: join.name }); return; }
  res.status(404).json({ error: "Codice non trovato" });
});

// ── Stato completo (Master / TV) ────────────────────────────────────────────────
router.get("/gestione/casino/sessions/:id", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const state = await loadState(id);
  if (!state) { res.status(404).json({ error: "Non trovata" }); return; }
  res.json(state);
});

// ── Tavoli (master) ───────────────────────────────────────────────────────────
router.post("/gestione/casino/sessions/:id/tables", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const existing = await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.sessionId, id));
  const tableNumber = existing.length + 1;
  let dealerCode = makeCode();
  for (let i = 0; i < 6; i++) { const [d] = await db.select({ id: casinoTablesTable.id }).from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, dealerCode)); if (!d) break; dealerCode = makeCode(); }
  const name = String(req.body?.name ?? `Tavolo ${tableNumber}`).slice(0, 40);
  const [t] = await db.insert(casinoTablesTable).values({ sessionId: id, tableNumber, name, dealerCode }).returning();
  await broadcast(id);
  res.status(201).json(t);
});

router.delete("/gestione/casino/sessions/:id/tables/:tableId", async (req, res): Promise<void> => {
  const id = String(req.params["id"]), tid = String(req.params["tableId"]);
  await db.delete(casinoTablesTable).where(and(eq(casinoTablesTable.id, tid), eq(casinoTablesTable.sessionId, id)));
  await broadcast(id);
  res.json({ ok: true });
});

// ── Iscrizione giocatore (dal QR serata) ────────────────────────────────────────
router.post("/gestione/casino/sessions/:id/players", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const nickname = String(req.body?.nickname ?? "").trim().slice(0, 30);
  if (!nickname) { res.status(400).json({ error: "Nome obbligatorio" }); return; }
  const tableId = req.body?.tableId && isUUID(String(req.body.tableId)) ? String(req.body.tableId) : null;
  let playerCode = makeCode(7);
  for (let i = 0; i < 6; i++) { const [p] = await db.select({ id: casinoPlayersTable.id }).from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, playerCode)); if (!p) break; playerCode = makeCode(7); }
  const [player] = await db.insert(casinoPlayersTable).values({ sessionId: id, nickname, playerCode, tableId }).returning();
  await broadcast(id);
  res.status(201).json(player);
});

// ── Risolvi giocatore dal suo codice (scan dealer + vista giocatore) ────────────
router.get("/gestione/casino/player/:playerCode", async (req, res): Promise<void> => {
  const code = String(req.params["playerCode"]).toUpperCase().trim();
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, code));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  const [session] = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.id, player.sessionId));
  res.json({ player, sessionName: session?.name ?? "", sessionId: player.sessionId });
});

// ── Vista Dealer (il suo tavolo) ────────────────────────────────────────────────
router.get("/gestione/casino/dealer/:dealerCode", async (req, res): Promise<void> => {
  const code = String(req.params["dealerCode"]).toUpperCase().trim();
  const [table] = await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, code));
  if (!table) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const players = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.sessionId, table.sessionId)).orderBy(desc(casinoPlayersTable.fishBalance));
  const [session] = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.id, table.sessionId));
  res.json({ table, sessionName: session?.name ?? "", sessionId: table.sessionId, tablePlayers: players.filter(p => p.tableId === table.id), allPlayers: players });
});

// ── Transazione fish (dealer paga/preleva) ──────────────────────────────────────
router.post("/gestione/casino/tx", async (req, res): Promise<void> => {
  const { dealerCode, playerCode, playerId, delta, kind } = req.body as { dealerCode?: string; playerCode?: string; playerId?: string; delta?: number; kind?: string };
  const amt = Number(delta);
  if (!Number.isFinite(amt) || amt === 0) { res.status(400).json({ error: "Importo non valido" }); return; }
  const [table] = dealerCode ? await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, String(dealerCode).toUpperCase().trim())) : [undefined];
  if (!table) { res.status(403).json({ error: "Dealer non autorizzato" }); return; }
  const [player] = playerId && isUUID(String(playerId))
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, String(playerId)))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, String(playerCode ?? "").toUpperCase().trim()));
  if (!player || player.sessionId !== table.sessionId) { res.status(404).json({ error: "Giocatore non trovato in questa serata" }); return; }
  const newBalance = player.fishBalance + Math.round(amt);
  if (newBalance < 0) { res.status(409).json({ error: "Fish insufficienti", balance: player.fishBalance }); return; }
  await db.update(casinoPlayersTable).set({ fishBalance: newBalance }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({
    sessionId: table.sessionId, tableId: table.id, dealerCode: table.dealerCode, playerId: player.id,
    delta: Math.round(amt), kind: String(kind ?? (amt > 0 ? "pay" : "take")), balanceAfter: newBalance,
  });
  await broadcast(table.sessionId);
  res.json({ ok: true, player: { ...player, fishBalance: newBalance }, balance: newBalance });
});

// ── Storico movimenti (Master) ──────────────────────────────────────────────────
router.get("/gestione/casino/sessions/:id/transactions", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  const tx = await db.select().from(casinoTransactionsTable).where(eq(casinoTransactionsTable.sessionId, id)).orderBy(desc(casinoTransactionsTable.createdAt)).limit(100);
  res.json({ transactions: tx });
});

router.post("/gestione/casino/sessions/:id/end", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  await db.update(casinoSessionsTable).set({ status: "ended", updatedAt: new Date() }).where(eq(casinoSessionsTable.id, id));
  await broadcast(id);
  res.json({ ok: true });
});

export default router;
