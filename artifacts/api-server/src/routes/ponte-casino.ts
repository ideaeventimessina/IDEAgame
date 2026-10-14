/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON "IDEAphoto Suite" — CASINÒ (13/10/2026).
 *
 * Il contratto sta in IDEAphoto-Suite/PONTE_CASINO.md ed è scritto PRIMA del
 * codice: qui non si inventa, si implementa. In questo ponte IDEAgame è il
 * CLIENT — CHIAMA la Suite, non la riceve. Per questo la chiave condivisa
 * (CASINO_PONTE_KEY) vive SOLO sul server e viaggia nell'header `x-ponte-key`
 * verso la Suite; il browser non la vede mai. L'unico confronto a tempo costante
 * servirebbe se ricevessimo la chiave da fuori: non è il caso di nessuna rotta
 * qui sotto (l'helper c'è comunque, in ponte-casino-lib, pronto e testato).
 *
 * Le quattro integrazioni del contratto:
 *  1. LEGARE LA REGIA a una festa Suite  → /suite/feste, /suite/collega, /suite/slega
 *  2. ACCOGLIERE L'OSPITE (riscatto S2S) → /guest  (+ /guest/join quando il nome manca)
 *  3. FICHE NOSTRE (base una volta sola)  → dentro /guest e /guest/join
 *  4. STATO DEL LEGAME (per QR unico + tasto SUITE) → /suite/link/:sessionId
 *
 * Stato migration-free: tutto nel config jsonb della serata, sotto la chiave
 * `suite` (vedi SuiteState). La mappa playerId→giocatore + flag base vive lì.
 */

import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { randomBytes, randomInt } from "node:crypto";
import { db, casinoSessionsTable, casinoPlayersTable } from "@workspace/db";
import {
  baseGiaConcessa,
  erroreDaSuite,
  fichesInizialiSane,
  giocatoreLegato,
  nicknameDaSuite,
  type SuitePlayerMap,
} from "./ponte-casino-lib";

const router: IRouter = Router();

const CHIAVE = (process.env["CASINO_PONTE_KEY"] ?? "").trim();
const SUITE = (process.env["SUITE_BASE_URL"] ?? "").trim().replace(/\/+$/, "");

/* ── Stato del ponte dentro config.suite (jsonb, niente migrazioni) ───────────── */
type SuiteState = {
  eventoId?: string;
  giocoUrl?: string | null;   // != null ⇒ serata LEGATA ⇒ QR del casinò nascosto
  feedUrl?: string | null;    // per il tasto SUITE
  eventToken?: string | null;
  nomeFesta?: string | null;
  collegatoAt?: string;
  players?: SuitePlayerMap;   // playerId Suite → { casinoPlayerId, baseGranted }
  pending?: Record<string, { playerId: string; fichesIniziali: number; feedUrl: string | null; avatarUrl: string | null; at: string }>;
};
type CasinoConfigLite = { suite?: SuiteState; playerAvatars?: Record<string, string> } & Record<string, unknown>;

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = (n = 7) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

function err(res: import("express").Response, status: number, errore: string, dettaglio: string): void {
  res.status(status).json({ errore, dettaglio });
}
function configNonPronta(res: import("express").Response): boolean {
  if (!CHIAVE || !SUITE) {
    err(res, 503, "config", "Ponte non configurato: servono i Secret CASINO_PONTE_KEY e SUITE_BASE_URL.");
    return true;
  }
  return false;
}

/* Legge la serata e il suo config.suite. */
async function loadSession(id: string): Promise<{ config: CasinoConfigLite } | null> {
  if (!isUUID(id)) return null;
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  if (!s) return null;
  return { config: (s.config ?? {}) as CasinoConfigLite };
}
/* Scrive solo la sotto-chiave `suite`, preservando il resto del config. */
async function patchSuite(id: string, patch: Partial<SuiteState>): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const cur = (s?.config ?? {}) as CasinoConfigLite;
  const nextSuite: SuiteState = { ...(cur.suite ?? {}), ...patch };
  await db.update(casinoSessionsTable).set({ config: { ...cur, suite: nextSuite } }).where(eq(casinoSessionsTable.id, id));
}
async function patchAvatar(id: string, playerId: string, url: string): Promise<void> {
  const [s] = await db.select({ config: casinoSessionsTable.config }).from(casinoSessionsTable).where(eq(casinoSessionsTable.id, id));
  const cur = (s?.config ?? {}) as CasinoConfigLite;
  await db.update(casinoSessionsTable).set({ config: { ...cur, playerAvatars: { ...(cur.playerAvatars ?? {}), [playerId]: url } } }).where(eq(casinoSessionsTable.id, id));
}

/* Chiamata alla Suite con la chiave nell'header. Timeout corto: la regia non deve
 * restare appesa se la Suite è lenta. */
async function chiamaSuite(path: string, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(`${SUITE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ponte-key": CHIAVE },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}
async function chiamaSuiteGet(path: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(`${SUITE}${path}`, { headers: { "x-ponte-key": CHIAVE }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* Crea un giocatore del casinò con un playerCode unico. fishBalance = base Suite. */
async function creaGiocatore(sessionId: string, nickname: string, fish: number): Promise<typeof casinoPlayersTable.$inferSelect> {
  let playerCode = makeCode(7);
  for (let i = 0; i < 6; i++) {
    const [p] = await db.select({ id: casinoPlayersTable.id }).from(casinoPlayersTable).where(eq(casinoPlayersTable.playerCode, playerCode));
    if (!p) break;
    playerCode = makeCode(7);
  }
  const [player] = await db.insert(casinoPlayersTable).values({ sessionId, nickname, playerCode, fishBalance: fish }).returning();
  return player!;
}

/* ════════════════ 1. LEGARE LA REGIA A UNA FESTA SUITE ════════════════════════ */

/** Elenco delle feste Suite col casinò acceso (proxy sicuro: la chiave sta qui). */
router.get("/ponte/casino/suite/feste", async (_req, res): Promise<void> => {
  if (configNonPronta(res)) return;
  try {
    const r = await chiamaSuiteGet("/api/ponte/casino/feste");
    if (!r.ok) { const m = erroreDaSuite(r.status); err(res, m.status, m.errore, "La Suite ha rifiutato l'elenco feste."); return; }
    const data = await r.json();
    res.json(data);
  } catch {
    err(res, 502, "suite_irraggiungibile", "Non riesco a contattare la Suite.");
  }
});

/** Lega la serata casinò (casinoEventoId = sessionId) a una festa Suite. */
router.post("/ponte/casino/suite/collega", async (req, res): Promise<void> => {
  if (configNonPronta(res)) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = String(b["sessionId"] ?? "").trim();
  const eventoId = String(b["eventoId"] ?? "").trim();
  const giocoUrl = String(b["giocoUrl"] ?? "").trim();
  const feedUrl = b["feedUrl"] != null ? String(b["feedUrl"]) : null;
  const nomeFesta = b["nome"] != null ? String(b["nome"]) : null;
  if (!isUUID(sessionId)) { err(res, 400, "input", "sessionId non valido."); return; }
  if (!eventoId || !giocoUrl) { err(res, 400, "input", "Servono eventoId e giocoUrl."); return; }
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "Serata casinò inesistente."); return; }
  try {
    const r = await chiamaSuite("/api/ponte/casino/collega", { eventoId, casinoEventoId: sessionId, giocoUrl });
    if (!r.ok) { const m = erroreDaSuite(r.status); err(res, m.status, m.errore, "La Suite ha rifiutato il collegamento."); return; }
    await patchSuite(sessionId, { eventoId, giocoUrl, feedUrl, nomeFesta, collegatoAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch {
    err(res, 502, "suite_irraggiungibile", "Non riesco a contattare la Suite.");
  }
});

/** Slega: alla Suite `giocoUrl: null` (sparisce il tasto CASINÒ dal feed) e da noi
 *  azzera il giocoUrl (ricompare il QR del casinò). La mappa giocatori resta: se
 *  ricolleghi, gli ospiti che tornano NON riprendono la base. */
router.post("/ponte/casino/suite/slega", async (req, res): Promise<void> => {
  if (configNonPronta(res)) return;
  const sessionId = String((req.body as Record<string, unknown>)?.["sessionId"] ?? "").trim();
  if (!isUUID(sessionId)) { err(res, 400, "input", "sessionId non valido."); return; }
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "Serata casinò inesistente."); return; }
  const eventoId = sess.config.suite?.eventoId;
  if (!eventoId) { res.json({ ok: true }); return; } // non era legata
  try {
    const r = await chiamaSuite("/api/ponte/casino/collega", { eventoId, casinoEventoId: sessionId, giocoUrl: null });
    if (!r.ok && r.status !== 404) { const m = erroreDaSuite(r.status); err(res, m.status, m.errore, "La Suite ha rifiutato lo scollegamento."); return; }
    await patchSuite(sessionId, { giocoUrl: null });
    res.json({ ok: true });
  } catch {
    err(res, 502, "suite_irraggiungibile", "Non riesco a contattare la Suite.");
  }
});

/** Stato del legame (pubblico): serve al frontend per il QR unico e il tasto SUITE. */
router.get("/ponte/casino/suite/link/:sessionId", async (req, res): Promise<void> => {
  const sessionId = String(req.params["sessionId"]);
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "Serata casinò inesistente."); return; }
  const su = sess.config.suite;
  res.json({
    linked: !!(su && su.giocoUrl),
    feedUrl: su?.feedUrl ?? null,
    eventoId: su?.eventoId ?? null,
    nomeFesta: su?.nomeFesta ?? null,
    configurato: !!(CHIAVE && SUITE),
  });
});

/* ════════════════ 2+3. ACCOGLIERE L'OSPITE + FICHE NOSTRE ═════════════════════ */

/** Riscatto SERVER-TO-SERVER del gettone. Il browser NON legge mai il gettone: lo
 *  manda qui, noi lo riscattiamo dalla Suite, lui lo toglie dall'URL (replaceState).
 *  La base delle fiche si concede UNA volta per playerId. */
router.post("/ponte/casino/guest", async (req, res): Promise<void> => {
  if (configNonPronta(res)) return;
  const gettone = String((req.body as Record<string, unknown>)?.["gettone"] ?? "").trim();
  if (!gettone) { err(res, 400, "input", "Gettone mancante."); return; }

  type RiscattoDTO = {
    playerId?: string; nome?: string | null; avatarUrl?: string | null;
    eventoId?: string; casinoEventoId?: string; eventToken?: string | null;
    feedUrl?: string | null; fichesIniziali?: number;
  };
  let data: RiscattoDTO;
  try {
    const r = await chiamaSuite("/api/ponte/casino/riscatta", { gettone });
    if (!r.ok) {
      const m = erroreDaSuite(r.status);
      let feedUrl: string | null = null;
      try { feedUrl = ((await r.json()) as { feedUrl?: string | null })?.feedUrl ?? null; } catch { /* corpo non JSON */ }
      res.status(m.status).json({ errore: m.errore, dettaglio: "Riscatto rifiutato dalla Suite.", feedUrl });
      return;
    }
    data = (await r.json()) as RiscattoDTO;
  } catch {
    err(res, 502, "suite_irraggiungibile", "Non riesco a contattare la Suite.");
    return;
  }

  const playerId = String(data.playerId ?? "").trim();
  const sessionId = String(data.casinoEventoId ?? "").trim();
  if (!playerId || !isUUID(sessionId)) { err(res, 502, "suite_ko", "La Suite non ha restituito playerId/casinoEventoId validi."); return; }
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "La serata casinò di questo gettone non esiste più."); return; }

  // Tieni aggiornato lo stato per il tasto SUITE (feedUrl/eventToken della festa).
  await patchSuite(sessionId, { feedUrl: data.feedUrl ?? sess.config.suite?.feedUrl ?? null, eventToken: data.eventToken ?? null, eventoId: data.eventoId ?? sess.config.suite?.eventoId });

  const suite = (await loadSession(sessionId))!.config.suite ?? {};
  const players: SuitePlayerMap = suite.players ?? {};

  // Ospite che TORNA: stesso playerId = stesso account, saldo intatto (base già data).
  const giaId = giocatoreLegato(players, playerId);
  if (giaId) {
    const [p] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, giaId));
    if (p) { res.json({ ready: true, playerCode: p.playerCode, feedUrl: suite.feedUrl ?? data.feedUrl ?? null }); return; }
    // mappa orfana (giocatore sparito): ricade sul ramo "nuovo".
  }

  const fish = fichesInizialiSane(data.fichesIniziali, 500);
  const nickname = nicknameDaSuite(data.nome);
  const avatarUrl = data.avatarUrl ? String(data.avatarUrl) : null;

  // PRIVACY: nome presente ⇒ entra dritto. Nome null ⇒ pending, glielo chiediamo noi.
  if (!nickname) {
    const token = randomBytes(18).toString("base64url");
    const now = Date.now();
    const pending = Object.fromEntries(
      Object.entries(suite.pending ?? {}).filter(([, v]) => now - Date.parse(v.at) < 10 * 60 * 1000),
    );
    pending[token] = { playerId, fichesIniziali: fish, feedUrl: suite.feedUrl ?? data.feedUrl ?? null, avatarUrl, at: new Date().toISOString() };
    await patchSuite(sessionId, { pending });
    res.json({ ready: false, needName: true, pendingToken: token, sessionId, feedUrl: suite.feedUrl ?? data.feedUrl ?? null });
    return;
  }

  // Nome presente: crea il giocatore, concedi la base UNA volta, lega il playerId.
  const player = await creaGiocatore(sessionId, nickname, fish);
  if (avatarUrl) await patchAvatar(sessionId, player.id, avatarUrl);
  await patchSuite(sessionId, { players: { ...players, [playerId]: { casinoPlayerId: player.id, baseGranted: true } } });
  res.json({ ready: true, playerCode: player.playerCode, feedUrl: suite.feedUrl ?? data.feedUrl ?? null });
});

/** L'ospite senza nome ha scritto il suo nome/selfie: qui creiamo il giocatore,
 *  concediamo la base UNA volta e leghiamo il playerId. */
router.post("/ponte/casino/guest/join", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = String(b["sessionId"] ?? "").trim();
  const pendingToken = String(b["pendingToken"] ?? "").trim();
  const nickname = String(b["nickname"] ?? "").trim().slice(0, 30);
  const photo = typeof b["photo"] === "string" ? String(b["photo"]) : "";
  if (!isUUID(sessionId) || !pendingToken) { err(res, 400, "input", "Dati d'ingresso mancanti."); return; }
  if (!nickname) { err(res, 400, "input", "Il nome è obbligatorio."); return; }
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "Serata casinò inesistente."); return; }
  const suite = sess.config.suite ?? {};
  const pend = suite.pending?.[pendingToken];
  if (!pend) { err(res, 410, "scaduto", "Ingresso scaduto: riparti dal QR della Suite."); return; }

  const players: SuitePlayerMap = suite.players ?? {};
  // Doppio invio del form: se il playerId è già legato, riusa quel giocatore.
  const giaId = giocatoreLegato(players, pend.playerId);
  if (giaId) {
    const [p] = await db.select().from(casinoPlayersTable).where(eq(casinoPlayersTable.id, giaId));
    const { [pendingToken]: _drop, ...restPending } = suite.pending ?? {};
    await patchSuite(sessionId, { pending: restPending });
    if (p) { res.json({ ready: true, playerCode: p.playerCode }); return; }
  }

  const fish = baseGiaConcessa(players, pend.playerId) ? 0 : fichesInizialiSane(pend.fichesIniziali, 500);
  const player = await creaGiocatore(sessionId, nickname, fish);
  const avatar = photo.startsWith("data:image/") && photo.length <= 400_000 ? photo : (pend.avatarUrl ?? "");
  if (avatar) await patchAvatar(sessionId, player.id, avatar);
  const { [pendingToken]: _used, ...restPending } = suite.pending ?? {};
  await patchSuite(sessionId, {
    players: { ...players, [pend.playerId]: { casinoPlayerId: player.id, baseGranted: true } },
    pending: restPending,
  });
  res.json({ ready: true, playerCode: player.playerCode });
});

/* ════════════════ 5. CLASSIFICA FISH PER IL WALL CONDIVISO ════════════════════
 * Quando Suite e Casinò sono entrambi attivi, il maxi-schermo condiviso mostra le
 * foto della serata (lato Suite) + uno split con la CLASSIFICA GENERALE FISH (qui).
 * Read-only e pubblica come la TV del casinò (solo nickname/fiche/avatar, nessun
 * dato sensibile). La Suite può: (a) incorporare la nostra vista `?wall=<sessionId>`
 * in un iframe nello split, oppure (b) pollare questo JSON e disegnarla da sé.
 * Chiave per sessionId (UUID = casinoEventoId del contratto).
 * CORS: il BROWSER del proiettore Suite la legge cross-origin e disegna lo split
 * (contratto concordato: niente iframe, niente push). Dati pubblici come la TV. */
router.options("/ponte/casino/classifica/:sessionId", (_req, res): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  res.status(204).end();
});
router.get("/ponte/casino/classifica/:sessionId", async (req, res): Promise<void> => {
  res.setHeader("Access-Control-Allow-Origin", "*");       // lo split del muro Suite legge da browser
  res.setHeader("Cache-Control", "no-store");
  const sessionId = String(req.params["sessionId"]);
  const sess = await loadSession(sessionId);
  if (!sess) { err(res, 404, "non_trovato", "Serata casinò inesistente."); return; }
  const avatars = (sess.config.playerAvatars ?? {}) as Record<string, string>;
  const players = await db.select({
    id: casinoPlayersTable.id, nickname: casinoPlayersTable.nickname, fishBalance: casinoPlayersTable.fishBalance,
  }).from(casinoPlayersTable).where(eq(casinoPlayersTable.sessionId, sessionId)).orderBy(desc(casinoPlayersTable.fishBalance));
  const cassaTotale = players.reduce((s, p) => s + p.fishBalance, 0);
  const classifica = players.slice(0, 20).map((p, i) => ({
    rank: i + 1, nickname: p.nickname, fish: p.fishBalance, avatarUrl: avatars[p.id] ?? null,
  }));
  res.json({
    nomeFesta: sess.config.suite?.nomeFesta ?? null,
    linked: !!(sess.config.suite && sess.config.suite.giocoUrl),
    giocatori: players.length,
    cassaTotale,
    classifica,
    at: new Date().toISOString(),
  });
});

export default router;
