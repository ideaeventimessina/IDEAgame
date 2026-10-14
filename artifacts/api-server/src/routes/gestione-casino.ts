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
import {
  PAYOUT, bjOutcome, creditFor, HORSE_MULT,
  rouletteWinMoves, horseWinMoves, alreadySettled, rouletteCanSpin,
  payAll, type FishTx, type FishMove,
} from "./gestione-casino-atomic-lib.js";

const router = Router();
const DEFAULT_START_FISH = 500;

/* ── Atomicità dei soldi ──────────────────────────────────────────────────────
   Tipo della transazione Drizzle (parametro del callback di db.transaction). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* Movimento ATOMICO di fiche dentro una transazione: UPDATE condizionale in SQL
   (`fish_balance = fish_balance + delta`, niente read-modify-write JS) + riga di
   ledger nella STESSA transazione. Per le USCITE (`requireFunds`) l'UPDATE ha un
   WHERE che impedisce lo scoperto in modo atomico: se non tocca righe ritorna null
   e NON scrive ledger. Elimina lost-update e ledger disallineato (report §0a/§0b). */
async function moveFish(tx: Tx, sessionId: string, move: FishMove): Promise<number | null> {
  const guard = move.requireFunds
    ? and(eq(casinoPlayersTable.id, move.playerId), sql`${casinoPlayersTable.fishBalance} + ${move.delta} >= 0`)
    : eq(casinoPlayersTable.id, move.playerId);
  const rows = await tx.update(casinoPlayersTable)
    .set({ fishBalance: sql`${casinoPlayersTable.fishBalance} + ${move.delta}` })
    .where(guard)
    .returning({ balance: casinoPlayersTable.fishBalance });
  const balanceAfter = rows[0]?.balance;
  if (balanceAfter == null) return null;
  await tx.insert(casinoTransactionsTable).values({
    sessionId, tableId: move.tableId ?? null, dealerCode: move.dealerCode ?? "",
    playerId: move.playerId, delta: move.delta, kind: move.kind, balanceAfter,
  });
  return balanceAfter;
}
/* Adapter FishTx (per i pagamenti in blocco della lib) legato a una tx + serata. */
const fishTxOf = (tx: Tx, sessionId: string): FishTx => ({ pay: (m) => moveFish(tx, sessionId, m) });

/* Esegue una mutazione della serata in modo ATOMICO e SERIALIZZATO:
   db.transaction → SELECT … FOR UPDATE sulla riga della serata (lock) → rilettura
   del config FRESCO → callback (muove saldi/ledger via `tx`, muta `cfg`) →
   riscrittura del config nella STESSA transazione (solo se `save`). Il lock di riga
   serializza le operazioni concorrenti sulla stessa serata: il read-modify-write
   dell'intero jsonb non può più sovrascrivere tavoli diversi (fix report §5/§0c). */
async function mutateSession<T>(
  sessionId: string,
  fn: (tx: Tx, cfg: CasinoConfig) => Promise<{ save: boolean; result: T }>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ config: casinoSessionsTable.config })
      .from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)).for("update");
    const cfg = (row?.config ? JSON.parse(JSON.stringify(row.config)) : {}) as CasinoConfig;
    const { save, result } = await fn(tx, cfg);
    if (save) await tx.update(casinoSessionsTable).set({ config: cfg }).where(eq(casinoSessionsTable.id, sessionId));
    return result;
  });
}

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
  siciliaTables?: Record<string, SiciliaTable>;
};
const cfgOf = (session: { config?: unknown }): CasinoConfig => (session?.config ?? {}) as CasinoConfig;
async function patchConfig(id: string, patch: Partial<CasinoConfig>): Promise<void> {
  // Merge sotto lock di riga (rilettura fresca): non sovrascrive chiavi scritte in
  // parallelo da un altro tavolo/dealer della stessa serata (report §5).
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id)).for("update");
    const cur = (s?.config ?? {}) as CasinoConfig;
    await tx.update(casinoSessionsTable).set({ config: { ...cur, ...patch } }).where(eq(casinoSessionsTable.id, id));
  });
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
  // ATOMICO: UPDATE saldo (con guard anti-scoperto) + INSERT ledger nella stessa tx.
  const amtDelta = Math.round(amt);
  const newBalance = await db.transaction((tx) => moveFish(tx, table.sessionId, {
    playerId: player.id, delta: amtDelta, kind: String(kind ?? (amt > 0 ? "pay" : "take")),
    tableId: table.id, dealerCode: table.dealerCode, requireFunds: true,
  }));
  if (newBalance == null) { res.status(409).json({ error: "Fish insufficienti", balance: player.fishBalance }); return; }
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
// RED / PAYOUT / betWins / creditFor / HORSE_MULT: quote e esito INVARIATI, spostati
// in gestione-casino-atomic-lib (testabili). Qui restano solo le rotte.
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
  // Scrittura mirata del SINGOLO tavolo sotto lock di riga (rilettura fresca dentro
  // la transazione): due operazioni concorrenti su tavoli diversi della stessa
  // serata non si sovrascrivono più (report §5).
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)).for("update");
    const cur = (s?.config ?? {}) as CasinoConfig;
    await tx.update(casinoSessionsTable).set({ config: { ...cur, gameTables: { ...(cur.gameTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
  });
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
  const seatNo = found.seatNo, tableId = found.table.id;
  // ATOMICO + SERIALIZZATO: escrow (scala le fiche) e aggiunta della puntata sul
  // tavolo nella STESSA transazione → niente fiche scalate senza puntata (report §0c).
  const out = await mutateSession<{ status: number; body: Record<string, unknown>; table?: GameTable }>(found.sessionId, async (tx, cfg) => {
    const table = cfg.gameTables?.[tableId];
    if (!table) return { save: false, result: { status: 404, body: { error: "Postazione non trovata" } } };
    if (table.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Puntate chiuse" } } };
    const seat = table.seats[seatNo];
    if (!seat?.playerId) return { save: false, result: { status: 409, body: { error: "Siediti prima alla postazione" } } };
    const bal = await moveFish(tx, found.sessionId, { playerId: seat.playerId, delta: -amount, kind: "roulette_bet", tableId: null, requireFunds: true });
    if (bal == null) return { save: false, result: { status: 409, body: { error: "Fiche insufficienti" } } };
    table.bets.push({ id: makeCode(8), seatNo: Number(seatNo), playerId: seat.playerId, kind, numbers, amount });
    return { save: true, result: { status: 200, body: { ok: true, balance: bal }, table } };
  });
  if (out.status !== 200) { res.status(out.status).json(out.body); return; }
  if (out.table) await broadcastTable(found.sessionId, out.table);
  await broadcast(found.sessionId);
  res.json(out.body);
});

// ── Annulla l'ultima puntata della sedia (rimborso) ─────────────────────────────
router.post("/gestione/casino/table/undo", async (req, res): Promise<void> => {
  const seatCode = String(req.body?.seatCode ?? "").toUpperCase().trim();
  const found = await findGameTable(seatCode);
  if (!found || !found.seatNo) { res.status(404).json({ error: "Postazione non trovata" }); return; }
  const seatNo = Number(found.seatNo), tableId = found.table.id;
  // ATOMICO: rimozione della puntata dal tavolo + rimborso (saldo+ledger) insieme.
  const out = await mutateSession<{ status: number; body: Record<string, unknown>; table?: GameTable }>(found.sessionId, async (tx, cfg) => {
    const table = cfg.gameTables?.[tableId];
    if (!table) return { save: false, result: { status: 404, body: { error: "Postazione non trovata" } } };
    if (table.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Puntate chiuse" } } };
    const idx = [...table.bets].reverse().findIndex(b => b.seatNo === seatNo);
    if (idx === -1) return { save: false, result: { status: 404, body: { error: "Nessuna puntata da annullare" } } };
    const realIdx = table.bets.length - 1 - idx;
    const [bet] = table.bets.splice(realIdx, 1);
    await moveFish(tx, found.sessionId, { playerId: bet!.playerId, delta: bet!.amount, kind: "roulette_undo", tableId: null });
    return { save: true, result: { status: 200, body: { ok: true }, table } };
  });
  if (out.status !== 200) { res.status(out.status).json(out.body); return; }
  if (out.table) await broadcastTable(found.sessionId, out.table);
  await broadcast(found.sessionId);
  res.json(out.body);
});

// ── Gira la ruota: estrae il numero, paga i vincitori ───────────────────────────
router.post("/gestione/casino/table/spin", async (req, res): Promise<void> => {
  const code = String(req.body?.displayCode ?? req.body?.seatCode ?? "").toUpperCase().trim();
  const found = await findGameTable(code);
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const tableId = found.table.id;
  // IDEMPOTENTE + ATOMICO: estrazione, flip di fase e pagamento vincite in UNA sola
  // transazione sotto lock. Un secondo /spin sullo stesso giro vede phase≠"betting"
  // e ritorna il numero già estratto SENZA ripagare (report §1).
  const out = await mutateSession<{ status: number; body: Record<string, unknown>; table?: GameTable }>(found.sessionId, async (tx, cfg) => {
    const table = cfg.gameTables?.[tableId];
    if (!table) return { save: false, result: { status: 404, body: { error: "Tavolo non trovato" } } };
    if (!rouletteCanSpin(table.phase)) {
      return { save: false, result: { status: 200, body: { ok: true, number: table.result?.number ?? null, alreadySpun: true }, table } };
    }
    const r = randomInt(37); // 0–36, zero singolo europeo — RNG crittografico (node:crypto)
    table.phase = "result";
    table.result = { number: r, at: new Date().toISOString() };
    table.history = [r, ...table.history].slice(0, 20);
    // Paga i vincitori (lo stake era già scalato all'ingresso della puntata).
    await payAll(fishTxOf(tx, found.sessionId), rouletteWinMoves(table.bets, r));
    return { save: true, result: { status: 200, body: { ok: true, number: r }, table } };
  });
  if (out.status !== 200) { res.status(out.status).json(out.body); return; }
  if (out.table) await broadcastTable(found.sessionId, out.table);
  await broadcast(found.sessionId);
  res.json(out.body);
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
  settledHand?: number;   // round già saldato (idempotenza: non ripagare lo stesso)
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
// creditFor: accredito invariato, ora in gestione-casino-atomic-lib.

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
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)).for("update");
    const cur = (s?.config ?? {}) as CasinoConfig;
    await tx.update(casinoSessionsTable).set({ config: { ...cur, bjTables: { ...(cur.bjTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
  });
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
// ATOMICO: gli accrediti usano `tx` (saldo+ledger insieme). IDEMPOTENTE: se la mano
// corrente è già stata saldata (settledHand === round) non ripaga (report §2).
async function finishBjHand(tx: Tx, sessionId: string, table: BjTable): Promise<void> {
  if (alreadySettled(table.settledHand, table.round)) return;
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
  const players = ids.length ? await tx.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const pMap = new Map(players.map(p => [p.id, p]));
  const results: BjResultRow[] = [];
  for (const [no, s] of Object.entries(table.seats)) {
    if (s.bet <= 0 || !s.playerId) continue;
    const hv = handValue(s.cards);
    const outcome = bjOutcome(s.status, hv.total, dhv.total, dealerBJ);
    const credit = creditFor(outcome, s.bet);
    s.outcome = outcome; s.profit = credit - s.bet; s.status = "done";
    const p = pMap.get(s.playerId);
    if (credit > 0 && p) {
      // ATOMICO: UPDATE saldo + INSERT ledger nella stessa transazione.
      const nb = await moveFish(tx, sessionId, { playerId: p.id, delta: credit, kind: outcome === "push" ? "blackjack_push" : "blackjack_win", tableId: null });
      if (nb != null) p.fishBalance = nb;
    }
    results.push({ seatNo: Number(no), nickname: p?.nickname ?? "—", bet: s.bet, total: hv.total, outcome, profit: s.profit });
  }
  table.history.unshift({ hand: table.round, at: new Date().toISOString(), dealerTotal: dhv.total, dealerCards: [...table.dealer], results });
  table.history = table.history.slice(0, 50);
  table.settledHand = table.round;   // marca la mano come saldata (idempotenza)
  table.activeSeat = null; table.turnEndsAt = null; table.phase = "result";
}
// Dopo un'azione: passa al prossimo giocatore o chiude la mano. Ritorna se ha chiuso.
async function advanceBj(tx: Tx, sessionId: string, table: BjTable): Promise<void> {
  const nxt = nextBjActive(table);
  if (nxt != null) { table.activeSeat = nxt; table.turnEndsAt = new Date(Date.now() + table.timeout * 1000).toISOString(); table.phase = "playing"; return; }
  await finishBjHand(tx, sessionId, table);
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
  const code = (req.params.code || "").toUpperCase();
  const found = await findBjTable(code);
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  // timeout turno gestito lato server: se scaduto, forza STAI e avanza — ATOMICO
  // (eventuale chiusura mano con pagamenti nella stessa tx; idempotente via settledHand).
  if (found.table.phase === "playing" && found.table.turnEndsAt && Date.now() > Date.parse(found.table.turnEndsAt) + 1500) {
    const tableId = found.table.id;
    await mutateSession<null>(found.sessionId, async (tx, cfg) => {
      const t = cfg.bjTables?.[tableId];
      if (!t || !(t.phase === "playing" && t.turnEndsAt && Date.now() > Date.parse(t.turnEndsAt) + 1500)) return { save: false, result: null };
      const no = t.activeSeat;
      if (no == null) return { save: false, result: null };
      const s = t.seats[String(no)];
      if (!s || s.status !== "playing") return { save: false, result: null };
      s.status = "stand"; await advanceBj(tx, found.sessionId, t);
      return { save: true, result: null };
    });
  }
  const fresh = await findBjTable(code) ?? found;
  const st = await bjState(fresh.sessionId, fresh.table);
  res.json({ ...st, seatNo: fresh.seatNo ?? null });
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
  const loc = await findBjTable((req.body?.displayCode || "").toUpperCase());
  if (!loc) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const tableId = loc.table.id;
  // Distribuzione + eventuale chiusura (dealer BJ) ATOMICHE: se peek chiude la mano,
  // i pagamenti vivono nella STESSA transazione del salvataggio del tavolo (report §2).
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.bjTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Tavolo non trovato" } } };
    if (t.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Non in fase puntate" } } };
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
    if (dealerPeek) { await finishBjHand(tx, loc.sessionId, t); }
    else { t.phase = "playing"; await advanceBj(tx, loc.sessionId, t); }
    return { save: true, result: { status: 200, body: { ok: true } } };
  });
  res.status(out.status).json(out.body);
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
  void playerCode;
  const loc = await findBjTable((seatCode || "").toUpperCase());
  if (!loc || loc.seatNo == null) { res.status(404).json({ error: "Posto non trovato" }); return; }
  const seatNo = loc.seatNo, tableId = loc.table.id;
  const amt = Math.round(Number(amount));
  // ATOMICO: addebito/rimborso differenziale (saldo+ledger) + riserva sul posto insieme.
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.bjTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Posto non trovato" } } };
    const seat = t.seats[String(seatNo)];
    if (!seat) return { save: false, result: { status: 404, body: { error: "Posto non trovato" } } };
    if (t.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Puntate chiuse" } } };
    if (!seat.playerId) return { save: false, result: { status: 409, body: { error: "Posto libero" } } };
    if (!(amt > 0) || amt < t.minBet || amt > t.maxBet || amt % t.step !== 0) return { save: false, result: { status: 400, body: { error: `Puntata ${t.minBet}–${t.maxBet}, multipli di ${t.step}` } } };
    const delta = seat.bet - amt; // >0 rimborso, <0 addebito differenziale
    const bal = await moveFish(tx, loc.sessionId, { playerId: seat.playerId, delta, kind: "blackjack_bet", tableId: null, requireFunds: true });
    if (bal == null) return { save: false, result: { status: 409, body: { error: "Credito insufficiente" } } };
    seat.bet = amt; seat.status = "bet";
    return { save: true, result: { status: 200, body: { ok: true, balance: bal, reserved: amt } } };
  });
  res.status(out.status).json(out.body);
});
router.post("/gestione/casino/bj/unbet", async (req, res): Promise<void> => {
  const loc = await findBjTable((req.body?.seatCode || "").toUpperCase());
  if (!loc || loc.seatNo == null) { res.status(404).json({ error: "Posto non trovato" }); return; }
  const seatNo = loc.seatNo, tableId = loc.table.id;
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.bjTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Posto non trovato" } } };
    const seat = t.seats[String(seatNo)];
    if (!seat || t.phase !== "betting" || seat.bet <= 0 || !seat.playerId) return { save: false, result: { status: 409, body: { error: "Niente da annullare" } } };
    await moveFish(tx, loc.sessionId, { playerId: seat.playerId, delta: seat.bet, kind: "blackjack_unbet", tableId: null });
    seat.bet = 0; seat.status = "joined";
    return { save: true, result: { status: 200, body: { ok: true } } };
  });
  res.status(out.status).json(out.body);
});
// Azione del giocatore (hit/stand/double) ATOMICA: rivalida posto/fase/turno/proprietà
// sullo stato FRESCO sotto lock, applica l'azione e avanza (eventuale chiusura mano +
// pagamenti nella STESSA transazione, idempotente via settledHand).
async function bjAction(
  body: unknown,
  act: (tx: Tx, sessionId: string, table: BjTable, seat: BjSeat) => Promise<{ save: boolean; status: number; body: Record<string, unknown> }>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const b = (body ?? {}) as { seatCode?: string; playerCode?: string };
  const loc = await findBjTable((b.seatCode || "").toUpperCase());
  if (!loc || loc.seatNo == null) return { status: 404, body: { error: "Posto non trovato" } };
  const seatNo = loc.seatNo, tableId = loc.table.id;
  return mutateSession(loc.sessionId, async (tx, cfg) => {
    const table = cfg.bjTables?.[tableId];
    const seat = table?.seats[String(seatNo)];
    if (!table || !seat) return { save: false, result: { status: 404, body: { error: "Posto non trovato" } } };
    if (table.phase !== "playing") return { save: false, result: { status: 409, body: { error: "Non è fase di gioco" } } };
    if (table.activeSeat !== seatNo) return { save: false, result: { status: 409, body: { error: "Non è il tuo turno" } } };
    if (seat.status !== "playing") return { save: false, result: { status: 409, body: { error: "Turno concluso" } } };
    if (b.playerCode) {
      const [p] = await tx.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, b.playerCode.toUpperCase()));
      if (!p || p.id !== seat.playerId) return { save: false, result: { status: 403, body: { error: "Non autorizzato" } } };
    }
    const r = await act(tx, loc.sessionId, table, seat);
    return { save: r.save, result: { status: r.status, body: r.body } };
  });
}
router.post("/gestione/casino/bj/hit", async (req, res): Promise<void> => {
  const out = await bjAction(req.body, async (tx, sid, table, seat) => {
    seat.cards.push(drawCard(table));
    if (handValue(seat.cards).total > 21) seat.status = "bust";
    await advanceBj(tx, sid, table);
    return { save: true, status: 200, body: { ok: true } };
  });
  res.status(out.status).json(out.body);
});
router.post("/gestione/casino/bj/stand", async (req, res): Promise<void> => {
  const out = await bjAction(req.body, async (tx, sid, table, seat) => {
    seat.status = "stand";
    await advanceBj(tx, sid, table);
    return { save: true, status: 200, body: { ok: true } };
  });
  res.status(out.status).json(out.body);
});
router.post("/gestione/casino/bj/double", async (req, res): Promise<void> => {
  const out = await bjAction(req.body, async (tx, sid, table, seat) => {
    if (seat.cards.length !== 2 || seat.doubled) return { save: false, status: 409, body: { error: "Raddoppio non consentito" } };
    const bal = await moveFish(tx, sid, { playerId: seat.playerId!, delta: -seat.bet, kind: "blackjack_double", tableId: null, requireFunds: true });
    if (bal == null) return { save: false, status: 409, body: { error: "Credito insufficiente" } };
    seat.bet *= 2; seat.doubled = true;
    seat.cards.push(drawCard(table));
    seat.status = handValue(seat.cards).total > 21 ? "bust" : "stand";
    await advanceBj(tx, sid, table);
    return { save: true, status: 200, body: { ok: true, balance: bal } };
  });
  res.status(out.status).json(out.body);
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
type HorseHist = { race: number; at: string; winner: number; order: number[]; players: number; cancelled?: boolean; results: HorseResultRow[]; names?: string[] };
type HorseTable = {
  id: string; type: "horse"; name: string; displayCode: string;
  phase: "waiting" | "betting" | "racing" | "result";
  race: number;
  bets: HorseBet[];           // una puntata per giocatore
  known: string[];            // playerId che hanno giocato a questo tavolo (fascia profili)
  minBet: number; maxBet: number; step: number; betSeconds: number; raceMs: number;
  betEndsAt: string | null; raceEndsAt: string | null;
  current: { order: number[]; seeds: number[]; startedAt: string; durMs: number } | null; // segreto in betting
  names: string[];            // 6 nomi (indice 0 = cavallo 1 … 5 = cavallo 6), estratti a ogni corsa
  suspended: boolean;
  settledRace?: number;       // corsa già saldata (idempotenza: non ripagare la stessa)
  history: HorseHist[];
};
// HORSE_MULT (6×): quota invariata, ora in gestione-casino-atomic-lib.

/* Nomi REALI di grandi cavalli della storia ippica italiana (galoppo Dormello-Olgiata/Tesio
   + campioni moderni + grandi trottatori). A ogni corsa se ne estraggono 6 a caso → i nomi
   ruotano e gli ospiti puntano sul NOME. */
const HORSE_NAMES: string[] = [
  // Galoppo — Tesio / Dormello-Olgiata e campioni italiani
  "Ribot", "Nearco", "Donatello", "Tenerani", "Bellini", "Romanella", "Nogara", "Apelle",
  "Cavaliere d'Arpino", "Niccolò dell'Arca", "Botticelli", "Toulouse Lautrec", "Ortello",
  "Crapom", "Molvedo", "Gladiolo", "Marguerite Vernaut", "Tofanella", "Daumier", "Hogarth",
  "Tissot", "Bella Minna", "Andreina", "Ribocco", "Ribero", "Prince Royal", "Tony Bin",
  "Falbrav", "Scopas", "Jacopa del Sellaio", "Dossa Dossi", "Duccia di Buoninsegna",
  "Barbara Burrini", "Appiani", "Sommacampagna",
  // Trotto — grandi trottatori
  "Varenne", "Tornese", "Crevalcore", "Delfo", "Bellino II", "Birbone", "Une de Mai",
  "Mack Grace Sm", "Wayne Eden", "Ideal du Gazeau",
];
/** Estrae 6 nomi DISTINTI a caso dal pool (RNG sicuro). */
function pickHorseNames(): string[] {
  const pool = [...HORSE_NAMES];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); const t = pool[i]!; pool[i] = pool[j]!; pool[j] = t; }
  return pool.slice(0, 6);
}

async function findHorseTable(code: string): Promise<{ sessionId: string; table: HorseTable } | null> {
  const sessions = await db.select().from(casinoSessionsTable).where(eq(casinoSessionsTable.status, "active"));
  for (const s of sessions) {
    const cfg = (s.config ?? {}) as CasinoConfig;
    for (const t of Object.values(cfg.horseTables ?? {})) if (t.displayCode === code) return { sessionId: s.id, table: t };
  }
  return null;
}
async function saveHorseTable(sessionId: string, table: HorseTable): Promise<void> {
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)).for("update");
    const cur = (s?.config ?? {}) as CasinoConfig;
    await tx.update(casinoSessionsTable).set({ config: { ...cur, horseTables: { ...(cur.horseTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
  });
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
      names: table.names ?? [],                      // 6 nomi della corsa corrente (si punta sul nome)
      betsCount: table.bets.length,
      players: plist,
      suspended: table.suspended,
      history: table.history.slice(0, 20),
    },
    sessionId,
  };
}
// ATOMICO (accrediti via `tx`) + IDEMPOTENTE: se la corsa è già stata saldata
// (settledRace === race) non ripaga (report §3).
async function settleHorse(tx: Tx, sessionId: string, table: HorseTable): Promise<void> {
  if (alreadySettled(table.settledRace, table.race)) return;
  const order = table.current?.order ?? [];
  const winner = order[0] ?? 0;
  const ids = table.bets.map(b => b.playerId);
  const players = ids.length ? await tx.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const pMap = new Map(players.map(p => [p.id, p]));
  const results: HorseResultRow[] = [];
  await payAll(fishTxOf(tx, sessionId), horseWinMoves(table.bets, winner));
  for (const b of table.bets) {
    const p = pMap.get(b.playerId);
    const credit = b.horse === winner ? b.amount * HORSE_MULT : 0;
    results.push({ playerId: b.playerId, nickname: p?.nickname ?? "—", horse: b.horse, bet: b.amount, credit, profit: credit - b.amount });
  }
  table.history.unshift({ race: table.race, at: new Date().toISOString(), winner, order: [...order], players: table.bets.length, results, names: [...(table.names ?? [])] });
  table.history = table.history.slice(0, 50);
  table.settledRace = table.race;   // marca la corsa come saldata (idempotenza)
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
    current: null, names: pickHorseNames(), suspended: false, history: [],
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
  const code = (req.params.code || "").toUpperCase();
  const found = await findHorseTable(code);
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  // Saldo pigro a fine corsa: ATOMICO (accrediti nella stessa tx) + idempotente.
  if (found.table.phase === "racing" && found.table.raceEndsAt && Date.now() > Date.parse(found.table.raceEndsAt) + 300) {
    const tableId = found.table.id;
    await mutateSession<null>(found.sessionId, async (tx, cfg) => {
      const t = cfg.horseTables?.[tableId];
      if (!t || !(t.phase === "racing" && t.raceEndsAt && Date.now() > Date.parse(t.raceEndsAt) + 300)) return { save: false, result: null };
      await settleHorse(tx, found.sessionId, t);
      return { save: true, result: null };
    });
  }
  const fresh = await findHorseTable(code) ?? found;
  res.json(await horseState(fresh.sessionId, fresh.table));
});

/* ── Regia: apri / avvia / impostazioni / sospendi / annulla ── */
router.post("/gestione/casino/horse/open", async (req, res): Promise<void> => {
  const found = await findHorseTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  if (t.phase === "result") t.race += 1;
  t.bets = []; t.current = null; t.raceEndsAt = null; t.phase = "betting";
  t.names = pickHorseNames();                 // nomi nuovi a ogni corsa → rotazione
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
  const loc = await findHorseTable((displayCode || "").toUpperCase());
  if (!loc) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const tableId = loc.table.id;
  // Rimborso ATOMICO (saldo+ledger insieme) e UNA SOLA VOLTA: sotto lock, azzera le
  // puntate nella STESSA transazione dei rimborsi → un secondo /cancel vede phase
  // "waiting" e non rimborsa di nuovo (report §3).
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.horseTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Tavolo non trovato" } } };
    if (t.phase !== "betting" && t.phase !== "racing") return { save: false, result: { status: 409, body: { error: "Niente da annullare" } } };
    const players = t.bets.length ? await tx.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, t.bets.map(b => b.playerId))) : [];
    const pMap = new Map(players.map(p => [p.id, p]));
    const results: HorseResultRow[] = [];
    for (const b of t.bets) {
      await moveFish(tx, loc.sessionId, { playerId: b.playerId, delta: b.amount, kind: "horse_cancel", tableId: null, dealerCode: motivo.slice(0, 40) });
      const p = pMap.get(b.playerId);
      results.push({ playerId: b.playerId, nickname: p?.nickname ?? "—", horse: b.horse, bet: b.amount, credit: b.amount, profit: 0 });
    }
    t.history.unshift({ race: t.race, at: new Date().toISOString(), winner: 0, order: [], players: t.bets.length, cancelled: true, results, names: [...(t.names ?? [])] });
    t.history = t.history.slice(0, 50);
    t.bets = []; t.current = null; t.betEndsAt = null; t.raceEndsAt = null; t.phase = "waiting";
    return { save: true, result: { status: 200, body: { ok: true } } };
  });
  res.status(out.status).json(out.body);
});

/* ── Telefono: puntata / annulla ── */
router.post("/gestione/casino/horse/bet", async (req, res): Promise<void> => {
  const { displayCode, playerCode, playerId, horse, amount } = req.body as { displayCode?: string; playerCode?: string; playerId?: string; horse?: number; amount?: number };
  const loc = await findHorseTable((displayCode || "").toUpperCase());
  if (!loc) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const tableId = loc.table.id;
  const h = Math.round(Number(horse));
  const amt = Math.round(Number(amount));
  const [player] = playerId && isUUID(playerId)
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, (playerCode || "").toUpperCase()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  // ATOMICO: addebito/rimborso differenziale (saldo+ledger) + puntata sul tavolo insieme.
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.horseTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Tavolo non trovato" } } };
    if (t.suspended) return { save: false, result: { status: 409, body: { error: "Tavolo sospeso" } } };
    if (t.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Puntate chiuse" } } };
    if (!(h >= 1 && h <= 6)) return { save: false, result: { status: 400, body: { error: "Cavallo non valido" } } };
    if (!(amt > 0) || amt < t.minBet || amt > t.maxBet || amt % t.step !== 0) return { save: false, result: { status: 400, body: { error: `Puntata ${t.minBet}–${t.maxBet}, multipli di ${t.step}` } } };
    const existing = t.bets.find(b => b.playerId === player.id);
    const delta = (existing?.amount ?? 0) - amt; // >0 rimborso, <0 addebito differenziale
    const bal = await moveFish(tx, loc.sessionId, { playerId: player.id, delta, kind: "horse_bet", tableId: null, requireFunds: true });
    if (bal == null) return { save: false, result: { status: 409, body: { error: "Credito insufficiente" } } };
    if (existing) { existing.horse = h; existing.amount = amt; existing.at = new Date().toISOString(); }
    else t.bets.push({ playerId: player.id, horse: h, amount: amt, at: new Date().toISOString() });
    if (!t.known.includes(player.id)) t.known.push(player.id);
    return { save: true, result: { status: 200, body: { ok: true, balance: bal, reserved: amt, horse: h } } };
  });
  res.status(out.status).json(out.body);
});
router.post("/gestione/casino/horse/unbet", async (req, res): Promise<void> => {
  const { displayCode, playerCode, playerId } = req.body as { displayCode?: string; playerCode?: string; playerId?: string };
  const loc = await findHorseTable((displayCode || "").toUpperCase());
  if (!loc) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const tableId = loc.table.id;
  const [player] = playerId && isUUID(playerId)
    ? await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId))
    : await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, (playerCode || "").toUpperCase()));
  if (!player) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  const out = await mutateSession<{ status: number; body: Record<string, unknown> }>(loc.sessionId, async (tx, cfg) => {
    const t = cfg.horseTables?.[tableId];
    if (!t) return { save: false, result: { status: 404, body: { error: "Tavolo non trovato" } } };
    if (t.phase !== "betting") return { save: false, result: { status: 409, body: { error: "Puntate chiuse" } } };
    const idx = t.bets.findIndex(b => b.playerId === player.id);
    if (idx < 0) return { save: false, result: { status: 409, body: { error: "Nessuna puntata" } } };
    const amt = t.bets[idx]!.amount;
    const bal = await moveFish(tx, loc.sessionId, { playerId: player.id, delta: amt, kind: "horse_unbet", tableId: null });
    t.bets.splice(idx, 1);
    return { save: true, result: { status: 200, body: { ok: true, balance: bal } } };
  });
  res.status(out.status).json(out.body);
});

/* ════════════════════════════════════════════════════════════════════════════
   CORSA SICILIANA — 4 cavalli, uno per seme (coppe/denari/spade/bastoni). Si pesca
   una carta dal mazzo siciliano (40 carte, 10 per seme): avanza di UNA casella SOLO
   il cavallo di quel seme (il valore non conta). Primo al traguardo vince. L'esito
   deriva dalle CARTE estratte, non da un ordine pre-deciso. Nessuna quota/saldo: i
   giocatori SCELGONO un cavallo dal telefono (tifo), senza escrow sulle fiche.
   ════════════════════════════════════════════════════════════════════════════ */
type Suit = "coppe" | "denari" | "spade" | "bastoni";
const SUITS: Suit[] = ["coppe", "denari", "spade", "bastoni"];
type SiciliaCard = { suit: Suit; value: number };
type SiciliaBet = { playerId: string; suit: Suit; at: string };
type SiciliaHist = { race: number; at: string; winner: Suit | null; cards: number; players: number; pickedWinner: number };
type SiciliaTable = {
  id: string; type: "sicilia"; name: string; displayCode: string;
  phase: "betting" | "racing" | "result";
  race: number; trackLen: number;
  deck: SiciliaCard[]; drawn: number;
  positions: Record<Suit, number>;
  last: SiciliaCard | null; winner: Suit | null;
  lastToken: string | null;            // anti doppio-click: stesso token ⇒ stessa pescata
  bets: SiciliaBet[]; known: string[];
  suspended: boolean; history: SiciliaHist[];
};
function buildSiciliaDeck(): SiciliaCard[] {
  const deck: SiciliaCard[] = [];
  for (const suit of SUITS) for (let v = 1; v <= 10; v++) deck.push({ suit, value: v });
  for (let i = deck.length - 1; i > 0; i--) { const j = randomInt(i + 1); const t = deck[i]!; deck[i] = deck[j]!; deck[j] = t; }
  return deck;
}
const zeroPos = (): Record<Suit, number> => ({ coppe: 0, denari: 0, spade: 0, bastoni: 0 });
async function findSiciliaTable(code: string): Promise<{ sessionId: string; table: SiciliaTable } | null> {
  const up = (code || "").toUpperCase();
  const rows = await db.select({ id: casinoSessionsTable.id, config: casinoSessionsTable.config }).from(casinoSessionsTable);
  for (const r of rows) { const cfg = (r.config ?? {}) as CasinoConfig; for (const t of Object.values(cfg.siciliaTables ?? {})) if (t.displayCode === up) return { sessionId: r.id, table: t }; }
  return null;
}
async function saveSiciliaTable(sessionId: string, table: SiciliaTable): Promise<void> {
  await db.transaction(async (tx) => {
    const [s] = await tx.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId)).for("update");
    const cur = (s?.config ?? {}) as CasinoConfig;
    await tx.update(casinoSessionsTable).set({ config: { ...cur, siciliaTables: { ...(cur.siciliaTables ?? {}), [table.id]: table } } }).where(eq(casinoSessionsTable.id, sessionId));
  });
}
async function siciliaState(sessionId: string, table: SiciliaTable) {
  const ids = Array.from(new Set([...table.known, ...table.bets.map(b => b.playerId)]));
  const players = ids.length ? await db.select().from(casinoPlayersTable).where(inArray(casinoPlayersTable.id, ids)) : [];
  const [sess] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, sessionId));
  const avatars = ((sess?.config ?? {}) as CasinoConfig).playerAvatars ?? {};
  const betOf = new Map(table.bets.map(b => [b.playerId, b.suit]));
  const plist = players.map(p => ({ id: p.id, nickname: p.nickname, avatarUrl: avatars[p.id] ?? null, balance: p.fishBalance, suit: betOf.get(p.id) ?? null })).sort((a, b) => b.balance - a.balance);
  return {
    table: {
      id: table.id, name: table.name, displayCode: table.displayCode, type: "sicilia",
      phase: table.phase, race: table.race, trackLen: table.trackLen,
      positions: table.positions, last: table.last, winner: table.winner,
      drawn: table.drawn, deckLeft: table.deck.length - table.drawn,
      players: plist, suspended: table.suspended, history: table.history.slice(0, 20),
    },
    sessionId,
  };
}
const clampLen = (n: unknown): number => Math.max(3, Math.min(10, Math.round(Number(n) || 9)));

router.post("/gestione/casino/sessions/:id/sicilia-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const b = req.body as { name?: string; trackLen?: number };
  const table: SiciliaTable = {
    id: makeCode(8), type: "sicilia", name: (b.name || "Corsa Siciliana").slice(0, 40), displayCode: makeCode(6),
    phase: "betting", race: 1, trackLen: clampLen(b.trackLen), deck: buildSiciliaDeck(), drawn: 0,
    positions: zeroPos(), last: null, winner: null, lastToken: null, bets: [], known: [], suspended: false, history: [],
  };
  await saveSiciliaTable(id, table);
  res.json(await siciliaState(id, table));
});
router.get("/gestione/casino/sessions/:id/sicilia-tables", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const tables = Object.values(((s?.config ?? {}) as CasinoConfig).siciliaTables ?? {}).map(t => ({ id: t.id, name: t.name, displayCode: t.displayCode, phase: t.phase, race: t.race, trackLen: t.trackLen, suspended: t.suspended, players: t.known.length }));
  res.json({ tables });
});
router.get("/gestione/casino/sicilia/:code", async (req, res): Promise<void> => {
  const found = await findSiciliaTable(req.params.code || "");
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  res.json(await siciliaState(found.sessionId, found.table));
});
router.post("/gestione/casino/sicilia/open", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.suspended) { res.status(409).json({ error: "Tavolo sospeso" }); return; }
  if (t.phase === "result") t.race += 1;
  t.phase = "betting"; t.deck = buildSiciliaDeck(); t.drawn = 0; t.positions = zeroPos();
  t.last = null; t.winner = null; t.lastToken = null; t.bets = [];
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
router.post("/gestione/casino/sicilia/start", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase !== "betting") { res.status(409).json({ error: "Non in fase puntate" }); return; }
  t.phase = "racing";
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
/* Pescata ATOMICA: una carta, avanza il cavallo del seme, eventuale vincitore. Il
   `token` client rende la pescata idempotente: un retry/doppio-click con lo stesso
   token NON pesca una seconda carta (ritorna lo stato corrente). */
router.post("/gestione/casino/sicilia/draw", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  const token = String(req.body?.token ?? "");
  if (token && t.lastToken === token) { res.json(await siciliaState(found.sessionId, t)); return; }  // idempotente
  if (t.phase !== "racing") { res.status(409).json({ error: "La corsa non è in svolgimento" }); return; }
  if (t.winner) { res.json(await siciliaState(found.sessionId, t)); return; }
  if (t.drawn >= t.deck.length) { res.status(409).json({ error: "Mazzo esaurito" }); return; }
  const card = t.deck[t.drawn]!; t.drawn += 1; t.last = card; t.lastToken = token || `d${t.drawn}`;
  t.positions[card.suit] = Math.min(t.trackLen, t.positions[card.suit] + 1);
  if (t.positions[card.suit] >= t.trackLen) {
    t.winner = card.suit; t.phase = "result";
    const picked = t.bets.filter(b => b.suit === card.suit).length;
    t.history.unshift({ race: t.race, at: new Date().toISOString(), winner: card.suit, cards: t.drawn, players: t.bets.length, pickedWinner: picked });
    t.history = t.history.slice(0, 50);
  }
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
router.post("/gestione/casino/sicilia/settings", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase === "racing") { res.status(409).json({ error: "Corsa in corso" }); return; }
  if (req.body?.name) t.name = String(req.body.name).slice(0, 40);
  if (req.body?.trackLen != null) { t.trackLen = clampLen(req.body.trackLen); t.positions = zeroPos(); }
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
router.post("/gestione/casino/sicilia/suspend", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table; t.suspended = !t.suspended;
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
router.post("/gestione/casino/sicilia/bet", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  if (t.phase === "result") { res.status(409).json({ error: "Corsa conclusa" }); return; }
  const suit = String(req.body?.suit ?? "") as Suit;
  if (!SUITS.includes(suit)) { res.status(400).json({ error: "Seme non valido" }); return; }
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, String(req.body?.playerCode ?? "")));
  if (!player || player.sessionId !== found.sessionId) { res.status(404).json({ error: "Giocatore non trovato" }); return; }
  t.bets = t.bets.filter(b => b.playerId !== player.id);
  t.bets.push({ playerId: player.id, suit, at: new Date().toISOString() });
  if (!t.known.includes(player.id)) t.known.push(player.id);
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});
router.post("/gestione/casino/sicilia/unbet", async (req, res): Promise<void> => {
  const found = await findSiciliaTable((req.body?.displayCode || "").toUpperCase());
  if (!found) { res.status(404).json({ error: "Tavolo non trovato" }); return; }
  const t = found.table;
  const [player] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, String(req.body?.playerCode ?? "")));
  if (player) t.bets = t.bets.filter(b => b.playerId !== player.id);
  await saveSiciliaTable(found.sessionId, t);
  res.json(await siciliaState(found.sessionId, t));
});

export default router;
