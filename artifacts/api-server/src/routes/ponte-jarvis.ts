/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON JARVIS — ROULETTE VELOCE (20/11/2026).
 *
 * Jarvis (l'assistente di Andrea) fa un giro di roulette a voce. Chi chiama è
 * un PROGRAMMA: chiave condivisa nell'header X-Ponte-Key (Secret
 * JARVIS_PONTE_KEY), confronto a tempo costante, rotta CHIUSA (503) se il
 * Secret manca.
 *
 * NIENTE MOTORE NUOVO. Una partita è una SERATA del casinò vera e propria
 * (casino_sessions) con un giocatore "Jarvis" (casino_players, saldo e ledger
 * in casino_transactions) e un tavolo roulette nel config jsonb — proprio come
 * quelli dell'80". Le fiche si muovono con `moveFish` (UPDATE atomico + ledger),
 * il giro gira dentro `mutateSession` (lock di riga della serata), le vincite si
 * pagano con `rouletteWinMoves`/`payAll` e le quote sono il PAYOUT del casinò.
 * Il numero esce da crypto.randomInt(37), come nel /spin del casinò.
 *
 * Il tavolo NON ha postazioni: nessuno può sedersi e puntare con le fiche di
 * Jarvis dal link del maxi-schermo. Il link (tavoloUrl) serve solo a guardare.
 */

import { Router, type Request, type Response } from "express";
import { randomInt } from "node:crypto";
import { and, eq, desc, sql, isNull, lt } from "drizzle-orm";
import { db, casinoSessionsTable, casinoPlayersTable, ponteIdempotenzaTable } from "@workspace/db";
import { conIdempotenza, leggiIdempotenza, type ArchivioIdempotenza } from "../lib/idempotenza";
import {
  makeCode,
  moveFish,
  fishTxOf,
  mutateSession,
  broadcastTable,
  type CasinoConfig,
  type GameTable,
  type Tx,
} from "./gestione-casino.js";
import { payAll, rouletteWinMoves, rouletteCredit, rouletteColor } from "./gestione-casino-atomic-lib.js";
import {
  CATALOGO_JARVIS,
  SALDO_INIZIALE,
  ULTIMI_NUMERI,
  coloreItaliano,
  controllaChiave,
  numeroPari,
  traduciPuntate,
  statoJarvis,
} from "./ponte-jarvis-lib.js";

const router = Router();

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const DURATA_PARTITA_MS = 30 * 24 * 60 * 60 * 1000;

function baseUrl(): string {
  return (process.env["IDEAGAME_PUBLIC_URL"] ?? "https://ideagame.it").trim().replace(/\/+$/, "");
}
const urlTavolo = (displayCode: string) => `${baseUrl()}/gestione/casino?table=${displayCode}`;

/** La chiave si legge a ogni richiesta: ruotarla non chiede un riavvio. */
function chiaveOk(req: Request, res: Response): boolean {
  const esito = controllaChiave(req.headers["x-ponte-key"], process.env["JARVIS_PONTE_KEY"]);
  if (!esito.ok) {
    res.status(esito.status).json(esito.body);
    return false;
  }
  return true;
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "23505";
}

/** Apre una partita nuova: serata + giocatore Jarvis (1000 fiche con riga di ledger) + tavolo. */
async function nuovaPartita(): Promise<string> {
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    try {
      return await db.transaction(async (tx: Tx) => {
        const tableId = makeCode(8);
        const table: GameTable = {
          id: tableId, type: "roulette", name: "Roulette di Jarvis", displayCode: makeCode(6),
          phase: "betting", round: 0, seats: {}, bets: [], result: null, history: [], dealerCode: null,
        };
        const [sessione] = await tx.insert(casinoSessionsTable).values({
          name: "Jarvis · Roulette veloce",
          masterCode: makeCode(),
          joinCode: makeCode(),
          expiresAt: new Date(Date.now() + DURATA_PARTITA_MS),
          config: { startFish: SALDO_INIZIALE, gameTables: { [tableId]: table } } satisfies CasinoConfig,
        }).returning({ id: casinoSessionsTable.id });
        const [giocatore] = await tx.insert(casinoPlayersTable).values({
          sessionId: sessione!.id, nickname: "Jarvis", playerCode: makeCode(7), fishBalance: 0,
        }).returning({ id: casinoPlayersTable.id });
        // Le fiche iniziali entrano dal ledger, come ogni altro movimento.
        await moveFish(tx, sessione!.id, { playerId: giocatore!.id, delta: SALDO_INIZIALE, kind: "buyin" });
        const cfg: CasinoConfig = {
          startFish: SALDO_INIZIALE,
          gameTables: { [tableId]: table },
          jarvis: { tableId, playerId: giocatore!.id, giri: 0, ultimi: [], creata: new Date().toISOString() },
        };
        await tx.update(casinoSessionsTable).set({ config: cfg }).where(eq(casinoSessionsTable.id, sessione!.id));
        return sessione!.id;
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // collisione di un codice: si riprova con codici nuovi
    }
  }
  throw new Error("Impossibile aprire la partita (codici in collisione).");
}

async function saldoDi(tx: Tx | typeof db, playerId: string): Promise<number> {
  const [p] = await tx.select({ b: casinoPlayersTable.fishBalance }).from(casinoPlayersTable).where(eq(casinoPlayersTable.id, playerId));
  return p?.b ?? 0;
}

/* ── Idempotenza (contratto Jarvis v1) ─────────────────────────────────────
   Il corpo può avere `idempotenza` (stringa): la stessa richiesta ripetuta
   restituisce l'esito del primo giro, senza girare di nuovo la ruota né muovere
   fiche. L'esito si salva nella STESSA transazione del giro (lib/idempotenza.ts). */
const PREFISSO_IDEMPOTENZA = "jarvis:roulette_giro:";

const archivioIdempotenza: ArchivioIdempotenza = {
  async prenota(chiave) {
    const r = await db.insert(ponteIdempotenzaTable).values({ chiave }).onConflictDoNothing()
      .returning({ chiave: ponteIdempotenzaTable.chiave });
    return r.length > 0;
  },
  async leggi(chiave) {
    const [r] = await db.select().from(ponteIdempotenzaTable).where(eq(ponteIdempotenzaTable.chiave, chiave));
    return r ? { status: r.status, esito: r.esito, creatoIl: r.creatoIl } : null;
  },
  async libera(chiave, soloVuotaPrimaDi) {
    await db.delete(ponteIdempotenzaTable).where(soloVuotaPrimaDi
      ? and(eq(ponteIdempotenzaTable.chiave, chiave), isNull(ponteIdempotenzaTable.status), lt(ponteIdempotenzaTable.creatoIl, soloVuotaPrimaDi))
      : eq(ponteIdempotenzaTable.chiave, chiave));
  },
};

type EsitoGiro = { status: number; body: Record<string, unknown>; table?: GameTable };

/** Il giro vero. Con `chiave` salva l'esito sulla riga di idempotenza nella stessa transazione. */
async function eseguiGiro(corpo: Record<string, unknown>, chiave: string | null): Promise<EsitoGiro & { registrato: boolean }> {
  const tradotte = traduciPuntate(corpo["puntate"]);
  if (!tradotte.ok) return { status: 400, body: { error: tradotte.error }, registrato: false };
  const puntate = tradotte.puntate;

  const richiesta = typeof corpo["partita"] === "string" ? corpo["partita"].trim() : "";
  if (richiesta && !isUUID(richiesta)) return { status: 404, body: { error: "Partita non trovata." }, registrato: false };

  // Partita nuova con posta oltre le fiche iniziali: si rifiuta PRIMA di crearla
  // (prima nasceva comunque una partita orfana da 1000 fiche).
  const postaTotale = puntate.reduce((t, p) => t + p.fiche, 0);
  if (!richiesta && postaTotale > SALDO_INIZIALE) {
    return { status: 409, body: { error: "Fiche insufficienti per queste puntate.", saldo: SALDO_INIZIALE, posta: postaTotale }, registrato: false };
  }

  const partita = richiesta || (await nuovaPartita());

  const out = await mutateSession<EsitoGiro>(partita, async (tx, cfg) => {
    const registra = async (e: EsitoGiro): Promise<EsitoGiro> => {
      if (chiave) {
        await tx.update(ponteIdempotenzaTable).set({ status: e.status, esito: e.body })
          .where(eq(ponteIdempotenzaTable.chiave, chiave));
      }
      return e;
    };
    const j = cfg.jarvis;
    const table = j ? cfg.gameTables?.[j.tableId] : undefined;
    if (!j || !table) return { save: false, result: await registra({ status: 404, body: { error: "Partita non trovata." } }) };

    // La posta esce TUTTA insieme e solo se il saldo basta (UPDATE condizionale):
    // se non basta non si tocca niente e il giro non parte.
    const posta = puntate.reduce((s, p) => s + p.fiche, 0);
    if (posta > 0) {
      const dopo = await moveFish(tx, partita, { playerId: j.playerId, delta: -posta, kind: "roulette_bet", requireFunds: true });
      if (dopo == null) {
        return { save: false, result: await registra({ status: 409, body: { error: "Fiche insufficienti per queste puntate.", saldo: await saldoDi(tx, j.playerId), posta } }) };
      }
    }

    const numero = randomInt(37); // 0–36, zero singolo europeo — RNG crittografico, come il /spin del casinò
    table.bets = puntate.map((p) => ({ id: makeCode(8), seatNo: 0, playerId: j.playerId, kind: p.kind, numbers: p.numbers, amount: p.fiche }));
    table.phase = "result";
    table.round += 1;
    table.result = { number: numero, at: new Date().toISOString() };
    table.history = [numero, ...table.history].slice(0, 20);
    // Pagamento con lo stesso motore del tavolo (stake già scalato, accredito = amount*(PAYOUT+1)).
    await payAll(fishTxOf(tx, partita), rouletteWinMoves(table.bets, numero));

    j.giri += 1;
    j.ultimi = [numero, ...j.ultimi].slice(0, ULTIMI_NUMERI);

    const esiti = puntate.map((p) => {
      const vincita = rouletteCredit(p.kind, p.numbers, p.fiche, numero);
      return { tipo: p.tipo, valore: p.valore, fiche: p.fiche, vinto: vincita > 0, vincita };
    });
    const esito = await registra({
      status: 200,
      body: {
        partita,
        numero,
        colore: coloreItaliano(rouletteColor(numero)),
        pari: numeroPari(numero),
        esiti,
        saldo: await saldoDi(tx, j.playerId),
        giri: j.giri,
        tavoloUrl: urlTavolo(table.displayCode),
      },
    });
    return { save: true, result: { ...esito, table } };
  });
  return { ...out, registrato: chiave != null };
}

// ── POST /api/ponte/jarvis/roulette/giro ────────────────────────────────────
router.post("/ponte/jarvis/roulette/giro", async (req, res): Promise<void> => {
  if (!chiaveOk(req, res)) return;
  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const idem = leggiIdempotenza(corpo["idempotenza"]);
  if (!idem.ok) { res.status(400).json({ error: idem.error }); return; }
  try {
    if (!idem.chiave) {
      const out = await eseguiGiro(corpo, null);
      // Il maxi-schermo, se qualcuno lo sta guardando, si aggiorna. Non è essenziale.
      if (out.status === 200 && out.table) await broadcastTable(String(out.body["partita"]), out.table).catch(() => undefined);
      res.status(out.status).json(out.body);
      return;
    }
    const chiave = PREFISSO_IDEMPOTENZA + idem.chiave;
    let tavolo: { partita: string; table: GameTable } | null = null;
    const out = await conIdempotenza(archivioIdempotenza, chiave, async () => {
      const g = await eseguiGiro(corpo, chiave);
      if (g.status === 200 && g.table) tavolo = { partita: String(g.body["partita"]), table: g.table };
      return { status: g.status, body: g.body, registrato: g.registrato };
    });
    if (tavolo) { const t = tavolo as { partita: string; table: GameTable }; await broadcastTable(t.partita, t.table).catch(() => undefined); }
    if (out.ripetuta) res.setHeader("Idempotent-Replayed", "true");
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[ponte jarvis roulette giro]", err);
    res.status(500).json({ error: "Errore nel giro di roulette." });
  }
});

// ── GET /api/ponte/jarvis/roulette/:partita ─────────────────────────────────
router.get("/ponte/jarvis/roulette/:partita", async (req, res): Promise<void> => {
  if (!chiaveOk(req, res)) return;
  const partita = String(req.params["partita"] ?? "");
  if (!isUUID(partita)) { res.status(404).json({ error: "Partita non trovata." }); return; }
  try {
    const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, partita));
    const cfg = (s?.config ?? {}) as CasinoConfig;
    const j = cfg.jarvis;
    if (!j) { res.status(404).json({ error: "Partita non trovata." }); return; }
    const [p] = await db.select({ b: casinoPlayersTable.fishBalance }).from(casinoPlayersTable)
      .where(and(eq(casinoPlayersTable.id, j.playerId), eq(casinoPlayersTable.sessionId, partita)));
    const table = cfg.gameTables?.[j.tableId];
    res.json({
      partita,
      saldo: p?.b ?? 0,
      giri: j.giri,
      ultimiNumeri: j.ultimi,
      ultimi: j.ultimi,
      tavoloUrl: table ? urlTavolo(table.displayCode) : null,
    });
  } catch (err) {
    console.error("[ponte jarvis roulette stato]", err);
    res.status(500).json({ error: "Errore nel leggere la partita." });
  }
});

// ── GET /api/ponte/jarvis/stato (contratto ponti Jarvis v1) ─────────────────
router.get("/ponte/jarvis/stato", async (req, res): Promise<void> => {
  if (!chiaveOk(req, res)) return;
  try {
    const partite = await db.select({ id: casinoSessionsTable.id, config: casinoSessionsTable.config })
      .from(casinoSessionsTable)
      .where(sql`${casinoSessionsTable.config} ? 'jarvis'`)
      .orderBy(desc(casinoSessionsTable.createdAt))
      .limit(500);
    const giriTotali = partite.reduce((t, p) => t + (((p.config ?? {}) as CasinoConfig).jarvis?.giri ?? 0), 0);
    const ultima = partite[0];
    const j = ultima ? ((ultima.config ?? {}) as CasinoConfig).jarvis : undefined;
    const saldo = j ? await saldoDi(db, j.playerId) : null;
    res.json(statoJarvis({
      partite: partite.length,
      giriTotali,
      ultimaPartita: ultima?.id ?? null,
      saldoUltimaPartita: saldo,
      ultimiNumeri: j?.ultimi ?? [],
    }));
  } catch (err) {
    console.error("[ponte jarvis stato]", err);
    res.status(500).json({ error: "Errore nel leggere lo stato." });
  }
});

// ── GET /api/ponte/jarvis/skill ─────────────────────────────────────────────
router.get("/ponte/jarvis/skill", (req, res): void => {
  if (!chiaveOk(req, res)) return;
  res.json(CATALOGO_JARVIS);
});

export default router;
