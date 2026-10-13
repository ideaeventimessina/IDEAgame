/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — CASINO (backend) ────────────────────────────────────
   Fish virtuali. Il dealer inquadra il QR del giocatore e paga/preleva fish.
   Cassa fish + classifiche per tavolo e serata (Master). Ledger completo.
   Rotte pubbliche: l'accesso è governato da masterCode / dealerCode / playerCode.
──────────────────────────────────────────────────────────────────────────── */

import { Router } from "express";
import { randomInt } from "node:crypto";
import { and, eq, desc, asc, sql, inArray } from "drizzle-orm";
import {
  db,
  casinoSessionsTable,
  casinoTablesTable,
  casinoPlayersTable,
  casinoTransactionsTable,
} from "@workspace/db";
import { emitToRoom } from "../socket.js";

const router = Router();
const DEFAULT_START_FISH = 500;

/* Config della serata (jsonb, niente migrazioni):
   { startFish, tvCode, playerAvatars:{playerId:url}, pendingBets:{playerId:{amount,tableId,at}} } */
/* Tavoli da gioco interattivi (80" touch). Vista dall'alto. Pilota: roulette.
   Ogni postazione ha un codice (QR) che il giocatore scansiona per sedersi e
   puntare dal telefono sul tappeto condiviso, scalando dal suo saldo fiche. */
type RouletteBet = { id: string; seatNo: number; playerId: string; kind: string; numbers: number[]; amount: number };
type GameSeat = { code: string; playerId: string | null };
type GameTable = {
  id: string; type: "roulette"; name: string; displayCode: string;
  phase: "betting" | "spinning" | "result"; round: number;
  seats: Record<string, GameSeat>;      // seatNo → { code, playerId }
  bets: RouletteBet[];
  result: { number: number; at: string } | null;
  history: number[];
};
type CasinoConfig = {
  startFish?: number;
  tvCode?: string;
  playerAvatars?: Record<string, string>;
  pendingBets?: Record<string, { amount: number; tableId: string | null; at: string }>;
  gameTables?: Record<string, GameTable>;
  bjTables?: Record<string, BjTable>;
  horseTables?: Record<string, HorseTable>;
};
const cfgOf = (session: { config?: unknown }): CasinoConfig => (session?.config ?? {}) as CasinoConfig;
async function patchConfig(id: string, patch: Partial<CasinoConfig>): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const cur = (s?.config ?? {}) as CasinoConfig;
  await db.update(casinoSessionsTable).set({ config: { ...cur, ...patch } }).where(eq(casinoSessionsTable.id, id));
}
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
  const cfg = cfgOf(session);
  // Giocatori arricchiti con la foto (dal config) + la puntata in sospeso.
  const avatars = cfg.playerAvatars ?? {};
  const bets = cfg.pendingBets ?? {};
  const playersRich = players.map(p => ({ ...p, avatarUrl: avatars[p.id] ?? null, pendingBet: bets[p.id]?.amount ?? 0 }));
  return {
    session, tables,
    players: playersRich, standings: playersRich,
    cassaTotale, perTable,
    startFish: cfg.startFish ?? DEFAULT_START_FISH,
    tvCode: cfg.tvCode ?? null,
  };
}
async function broadcast(id: string) { const s = await loadState(id); if (s) emitToRoom(room(id), "casino:state", s); return s; }

// ── Crea serata ───────────────────────────────────────────────────────────────
router.post("/gestione/casino/sessions", async (req, res): Promise<void> => {
  const name = String(req.body?.name ?? "IDEACASINO").slice(0, 80);
  // Setup primo ingresso: quanti dealer/tavoli + fiche iniziali (default 500).
  const dealers = Math.min(12, Math.max(0, Math.round(Number(req.body?.dealers ?? 0)) || 0));
  const startFish = Math.min(100000, Math.max(0, Math.round(Number(req.body?.startFish ?? DEFAULT_START_FISH)) || DEFAULT_START_FISH));
  let masterCode = makeCode(), joinCode = makeCode();
  for (let i = 0; i < 6; i++) {
    const [m] = await db.select({ id: casinoSessionsTable.id }).from(casinoSessionsTable).where(eq(casinoSessionsTable.masterCode, masterCode));
    const [j] = await db.select({ id: casinoSessionsTable.id }).from(casinoSessionsTable).where(eq(casinoSessionsTable.joinCode, joinCode));
    if (!m && !j) break;
    masterCode = makeCode(); joinCode = makeCode();
  }
  const tvCode = makeCode();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const [session] = await db.insert(casinoSessionsTable).values({
    name, masterCode, joinCode, expiresAt, config: { startFish, tvCode },
  }).returning();
  // Crea i tavoli richiesti, ognuno col suo dealerCode.
  for (let n = 1; n <= dealers; n++) {
    let dealerCode = makeCode();
    for (let i = 0; i < 6; i++) { const [d] = await db.select({ id: casinoTablesTable.id }).from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, dealerCode)); if (!d) break; dealerCode = makeCode(); }
    await db.insert(casinoTablesTable).values({ sessionId: session!.id, tableNumber: n, name: `Tavolo ${n}`, dealerCode });
  }
  const full = await loadState(session!.id);
  res.status(201).json(full?.session ?? session);
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
  // Codice TV (pubblico, nessun segreto esposto): vive nel config jsonb.
  const [tv] = await db.select().from(casinoSessionsTable).where(sql`${casinoSessionsTable.config}->>'tvCode' = ${code}`);
  if (tv) { res.json({ role: "tv", sessionId: tv.id, name: tv.name }); return; }
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

// ── Setup primo ingresso (Master): quanti dealer + fiche iniziali ──────────────
router.post("/gestione/casino/sessions/:id/setup", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const dealers = Math.min(12, Math.max(0, Math.round(Number(req.body?.dealers ?? 0)) || 0));
  const startFish = Math.min(100000, Math.max(0, Math.round(Number(req.body?.startFish ?? DEFAULT_START_FISH)) || DEFAULT_START_FISH));
  await patchConfig(id, { startFish });
  // Crea i tavoli mancanti per arrivare a 'dealers' totali.
  const existing = await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.sessionId, id));
  for (let n = existing.length + 1; n <= dealers; n++) {
    let dealerCode = makeCode();
    for (let i = 0; i < 6; i++) { const [d] = await db.select({ id: casinoTablesTable.id }).from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, dealerCode)); if (!d) break; dealerCode = makeCode(); }
    await db.insert(casinoTablesTable).values({ sessionId: id, tableNumber: n, name: `Tavolo ${n}`, dealerCode });
  }
  const state = await broadcast(id);
  res.json(state ?? { ok: true });
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
  // Ogni giocatore parte con le fiche iniziali della serata (default 500).
  const [session] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const startFish = (cfgOf(session ?? {}).startFish) ?? DEFAULT_START_FISH;
  const [player] = await db.insert(casinoPlayersTable).values({ sessionId: id, nickname, playerCode, tableId, fishBalance: startFish }).returning();
  // Selfie al login (riconoscibile al tavolo): dataURL ~256px salvato in config (come la Home).
  const photo = typeof req.body?.photo === "string" ? String(req.body.photo) : "";
  if (photo.startsWith("data:image/") && photo.length <= 400_000) {
    const cur = cfgOf(session ?? {});
    await patchConfig(id, { playerAvatars: { ...(cur.playerAvatars ?? {}), [player!.id]: photo } });
  }
  const full = await broadcast(id);
  const rich = full?.players.find(p => p.id === player!.id) ?? player;
  res.status(201).json(rich);
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

// ── Dealer lega un giocatore al proprio tavolo (tap sulla foto) ─────────────────
router.post("/gestione/casino/seat", async (req, res): Promise<void> => {
  const { dealerCode, playerId, playerCode, seat } = req.body as { dealerCode?: string; playerId?: string; playerCode?: string; seat?: boolean };
  const [table] = dealerCode ? await db.select().from(casinoTablesTable).where(eq(casinoTablesTable.dealerCode, String(dealerCode).toUpperCase().trim())) : [undefined];
  if (!table) { res.status(403).json({ error: "Dealer non autorizzato" }); return; }
  const [player] = playerId && isUUID(String(playerId))
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, String(playerId)))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, String(playerCode ?? "").toUpperCase().trim()));
  if (!player || player.sessionId !== table.sessionId) { res.status(404).json({ error: "Giocatore non trovato in questa serata" }); return; }
  // seat=false stacca il giocatore dal tavolo; altrimenti lo lega a questo tavolo.
  const newTableId = seat === false ? null : table.id;
  await db.update(casinoPlayersTable).set({ tableId: newTableId }).where(eq(casinoPlayersTable.id, player.id));
  await broadcast(table.sessionId);
  res.json({ ok: true, tableId: newTableId });
});

// ── Giocatore piazza una puntata (si instrada sul suo tavolo) ───────────────────
router.post("/gestione/casino/bet", async (req, res): Promise<void> => {
  const { playerCode, playerId, amount } = req.body as { playerCode?: string; playerId?: string; amount?: number };
  const amt = Math.round(Number(amount));
  const [player] = playerId && isUUID(String(playerId))
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, String(playerId)))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, String(playerCode ?? "").toUpperCase().trim()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  const [session] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, player.sessionId));
  const cur = cfgOf(session ?? {});
  const bets = { ...(cur.pendingBets ?? {}) };
  if (!Number.isFinite(amt) || amt <= 0) {
    // amount 0/assente = annulla la puntata in sospeso.
    delete bets[player.id];
  } else {
    if (amt > player.fishBalance) { res.status(409).json({ error: "Fiche insufficienti", balance: player.fishBalance }); return; }
    bets[player.id] = { amount: amt, tableId: player.tableId ?? null, at: new Date().toISOString() };
  }
  await patchConfig(player.sessionId, { pendingBets: bets });
  await broadcast(player.sessionId);
  res.json({ ok: true, pendingBet: bets[player.id]?.amount ?? 0 });
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
  // Risolta la giocata: azzero l'eventuale puntata in sospeso del giocatore.
  const [sCfg] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, table.sessionId));
  const curBets = cfgOf(sCfg ?? {}).pendingBets ?? {};
  if (curBets[player.id]) { const nb = { ...curBets }; delete nb[player.id]; await patchConfig(table.sessionId, { pendingBets: nb }); }
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

// ══════════════════ TAVOLI INTERATTIVI — ROULETTE ══════════════════════════════
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// Payout = PROFITTO per 1 fiche (il totale accreditato al vincitore è amount*(mult+1)).
const PAYOUT: Record<string, number> = { straight: 35, split: 17, red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1, dozen1: 2, dozen2: 2, dozen3: 2, col1: 2, col2: 2, col3: 2 };
function betWins(kind: string, numbers: number[], r: number): boolean {
  switch (kind) {
    case "straight": case "split": return numbers.includes(r);
    case "red": return RED.has(r);
    case "black": return r !== 0 && !RED.has(r);
    case "even": return r !== 0 && r % 2 === 0;
    case "odd": return r % 2 === 1;
    case "low": return r >= 1 && r <= 18;
    case "high": return r >= 19 && r <= 36;
    case "dozen1": return r >= 1 && r <= 12;
    case "dozen2": return r >= 13 && r <= 24;
    case "dozen3": return r >= 25 && r <= 36;
    case "col1": return r !== 0 && r % 3 === 1;
    case "col2": return r !== 0 && r % 3 === 2;
    case "col3": return r !== 0 && r % 3 === 0;
    default: return false;
  }
}
// Trova il tavolo (e la sessione) a partire dal codice display o dal codice di una sedia.
async function findGameTable(code: string): Promise<{ sessionId: string; table: GameTable; seatNo?: string } | null> {
  const c = code.toUpperCase().trim();
  const sessions = await db.select({ id: casinoSessionsTable.id, config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.status, "active"));
  for (const s of sessions) {
    const tables = ((s.config ?? {}) as CasinoConfig).gameTables ?? {};
    for (const t of Object.values(tables)) {
      if (t.displayCode === c) return { sessionId: s.id, table: t };
      const seatNo = Object.keys(t.seats).find(n => t.seats[n]!.code === c);
      if (seatNo) return { sessionId: s.id, table: t, seatNo };
    }
  }
  return null;
}
async function saveGameTable(sessionId: string, table: GameTable): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const cur = (s?.config ?? {}) as CasinoConfig;
  await db.update(casinoSessionsTable).set({ config: { ...cur, gameTables: { ...(cur.gameTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
}
// Stato arricchito del tavolo per display e controller (nomi/foto/saldi delle sedie).
async function tableState(sessionId: string, table: GameTable) {
  const players = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.sessionId, sessionId));
  const cfg = cfgOf({ config: (await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)))[0]?.config });
  const avatars = cfg.playerAvatars ?? {};
  const seats = Object.fromEntries(Object.entries(table.seats).map(([no, s]) => {
    const p = s.playerId ? players.find(x => x.id === s.playerId) : null;
    return [no, { ...s, nickname: p?.nickname ?? null, avatarUrl: p ? (avatars[p.id] ?? null) : null, balance: p?.fishBalance ?? null }];
  }));
  const betsBySeat: Record<string, number> = {};
  for (const b of table.bets) betsBySeat[b.seatNo] = (betsBySeat[b.seatNo] ?? 0) + b.amount;
  return { table: { ...table, seats }, betsBySeat };
}
function tableRoom(code: string) { return `casino:table:${code}`; }
async function broadcastTable(sessionId: string, table: GameTable) {
  const st = await tableState(sessionId, table);
  emitToRoom(tableRoom(table.displayCode), "casino:table", st);
  return st;
}

// ── Crea un tavolo roulette (Master) ────────────────────────────────────────────
router.post("/gestione/casino/sessions/:id/game-tables", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const seatsN = Math.min(12, Math.max(1, Math.round(Number(req.body?.seats ?? 10)) || 10));
  const name = String(req.body?.name ?? "Roulette").slice(0, 40);
  const tableId = makeCode(8);
  const seats: Record<string, GameSeat> = {};
  for (let i = 1; i <= seatsN; i++) seats[String(i)] = { code: makeCode(6), playerId: null };
  const table: GameTable = { id: tableId, type: "roulette", name, displayCode: makeCode(6), phase: "betting", round: 1, seats, bets: [], result: null, history: [] };
  await saveGameTable(id, table);
  await broadcastTable(id, table);
  res.status(201).json({ table });
});

// ── Lista tavoli di gioco della serata (Master) ─────────────────────────────────
router.get("/gestione/casino/sessions/:id/game-tables", async (req, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const tables = Object.values(((s?.config ?? {}) as CasinoConfig).gameTables ?? {});
  res.json({ tables });
});

// ── Stato tavolo (display 80" + controller sedia) ───────────────────────────────
router.get("/gestione/casino/table/:code", async (req, res): Promise<void> => {
  const found = await findGameTable(String(req.params["code"]));
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const st = await tableState(found.sessionId, found.table);
  res.json({ ...st, sessionId: found.sessionId, seatNo: found.seatNo ?? null });
});

// ── Il giocatore si siede a una postazione (scan QR sedia) ──────────────────────
router.post("/gestione/casino/table/seat", async (req, res): Promise<void> => {
  const seatCode = String(req.body?.seatCode ?? "").toUpperCase().trim();
  const playerCode = String(req.body?.playerCode ?? "").toUpperCase().trim();
  const found = await findGameTable(seatCode);
  if (!found || !found.seatNo) { res.status(404).json({ error: "Postazione non trovata" }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, playerCode));
  if (!player || player.sessionId !== found.sessionId) { res.status(404).json({ error: "Accedi prima come giocatore della serata" }); return; }
  const table = found.table;
  // Se il giocatore era già su un'altra sedia di questo tavolo, liberala.
  for (const k of Object.keys(table.seats)) if (table.seats[k]!.playerId === player.id) table.seats[k]!.playerId = null;
  if (table.seats[found.seatNo]!.playerId && table.seats[found.seatNo]!.playerId !== player.id) { res.status(409).json({ error: "Postazione occupata" }); return; }
  table.seats[found.seatNo]!.playerId = player.id;
  await saveGameTable(found.sessionId, table);
  await broadcastTable(found.sessionId, table);
  res.json({ ok: true, seatNo: found.seatNo, tableDisplayCode: table.displayCode, player: { id: player.id, nickname: player.nickname, fishBalance: player.fishBalance } });
});

// ── Piazza una puntata (dal telefono, scalata dal saldo) ────────────────────────
router.post("/gestione/casino/table/bet", async (req, res): Promise<void> => {
  const seatCode = String(req.body?.seatCode ?? "").toUpperCase().trim();
  const kind = String(req.body?.kind ?? "");
  const amount = Math.round(Number(req.body?.amount));
  const numbers = Array.isArray(req.body?.numbers) ? (req.body.numbers as unknown[]).map(n => Math.round(Number(n))).filter(n => Number.isFinite(n) && n >= 0 && n <= 36) : [];
  if (!(kind in PAYOUT)) { res.status(400).json({ error: "Tipo puntata non valido" }); return; }
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Importo non valido" }); return; }
  if ((kind === "straight" || kind === "split") && numbers.length === 0) { res.status(400).json({ error: "Scegli il numero" }); return; }
  const found = await findGameTable(seatCode);
  if (!found || !found.seatNo) { res.status(404).json({ error: "Postazione non trovata" }); return; }
  const table = found.table;
  if (table.phase !== "betting") { res.status(409).json({ error: "Puntate chiuse" }); return; }
  const seat = table.seats[found.seatNo]!;
  if (!seat.playerId) { res.status(409).json({ error: "Siediti prima alla postazione" }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, seat.playerId));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  if (player.fishBalance < amount) { res.status(409).json({ error: "Fiche insufficienti", balance: player.fishBalance }); return; }
  // Escrow: scala subito le fiche (sono "sul tappeto").
  const newBal = player.fishBalance - amount;
  await db.update(casinoPlayersTable).set({ fishBalance: newBal }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta: -amount, kind: "roulette_bet", balanceAfter: newBal });
  table.bets.push({ id: makeCode(8), seatNo: Number(found.seatNo), playerId: player.id, kind, numbers, amount });
  await saveGameTable(found.sessionId, table);
  await broadcastTable(found.sessionId, table);
  await broadcast(found.sessionId);
  res.json({ ok: true, balance: newBal });
});

// ── Annulla l'ultima puntata della sedia (rimborso) ─────────────────────────────
router.post("/gestione/casino/table/undo", async (req, res): Promise<void> => {
  const seatCode = String(req.body?.seatCode ?? "").toUpperCase().trim();
  const found = await findGameTable(seatCode);
  if (!found || !found.seatNo) { res.status(404).json({ error: "Postazione non trovata" }); return; }
  const table = found.table;
  if (table.phase !== "betting") { res.status(409).json({ error: "Puntate chiuse" }); return; }
  const seatNo = Number(found.seatNo);
  const idx = [...table.bets].reverse().findIndex(b => b.seatNo === seatNo);
  if (idx === -1) { res.status(404).json({ error: "Nessuna puntata da annullare" }); return; }
  const realIdx = table.bets.length - 1 - idx;
  const [bet] = table.bets.splice(realIdx, 1);
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, bet!.playerId));
  if (player) {
    const nb = player.fishBalance + bet!.amount;
    await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
    await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta: bet!.amount, kind: "roulette_undo", balanceAfter: nb });
  }
  await saveGameTable(found.sessionId, table);
  await broadcastTable(found.sessionId, table);
  await broadcast(found.sessionId);
  res.json({ ok: true });
});

// ── Gira la ruota: estrae il numero, paga i vincitori ───────────────────────────
router.post("/gestione/casino/table/spin", async (req, res): Promise<void> => {
  const code = String(req.body?.displayCode ?? req.body?.seatCode ?? "").toUpperCase().trim();
  const found = await findGameTable(code);
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const table = found.table;
  if (table.phase !== "betting") { res.status(409).json({ error: "Giro già in corso" }); return; }
  const r = Math.floor(Math.random() * 37); // 0–36, zero singolo europeo
  table.phase = "result";
  table.result = { number: r, at: new Date().toISOString() };
  table.history = [r, ...table.history].slice(0, 20);
  // Paga i vincitori (lo stake era già scalato all'ingresso della puntata).
  for (const b of table.bets) {
    if (betWins(b.kind, b.numbers, r)) {
      const payout = b.amount * (PAYOUT[b.kind]! + 1);
      const [p] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, b.playerId));
      if (p) {
        const nb = p.fishBalance + payout;
        await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, p.id));
        await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: p.id, delta: payout, kind: "roulette_win", balanceAfter: nb });
      }
    }
  }
  await saveGameTable(found.sessionId, table);
  await broadcastTable(found.sessionId, table);
  await broadcast(found.sessionId);
  res.json({ ok: true, number: r });
});

// ── Nuovo giro: pulisce le puntate, tiene le sedie ──────────────────────────────
router.post("/gestione/casino/table/next", async (req, res): Promise<void> => {
  const code = String(req.body?.displayCode ?? req.body?.seatCode ?? "").toUpperCase().trim();
  const found = await findGameTable(code);
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const table = found.table;
  table.phase = "betting"; table.bets = []; table.result = null; table.round += 1;
  await saveGameTable(found.sessionId, table);
  await broadcastTable(found.sessionId, table);
  res.json({ ok: true });
});

/* ═══ BLACKJACK ───────────────────────────────────────────────────────────────
   Tavolo interattivo 80" (sola lettura) + gioco dal telefono di ogni giocatore.
   Motore server-autorevole: 6 mazzi mescolati con RNG sicuro, banco pesca ≤16 e
   sta sul 17 (soft17 configurabile), BJ naturale 3:2, vincita 1:1, pareggio
   restituisce. Matematica intera (puntate multiple di 10 → payout sempre interi).
   La carta coperta del banco NON viene mai inviata al client prima della
   rivelazione. Saldo = casinoPlayersTable.fishBalance; stato in config.bjTables. */

type Card = { r: string; s: string }; // r: 2..10,J,Q,K,A ; s: s(picche) h(cuori) d(quadri) c(fiori)
type BjStatus = "empty" | "joined" | "bet" | "playing" | "stand" | "bust" | "blackjack" | "done";
type BjSeat = { code: string; playerId: string | null; bet: number; cards: Card[]; status: BjStatus; outcome: string | null; profit: number; doubled: boolean };
type BjResultRow = { seatNo: number; nickname: string; bet: number; total: number; outcome: string; profit: number };
type BjHistory = { hand: number; at: string; dealerTotal: number; dealerCards: Card[]; results: BjResultRow[] };
type BjTable = {
  id: string; type: "blackjack"; name: string; displayCode: string;
  phase: "waiting" | "betting" | "playing" | "dealer" | "result";
  round: number;
  seats: Record<string, BjSeat>;
  dealer: Card[]; hole: Card | null; shoe: Card[];
  activeSeat: number | null; turnEndsAt: string | null;
  betEndsAt: string | null;
  minBet: number; maxBet: number; step: number; timeout: number; betSeconds: number; soft17Hit: boolean;
  suspended: boolean;
  history: BjHistory[];
};

const BJ_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const BJ_SUITS = ["s", "h", "d", "c"];
function freshShoe(): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < 6; d++) for (const s of BJ_SUITS) for (const r of BJ_RANKS) cards.push({ r, s });
  for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); const t = cards[i]!; cards[i] = cards[j]!; cards[j] = t; }
  return cards;
}
function cardVal(r: string): number { return r === "A" ? 11 : (r === "K" || r === "Q" || r === "J" || r === "10") ? 10 : parseInt(r, 10); }
function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardVal(c.r); if (c.r === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 && total <= 21 };
}
const isNaturalBJ = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
function drawCard(t: BjTable): Card { if (t.shoe.length === 0) t.shoe = freshShoe(); return t.shoe.shift()!; }
function creditFor(outcome: string, bet: number): number {
  if (outcome === "win") return bet * 2;             // puntata + profitto 1:1
  if (outcome === "blackjack") return bet + (bet * 3) / 2; // puntata + profitto 3:2 (bet multiplo di 10 → intero)
  if (outcome === "push") return bet;                 // restituzione
  return 0;                                           // lose | bust
}

async function findBjTable(code: string): Promise<{ sessionId: string; table: BjTable; seatNo?: number } | null> {
  const sessions = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.status, "active"));
  for (const s of sessions) {
    const cfg = (s.config ?? {}) as CasinoConfig;
    for (const t of Object.values(cfg.bjTables ?? {})) {
      if (t.displayCode === code) return { sessionId: s.id, table: t };
      for (const [no, seat] of Object.entries(t.seats)) if (seat.code === code) return { sessionId: s.id, table: t, seatNo: Number(no) };
    }
  }
  return null;
}
async function saveBjTable(sessionId: string, table: BjTable): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const cur = (s?.config ?? {}) as CasinoConfig;
  await db.update(casinoSessionsTable).set({ config: { ...cur, bjTables: { ...(cur.bjTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
}
// Stato ripulito per il client: niente shoe, carta coperta nascosta finché non rivelata.
async function bjState(sessionId: string, table: BjTable) {
  const ids = Object.values(table.seats).map(s => s.playerId).filter((x): x is string => !!x);
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const [sess] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const avatars = ((sess?.config ?? {}) as CasinoConfig).playerAvatars ?? {};
  const pMap = new Map(players.map(p => [p.id, p]));
  const seats: Record<string, unknown> = {};
  for (const [no, s] of Object.entries(table.seats)) {
    const p = s.playerId ? pMap.get(s.playerId) : null;
    const hv = handValue(s.cards);
    seats[no] = { code: s.code, playerId: s.playerId, nickname: p?.nickname ?? null, avatarUrl: p ? (avatars[p.id] ?? null) : null,
      balance: p?.fishBalance ?? null, bet: s.bet, cards: s.cards, total: s.cards.length ? hv.total : null, soft: hv.soft,
      status: s.status, outcome: s.outcome, profit: s.profit, doubled: s.doubled };
  }
  const dhv = handValue(table.dealer);
  return {
    table: {
      id: table.id, name: table.name, displayCode: table.displayCode, type: "blackjack",
      phase: table.phase, round: table.round, seats,
      dealer: { cards: table.dealer, total: table.dealer.length ? dhv.total : null, hidden: table.hole != null },
      activeSeat: table.activeSeat, turnEndsAt: table.turnEndsAt, betEndsAt: table.betEndsAt,
      minBet: table.minBet, maxBet: table.maxBet, step: table.step, timeout: table.timeout, betSeconds: table.betSeconds,
      soft17Hit: table.soft17Hit, suspended: table.suspended,
      history: table.history.slice(0, 20),
    },
    sessionId,
  };
}

// Prossima postazione che deve ancora giocare (in ordine di posto).
function nextBjActive(table: BjTable): number | null {
  for (const no of Object.keys(table.seats).map(Number).sort((a, b) => a - b)) {
    const s = table.seats[String(no)]!;
    if (s.bet > 0 && s.status === "playing") return no;
  }
  return null;
}
// Chiude i turni: scopre la coperta, banco pesca, salda, accredita, storicizza.
async function finishBjHand(sessionId: string, table: BjTable): Promise<void> {
  if (table.hole) { table.dealer.push(table.hole); table.hole = null; }
  const anyStand = Object.values(table.seats).some(s => s.bet > 0 && s.status === "stand");
  if (anyStand) {
    // banco pesca fino a 16, sta sul 17 (soft17 opzionale)
    for (let guard = 0; guard < 20; guard++) {
      const hv = handValue(table.dealer);
      if (hv.total < 17) { table.dealer.push(drawCard(table)); continue; }
      if (hv.total === 17 && hv.soft && table.soft17Hit) { table.dealer.push(drawCard(table)); continue; }
      break;
    }
  }
  const dhv = handValue(table.dealer);
  const dealerBJ = isNaturalBJ(table.dealer);
  const ids = Object.values(table.seats).map(s => s.playerId).filter((x): x is string => !!x);
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const pMap = new Map(players.map(p => [p.id, p]));
  const results: BjResultRow[] = [];
  for (const [no, s] of Object.entries(table.seats)) {
    if (s.bet <= 0 || !s.playerId) continue;
    const hv = handValue(s.cards);
    let outcome: string;
    if (s.status === "bust") outcome = "bust";
    else if (s.status === "blackjack") outcome = dealerBJ ? "push" : "blackjack";
    else if (dealerBJ) outcome = "lose";
    else if (dhv.total > 21) outcome = "win";
    else if (hv.total > dhv.total) outcome = "win";
    else if (hv.total < dhv.total) outcome = "lose";
    else outcome = "push";
    const credit = creditFor(outcome, s.bet);
    s.outcome = outcome; s.profit = credit - s.bet; s.status = "done";
    const p = pMap.get(s.playerId);
    if (credit > 0 && p) {
      const nb = p.fishBalance + credit;
      await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, p.id));
      await db.insert(casinoTransactionsTable).values({ sessionId, tableId: null, dealerCode: "", playerId: p.id, delta: credit, kind: outcome === "push" ? "blackjack_push" : "blackjack_win", balanceAfter: nb });
      p.fishBalance = nb;
    }
    results.push({ seatNo: Number(no), nickname: p?.nickname ?? "—", bet: s.bet, total: hv.total, outcome, profit: s.profit });
  }
  table.history.unshift({ hand: table.round, at: new Date().toISOString(), dealerTotal: dhv.total, dealerCards: [...table.dealer], results });
  table.history = table.history.slice(0, 50);
  table.activeSeat = null; table.turnEndsAt = null; table.phase = "result";
}
// Dopo un'azione: passa al prossimo giocatore o chiude la mano. Ritorna se ha chiuso.
async function advanceBj(sessionId: string, table: BjTable): Promise<void> {
  const nxt = nextBjActive(table);
  if (nxt != null) { table.activeSeat = nxt; table.turnEndsAt = new Date(Date.now() + table.timeout * 1000).toISOString(); table.phase = "playing"; return; }
  await finishBjHand(sessionId, table);
}

/* ── Creazione / elenco (regia) ── */
router.post("/gestione/casino/sessions/:id/bj-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const b = req.body as { name?: string; seats?: number; minBet?: number; maxBet?: number; step?: number; timeout?: number; betSeconds?: number };
  const seatsN = Math.min(7, Math.max(1, Math.round(Number(b.seats) || 7)));
  const seats: Record<string, BjSeat> = {};
  for (let i = 1; i <= seatsN; i++) seats[String(i)] = { code: makeCode(6), playerId: null, bet: 0, cards: [], status: "empty", outcome: null, profit: 0, doubled: false };
  const table: BjTable = {
    id: makeCode(8), type: "blackjack", name: (b.name || "Tavolo Blackjack").slice(0, 40), displayCode: makeCode(6),
    phase: "waiting", round: 1, seats, dealer: [], hole: null, shoe: freshShoe(), activeSeat: null, turnEndsAt: null, betEndsAt: null,
    minBet: Math.max(1, Math.round(Number(b.minBet) || 10)), maxBet: Math.max(1, Math.round(Number(b.maxBet) || 500)),
    step: Math.max(1, Math.round(Number(b.step) || 10)), timeout: Math.max(10, Math.round(Number(b.timeout) || 30)),
    betSeconds: Math.max(10, Math.round(Number(b.betSeconds) || 30)), soft17Hit: false, suspended: false, history: [],
  };
  await saveBjTable(id, table);
  res.json(await bjState(id, table));
});
router.get("/gestione/casino/sessions/:id/bj-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const tables = Object.values(((s?.config ?? {}) as CasinoConfig).bjTables ?? {}).map(t => ({
    id: t.id, name: t.name, displayCode: t.displayCode, phase: t.phase, round: t.round, suspended: t.suspended,
    seatsN: Object.keys(t.seats).length, occupied: Object.values(t.seats).filter(x => x.playerId).length,
    minBet: t.minBet, maxBet: t.maxBet, timeout: t.timeout,
  }));
  res.json({ tables });
});

/* ── Stato tavolo (monitor 80" + telefono) ── */
router.get("/gestione/casino/bj/:code", async (req, res): Promise<void> => {
  const found = await findBjTable((req.params.code || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  // timeout turno gestito lato server: se scaduto, forza STAI e avanza
  if (found.table.phase === "playing" && found.table.turnEndsAt && Date.now() > Date.parse(found.table.turnEndsAt) + 1500) {
    const no = found.table.activeSeat;
    if (no != null) { const s = found.table.seats[String(no)]; if (s && s.status === "playing") { s.status = "stand"; await advanceBj(found.sessionId, found.table); await saveBjTable(found.sessionId, found.table); } }
  }
  const st = await bjState(found.sessionId, found.table);
  res.json({ ...st, seatNo: found.seatNo ?? null });
});

/* ── Regia: apri puntate / distribuisci / impostazioni / sospendi ── */
router.post("/gestione/casino/bj/open", async (req, res): Promise<void> => {
  const found = await findBjTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  if (t.phase === "result") t.round += 1;
  if (t.shoe.length < 78) t.shoe = freshShoe(); // rimescola sotto il 25%
  for (const s of Object.values(t.seats)) { s.bet = 0; s.cards = []; s.outcome = null; s.profit = 0; s.doubled = false; s.status = s.playerId ? "joined" : "empty"; }
  t.dealer = []; t.hole = null; t.activeSeat = null; t.turnEndsAt = null;
  t.phase = "betting"; t.betEndsAt = new Date(Date.now() + t.betSeconds * 1000).toISOString();
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/bj/deal", async (req, res): Promise<void> => {
  const found = await findBjTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase !== "betting") { res.status(409).json({ error: "Non in fase puntate" }); return; }
  // Come la roulette: la mano parte anche SENZA puntate (il banco gioca da solo); chi si
  // siede entra dalla mano successiva. Niente blocco "serve una puntata".
  const participants = Object.entries(t.seats).filter(([, s]) => s.bet > 0 && s.playerId);
  t.betEndsAt = null;
  for (const [, s] of participants) s.cards = [];
  t.dealer = [];
  for (const [, s] of participants) s.cards.push(drawCard(t));
  t.dealer.push(drawCard(t));                 // carta visibile del banco
  for (const [, s] of participants) s.cards.push(drawCard(t));
  t.hole = drawCard(t);                        // carta coperta (segreta)
  for (const [, s] of participants) s.status = isNaturalBJ(s.cards) ? "blackjack" : "playing";
  const up = t.dealer[0]!;
  const dealerPeek = (up.r === "A" || cardVal(up.r) === 10) && isNaturalBJ([up, t.hole]);
  if (dealerPeek) { await finishBjHand(found.sessionId, t); }
  else { t.phase = "playing"; await advanceBj(found.sessionId, t); }
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/bj/settings", async (req, res): Promise<void> => {
  const found = await findBjTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase === "playing" || t.phase === "dealer") { res.status(409).json({ error: "Mano in corso" }); return; }
  const b = req.body as { minBet?: number; maxBet?: number; step?: number; timeout?: number; betSeconds?: number; soft17Hit?: boolean };
  if (b.minBet != null) t.minBet = Math.max(1, Math.round(b.minBet));
  if (b.maxBet != null) t.maxBet = Math.max(t.minBet, Math.round(b.maxBet));
  if (b.step != null) t.step = Math.max(1, Math.round(b.step));
  if (b.timeout != null) t.timeout = Math.max(10, Math.round(b.timeout));
  if (b.betSeconds != null) t.betSeconds = Math.max(10, Math.round(b.betSeconds));
  if (b.soft17Hit != null) t.soft17Hit = !!b.soft17Hit;
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/bj/suspend", async (req, res): Promise<void> => {
  const found = await findBjTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  found.table.suspended = !!req.body?.suspended;
  await saveBjTable(found.sessionId, found.table);
  res.json({ ok: true, suspended: found.table.suspended });
});

/* ── Telefono: scelta posto, puntata, azioni ── */
router.post("/gestione/casino/bj/join", async (req, res): Promise<void> => {
  const { displayCode, seatNo, playerCode, playerId } = req.body as { displayCode?: string; seatNo?: number; playerCode?: string; playerId?: string };
  const found = await findBjTable((displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  const no = String(Math.round(Number(seatNo)));
  const seat = t.seats[no];
  if (!seat) { res.status(400).json({ error: "Posto inesistente" }); return; }
  const [player] = playerId && isUUID(playerId)
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, (playerCode || "").toUpperCase()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  if (seat.playerId && seat.playerId !== player.id) { res.status(409).json({ error: "Posto occupato" }); return; }
  // un solo posto per tavolo: libera eventuale altro posto dello stesso giocatore
  for (const other of Object.values(t.seats)) if (other.playerId === player.id && other !== seat) { other.playerId = null; other.status = "empty"; other.bet = 0; other.cards = []; }
  seat.playerId = player.id;
  if (seat.status === "empty") seat.status = t.phase === "betting" ? "joined" : "joined";
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true, seatNo: Number(no), seatCode: seat.code, player: { id: player.id, nickname: player.nickname, fishBalance: player.fishBalance } });
});
router.post("/gestione/casino/bj/bet", async (req, res): Promise<void> => {
  const { seatCode, amount, playerCode } = req.body as { seatCode?: string; amount?: number; playerCode?: string };
  const found = await findBjTable((seatCode || "").toUpperCase());
  if (!found || found.seatNo == null) { res.status(404).json({ error: "Posto non trovato" }); return; }
  const t = found.table; const seat = t.seats[String(found.seatNo)]!;
  if (t.phase !== "betting") { res.status(409).json({ error: "Puntate chiuse" }); return; }
  if (!seat.playerId) { res.status(409).json({ error: "Posto libero" }); return; }
  const amt = Math.round(Number(amount));
  if (!(amt > 0) || amt < t.minBet || amt > t.maxBet || amt % t.step !== 0) { res.status(400).json({ error: `Puntata ${t.minBet}–${t.maxBet}, multipli di ${t.step}` }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, seat.playerId));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  // disponibile = saldo + eventuale puntata già riservata su questo posto
  const available = player.fishBalance + seat.bet;
  if (amt > available) { res.status(409).json({ error: "Credito insufficiente" }); return; }
  const delta = seat.bet - amt; // >0 rimborso, <0 addebito
  const nb = player.fishBalance + delta;
  await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta, kind: "blackjack_bet", balanceAfter: nb });
  seat.bet = amt; seat.status = "bet";
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true, balance: nb, reserved: amt });
});
router.post("/gestione/casino/bj/unbet", async (req, res): Promise<void> => {
  const found = await findBjTable((req.body?.seatCode || "").toUpperCase());
  if (!found || found.seatNo == null) { res.status(404).json({ error: "Posto non trovato" }); return; }
  const t = found.table; const seat = t.seats[String(found.seatNo)]!;
  if (t.phase !== "betting" || seat.bet <= 0 || !seat.playerId) { res.status(409).json({ error: "Niente da annullare" }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, seat.playerId));
  if (player) {
    const nb = player.fishBalance + seat.bet;
    await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
    await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta: seat.bet, kind: "blackjack_unbet", balanceAfter: nb });
  }
  seat.bet = 0; seat.status = "joined";
  await saveBjTable(found.sessionId, t);
  res.json({ ok: true });
});
// azione del giocatore nel suo turno: valida posto, fase, turno e proprietà
async function bjActionGuard(req: { body: unknown }): Promise<{ sessionId: string; table: BjTable; seatNo: number; seat: BjSeat } | { error: string; code: number }> {
  const b = (req.body ?? {}) as { seatCode?: string; playerCode?: string };
  const found = await findBjTable((b.seatCode || "").toUpperCase());
  if (!found || found.seatNo == null) return { error: "Posto non trovato", code: 404 };
  const seat = found.table.seats[String(found.seatNo)]!;
  if (found.table.phase !== "playing") return { error: "Non è fase di gioco", code: 409 };
  if (found.table.activeSeat !== found.seatNo) return { error: "Non è il tuo turno", code: 409 };
  if (seat.status !== "playing") return { error: "Turno concluso", code: 409 };
  if (b.playerCode) { const [p] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, b.playerCode.toUpperCase())); if (!p || p.id !== seat.playerId) return { error: "Non autorizzato", code: 403 }; }
  return { sessionId: found.sessionId, table: found.table, seatNo: found.seatNo, seat };
}
router.post("/gestione/casino/bj/hit", async (req, res): Promise<void> => {
  const g = await bjActionGuard(req);
  if ("error" in g) { res.status(g.code).json({ error: g.error }); return; }
  g.seat.cards.push(drawCard(g.table));
  if (handValue(g.seat.cards).total > 21) g.seat.status = "bust";
  await advanceBj(g.sessionId, g.table);
  await saveBjTable(g.sessionId, g.table);
  res.json({ ok: true });
});
router.post("/gestione/casino/bj/stand", async (req, res): Promise<void> => {
  const g = await bjActionGuard(req);
  if ("error" in g) { res.status(g.code).json({ error: g.error }); return; }
  g.seat.status = "stand";
  await advanceBj(g.sessionId, g.table);
  await saveBjTable(g.sessionId, g.table);
  res.json({ ok: true });
});
router.post("/gestione/casino/bj/double", async (req, res): Promise<void> => {
  const g = await bjActionGuard(req);
  if ("error" in g) { res.status(g.code).json({ error: g.error }); return; }
  if (g.seat.cards.length !== 2 || g.seat.doubled) { res.status(409).json({ error: "Raddoppio non consentito" }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, g.seat.playerId!));
  if (!player || player.fishBalance < g.seat.bet) { res.status(409).json({ error: "Credito insufficiente" }); return; }
  const nb = player.fishBalance - g.seat.bet;
  await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({ sessionId: g.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta: -g.seat.bet, kind: "blackjack_double", balanceAfter: nb });
  g.seat.bet *= 2; g.seat.doubled = true;
  g.seat.cards.push(drawCard(g.table));
  g.seat.status = handValue(g.seat.cards).total > 21 ? "bust" : "stand";
  await advanceBj(g.sessionId, g.table);
  await saveBjTable(g.sessionId, g.table);
  res.json({ ok: true, balance: nb });
});

/* ═══ IPPODROMO (corsa dei cavalli) ───────────────────────────────────────────
   6 cavalli EQUIPROBABILI (1/6). Pagamento fisso 6× sul ritorno totale (puntata
   inclusa): puntata 20 → vincitore 120 (profitto 100), perdente 0. L'ordine di
   arrivo completo è estratto dal server alla chiusura puntate con RNG sicuro e
   NON viene inviato ai client prima della fase corsa (puntate già chiuse).
   L'animazione è deterministica (order+seeds) e sincronizzata sulla scadenza
   server, così tutti i client mostrano la stessa corsa e lo stesso arrivo. */

type HorseBet = { playerId: string; horse: number; amount: number; at: string };
type HorseResultRow = { playerId: string; nickname: string; horse: number; bet: number; credit: number; profit: number };
type HorseHist = { race: number; at: string; winner: number; order: number[]; players: number; cancelled?: boolean; results: HorseResultRow[] };
type HorseTable = {
  id: string; type: "horse"; name: string; displayCode: string;
  phase: "waiting" | "betting" | "racing" | "result";
  race: number;
  bets: HorseBet[];           // una puntata per giocatore
  known: string[];            // playerId che hanno giocato a questo tavolo (fascia profili)
  minBet: number; maxBet: number; step: number; betSeconds: number; raceMs: number;
  betEndsAt: string | null; raceEndsAt: string | null;
  current: { order: number[]; seeds: number[]; startedAt: string; durMs: number } | null; // segreto in betting
  suspended: boolean;
  history: HorseHist[];
};
const HORSE_MULT = 6;

async function findHorseTable(code: string): Promise<{ sessionId: string; table: HorseTable } | null> {
  const sessions = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.status, "active"));
  for (const s of sessions) {
    const cfg = (s.config ?? {}) as CasinoConfig;
    for (const t of Object.values(cfg.horseTables ?? {})) if (t.displayCode === code) return { sessionId: s.id, table: t };
  }
  return null;
}
async function saveHorseTable(sessionId: string, table: HorseTable): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const cur = (s?.config ?? {}) as CasinoConfig;
  await db.update(casinoSessionsTable).set({ config: { ...cur, horseTables: { ...(cur.horseTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
}
async function horseState(sessionId: string, table: HorseTable) {
  const ids = Array.from(new Set([...table.known, ...table.bets.map(b => b.playerId)]));
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const [sess] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const avatars = ((sess?.config ?? {}) as CasinoConfig).playerAvatars ?? {};
  const betOf = new Map(table.bets.map(b => [b.playerId, b]));
  const plist = players.map(p => ({ id: p.id, nickname: p.nickname, avatarUrl: avatars[p.id] ?? null, balance: p.fishBalance, bet: betOf.get(p.id) ? { horse: betOf.get(p.id)!.horse, amount: betOf.get(p.id)!.amount } : null }))
    .sort((a, b) => b.balance - a.balance);
  const reveal = table.phase === "racing" || table.phase === "result";
  return {
    table: {
      id: table.id, name: table.name, displayCode: table.displayCode, type: "horse",
      phase: table.phase, race: table.race,
      minBet: table.minBet, maxBet: table.maxBet, step: table.step, betSeconds: table.betSeconds, raceMs: table.raceMs,
      betEndsAt: table.betEndsAt, raceEndsAt: table.raceEndsAt,
      current: reveal ? table.current : null,       // ordine/seed solo da corsa in poi
      betsCount: table.bets.length,
      players: plist,
      suspended: table.suspended,
      history: table.history.slice(0, 20),
    },
    sessionId,
  };
}
async function settleHorse(sessionId: string, table: HorseTable): Promise<void> {
  const order = table.current?.order ?? [];
  const winner = order[0] ?? 0;
  const ids = table.bets.map(b => b.playerId);
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const pMap = new Map(players.map(p => [p.id, p]));
  const results: HorseResultRow[] = [];
  for (const b of table.bets) {
    const p = pMap.get(b.playerId);
    const credit = b.horse === winner ? b.amount * HORSE_MULT : 0;
    if (credit > 0 && p) {
      const nb = p.fishBalance + credit;
      await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, p.id));
      await db.insert(casinoTransactionsTable).values({ sessionId, tableId: null, dealerCode: "", playerId: p.id, delta: credit, kind: "horse_win", balanceAfter: nb });
      p.fishBalance = nb;
    }
    results.push({ playerId: b.playerId, nickname: p?.nickname ?? "—", horse: b.horse, bet: b.amount, credit, profit: credit - b.amount });
  }
  table.history.unshift({ race: table.race, at: new Date().toISOString(), winner, order: [...order], players: table.bets.length, results });
  table.history = table.history.slice(0, 50);
  table.phase = "result"; table.raceEndsAt = null;
}

/* ── Creazione / elenco (regia) ── */
router.post("/gestione/casino/sessions/:id/horse-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const b = req.body as { name?: string; minBet?: number; maxBet?: number; step?: number; betSeconds?: number; raceSeconds?: number };
  const table: HorseTable = {
    id: makeCode(8), type: "horse", name: (b.name || "Tavolo Ippodromo").slice(0, 40), displayCode: makeCode(6),
    phase: "waiting", race: 1, bets: [], known: [],
    minBet: Math.max(1, Math.round(Number(b.minBet) || 10)), maxBet: Math.max(1, Math.round(Number(b.maxBet) || 100)),
    step: Math.max(1, Math.round(Number(b.step) || 10)), betSeconds: Math.max(10, Math.round(Number(b.betSeconds) || 30)),
    // durata FISSA in base ai giri: 3 giri × 12s = 36s (il frontend gira LAPS=3 volte l'anello)
    raceMs: Math.max(8000, Math.round(Number(b.raceSeconds) || 36) * 1000), betEndsAt: null, raceEndsAt: null,
    current: null, suspended: false, history: [],
  };
  await saveHorseTable(id, table);
  res.json(await horseState(id, table));
});
router.get("/gestione/casino/sessions/:id/horse-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const tables = Object.values(((s?.config ?? {}) as CasinoConfig).horseTables ?? {}).map(t => ({
    id: t.id, name: t.name, displayCode: t.displayCode, phase: t.phase, race: t.race, suspended: t.suspended,
    players: t.bets.length, minBet: t.minBet, maxBet: t.maxBet,
  }));
  res.json({ tables });
});

/* ── Stato (monitor/telefono/regia) con progressione pigra ── */
router.get("/gestione/casino/horse/:code", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.params.code || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  if (found.table.phase === "racing" && found.table.raceEndsAt && Date.now() > Date.parse(found.table.raceEndsAt) + 300) {
    await settleHorse(found.sessionId, found.table); await saveHorseTable(found.sessionId, found.table);
  }
  res.json(await horseState(found.sessionId, found.table));
});

/* ── Regia: apri / avvia / impostazioni / sospendi / annulla ── */
router.post("/gestione/casino/horse/open", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  if (t.phase === "result") t.race += 1;
  t.bets = []; t.current = null; t.raceEndsAt = null; t.phase = "betting";
  t.betEndsAt = new Date(Date.now() + t.betSeconds * 1000).toISOString();
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/horse/start", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase !== "betting") { res.status(409).json({ error: "Non in fase puntate" }); return; }
  const order = [1, 2, 3, 4, 5, 6];
  for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); const tmp = order[i]!; order[i] = order[j]!; order[j] = tmp; }
  const seeds = Array.from({ length: 6 }, () => randomInt(1_000_000) / 1_000_000);
  t.current = { order, seeds, startedAt: new Date().toISOString(), durMs: t.raceMs };
  t.phase = "racing"; t.betEndsAt = null; t.raceEndsAt = new Date(Date.now() + t.raceMs).toISOString();
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/horse/settings", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase === "racing") { res.status(409).json({ error: "Corsa in corso" }); return; }
  const b = req.body as { minBet?: number; maxBet?: number; step?: number; betSeconds?: number; raceSeconds?: number };
  if (b.minBet != null) t.minBet = Math.max(1, Math.round(b.minBet));
  if (b.maxBet != null) t.maxBet = Math.max(t.minBet, Math.round(b.maxBet));
  if (b.step != null) t.step = Math.max(1, Math.round(b.step));
  if (b.betSeconds != null) t.betSeconds = Math.max(10, Math.round(b.betSeconds));
  if (b.raceSeconds != null) t.raceMs = Math.max(8000, Math.round(b.raceSeconds) * 1000);
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true });
});
router.post("/gestione/casino/horse/suspend", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  found.table.suspended = !!req.body?.suspended;
  await saveHorseTable(found.sessionId, found.table);
  res.json({ ok: true, suspended: found.table.suspended });
});
router.post("/gestione/casino/horse/cancel", async (req, res): Promise<void> => {
  const { displayCode, motivo } = req.body as { displayCode?: string; motivo?: string };
  if (!motivo || !motivo.trim()) { res.status(400).json({ error: "Motivo obbligatorio" }); return; }
  const found = await findHorseTable((displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase !== "betting" && t.phase !== "racing") { res.status(409).json({ error: "Niente da annullare" }); return; }
  // rimborso atomico delle puntate, una sola volta; nessun pagamento vincite
  const ids = t.bets.map(b => b.playerId);
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const pMap = new Map(players.map(p => [p.id, p]));
  const results: HorseResultRow[] = [];
  for (const b of t.bets) {
    const p = pMap.get(b.playerId);
    if (p) {
      const nb = p.fishBalance + b.amount;
      await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, p.id));
      await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: motivo.slice(0, 40), playerId: p.id, delta: b.amount, kind: "horse_cancel", balanceAfter: nb });
      p.fishBalance = nb;
    }
    results.push({ playerId: b.playerId, nickname: p?.nickname ?? "—", horse: b.horse, bet: b.amount, credit: b.amount, profit: 0 });
  }
  t.history.unshift({ race: t.race, at: new Date().toISOString(), winner: 0, order: [], players: t.bets.length, cancelled: true, results });
  t.history = t.history.slice(0, 50);
  t.bets = []; t.current = null; t.betEndsAt = null; t.raceEndsAt = null; t.phase = "waiting";
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true });
});

/* ── Telefono: puntata / annulla ── */
router.post("/gestione/casino/horse/bet", async (req, res): Promise<void> => {
  const { displayCode, playerCode, playerId, horse, amount } = req.body as { displayCode?: string; playerCode?: string; playerId?: string; horse?: number; amount?: number };
  const found = await findHorseTable((displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  if (t.phase !== "betting") { res.status(409).json({ error: "Puntate chiuse" }); return; }
  const h = Math.round(Number(horse));
  if (!(h >= 1 && h <= 6)) { res.status(400).json({ error: "Cavallo non valido" }); return; }
  const amt = Math.round(Number(amount));
  if (!(amt > 0) || amt < t.minBet || amt > t.maxBet || amt % t.step !== 0) { res.status(400).json({ error: `Puntata ${t.minBet}–${t.maxBet}, multipli di ${t.step}` }); return; }
  const [player] = playerId && isUUID(playerId)
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, (playerCode || "").toUpperCase()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  const existing = t.bets.find(b => b.playerId === player.id);
  const available = player.fishBalance + (existing?.amount ?? 0);
  if (amt > available) { res.status(409).json({ error: "Credito insufficiente" }); return; }
  const delta = (existing?.amount ?? 0) - amt;
  const nb = player.fishBalance + delta;
  await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta, kind: "horse_bet", balanceAfter: nb });
  if (existing) { existing.horse = h; existing.amount = amt; existing.at = new Date().toISOString(); }
  else t.bets.push({ playerId: player.id, horse: h, amount: amt, at: new Date().toISOString() });
  if (!t.known.includes(player.id)) t.known.push(player.id);
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true, balance: nb, reserved: amt, horse: h });
});
router.post("/gestione/casino/horse/unbet", async (req, res): Promise<void> => {
  const { displayCode, playerCode, playerId } = req.body as { displayCode?: string; playerCode?: string; playerId?: string };
  const found = await findHorseTable((displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase !== "betting") { res.status(409).json({ error: "Puntate chiuse" }); return; }
  const [player] = playerId && isUUID(playerId)
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, (playerCode || "").toUpperCase()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  const idx = t.bets.findIndex(b => b.playerId === player.id);
  if (idx < 0) { res.status(409).json({ error: "Nessuna puntata" }); return; }
  const amt = t.bets[idx]!.amount;
  const nb = player.fishBalance + amt;
  await db.update(casinoPlayersTable).set({ fishBalance: nb }).where(eq(casinoPlayersTable.id, player.id));
  await db.insert(casinoTransactionsTable).values({ sessionId: found.sessionId, tableId: null, dealerCode: "", playerId: player.id, delta: amt, kind: "horse_unbet", balanceAfter: nb });
  t.bets.splice(idx, 1);
  await saveHorseTable(found.sessionId, t);
  res.json({ ok: true, balance: nb });
});

export default router;
