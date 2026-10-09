/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Modalità Gestione — CASINO (backend) ────────────────────────────────────
   Fish virtuali. Il dealer inquadra il QR del giocatore e paga/preleva fish.
   Cassa fish + classifiche per tavolo e serata (Master). Ledger completo.
   Rotte pubbliche: l'accesso è governato da masterCode / dealerCode / playerCode.
──────────────────────────────────────────────────────────────────────────── */

import { Router } from "express";
import { and, eq, desc, asc, sql } from "drizzle-orm";
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

export default router;
