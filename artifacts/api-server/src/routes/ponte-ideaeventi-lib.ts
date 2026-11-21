/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON IL GESTIONALE IDEAEVENTI — 7/9/2026 (logica separata dal DB il 21/11/2026,
 * così si prova con node --test: vedi ponte-ideaeventi-lib.test.ts).
 *
 * Andrea, davanti alla prima versione: «come farai apparire a schermo le
 * funzioni di IDEAgame che atterra direttamente sulla pagina del gioco con i
 * giocatori già loggati, partendo solo dall'URL? senza nessuna lettura di
 * api, mi prendi per il culo?». Aveva ragione: un iframe su un indirizzo nudo
 * atterra sulla home, senza partita e senza nessuno dentro.
 *
 * COSA FA QUESTA ROTTA. Durante un preventivo, quando la regia decide di far
 * provare il gioco alla famiglia, il gestionale chiama qui: nasce una partita
 * VERA, intestata alla festa ("18° di Marta", "Marta e Luca"), già LIVE, e
 * torna il codice. Da quel codice i telefoni che sono già in sala — di cui
 * sappiamo il nome, perché l'hanno scritto entrando — atterrano su
 * /join/<codice>?nome=<il loro> e sono dentro, senza digitare niente.
 *
 * PERCHE' NON SI RIUSA POST /events: quella chiede requireAuth, cioè una
 * persona che ha fatto login con un browser. Qui chi chiama è un programma
 * dall'altro capo di internet. Chiave condivisa, una rotta, una cosa sola.
 *
 * LA PARTITA NASCE GIA' LIVE perché i giocatori possono entrare solo in una
 * partita live (vedi routes/players.ts): crearla "draft" vorrebbe dire far
 * atterrare venti telefoni su un errore.
 *
 * NON NE APRE DUE PER LA STESSA FESTA: richiamata con lo stesso riferimento
 * torna quella che c'è già. Due partite per la stessa serata vuol dire metà
 * famiglia in una e metà nell'altra.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";

/** Una partita del ponte = una home session con gameConfig.groupKey = riferimento. */
export type PartitaPonte = { id: string; joinCode: string };

/** Persistenza minima del ponte (in produzione: home_sessions; nei test: memoria). */
export interface ArchivioPonte {
  /** La partita NON chiusa (status ≠ ended) più recente per quel riferimento. */
  trovaAperta(riferimento: string): Promise<PartitaPonte | null>;
  /** Crea la partita in lobby; null se non riesce ad allocare un codice unico. */
  crea(dati: { festa: string; riferimento: string; maxPlayers: number; expiresAt: Date }): Promise<PartitaPonte | null>;
  /** Chiude (status = ended) TUTTE le partite aperte del riferimento; ritorna quante. */
  chiudi(riferimento: string): Promise<number>;
}

const DURATA_PARTITA_MS = 6 * 60 * 60 * 1000; // ~6h

/* Confronto della chiave a TEMPO COSTANTE: non fa trapelare, dai tempi di
 * risposta, quanti caratteri iniziali combaciano. */
export function chiaveCombacia(fornita: string, attesa: string): boolean {
  const a = Buffer.from(fornita);
  const b = Buffer.from(attesa);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function maxGiocatori(attesi: unknown): number {
  const n = Number(attesi) || 20;
  return Math.min(Math.max(Math.round(n), 2), 200);
}

/**
 * Le rotte del ponte. `chiave()` si legge a ogni richiesta (ruotare il Secret
 * PONTE_IDEAEVENTI_KEY non chiede un riavvio).
 */
export function creaRouterPonteIdeaeventi(deps: { chiave: () => string; archivio: ArchivioPonte; log?: (msg: string, err: unknown) => void }): IRouter {
  const router: IRouter = Router();
  const log = deps.log ?? ((m, e) => console.error(m, e));

  function autorizzato(req: Request, res: Response): boolean {
    const attesa = deps.chiave().trim();
    if (!attesa) { res.status(503).json({ error: "Ponte non configurato: manca PONTE_IDEAEVENTI_KEY." }); return false; }
    if (!chiaveCombacia(String(req.headers["x-ponte-key"] ?? ""), attesa)) { res.status(401).json({ error: "Chiave non valida." }); return false; }
    return true;
  }

  /* /partita e /partita-home: UN SOLO MOTORE (2026-09-29). Entrambe aprono una
   * PARTITA HOME in modalità FULL; /partita tiene anche il nome storico
   * `eventoId` che Axel già legge. Idempotenti sul riferimento: NON ne aprono due
   * per la stessa festa (metà famiglia in una e metà nell'altra). */
  function apri(conEventoId: boolean, etichetta: string) {
    return async (req: Request, res: Response): Promise<void> => {
      if (!autorizzato(req, res)) return;
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const festa = String(corpo["festa"] ?? "").trim();
      const riferimento = String(corpo["riferimento"] ?? "").trim();   // "preventivo-410"
      if (!festa || !riferimento) { res.status(400).json({ error: "Servono il nome della festa e un riferimento." }); return; }
      const extra = (p: PartitaPonte) => (conEventoId ? { eventoId: p.id } : {});
      try {
        const gia = await deps.archivio.trovaAperta(riferimento);
        if (gia) { res.json({ ...extra(gia), sessionId: gia.id, codice: gia.joinCode, festa, tier: "full", giaCera: true }); return; }
        const nuova = await deps.archivio.crea({
          festa: festa.slice(0, 50), riferimento, maxPlayers: maxGiocatori(corpo["attesi"]),
          expiresAt: new Date(Date.now() + DURATA_PARTITA_MS),
        });
        if (!nuova) { res.status(500).json({ error: "Non sono riuscito ad allocare un codice." }); return; }
        res.status(201).json({ ...extra(nuova), sessionId: nuova.id, codice: nuova.joinCode, festa, tier: "full", giaCera: false });
      } catch (err) {
        log(`[ponte ideaeventi ${etichetta}]`, err);
        res.status(500).json({ error: "Errore nel creare la partita." });
      }
    };
  }

  router.post("/ponte/ideaeventi/partita", apri(true, "partita"));
  router.post("/ponte/ideaeventi/partita-home", apri(false, "partita-home"));

  // GET /ponte/ideaeventi/skill — scoperta automatica delle capacità (sola lettura).
  router.get("/ponte/ideaeventi/skill", (req, res): void => {
    if (!autorizzato(req, res)) return;
    res.json(SKILL_MANIFEST);
  });

  /** Chiudere la partita quando la regia torna alla presentazione: una partita
   *  dimenticata resta a raccogliere telefoni di gente che non gioca. Prima
   *  chiudeva solo i vecchi eventi Live (motore ritirato) e lasciava aperta la
   *  partita Home vera: la successiva /partita la ritrovava "giaCera". */
  router.post("/ponte/ideaeventi/partita/chiudi", async (req, res): Promise<void> => {
    if (!autorizzato(req, res)) return;
    const riferimento = String((req.body as Record<string, unknown> | undefined)?.["riferimento"] ?? "").trim();
    if (!riferimento) { res.status(400).json({ error: "Serve il riferimento." }); return; }
    try {
      const chiuse = await deps.archivio.chiudi(riferimento);
      res.json({ ok: true, chiuse });
    } catch (err) {
      log("[ponte ideaeventi chiudi]", err);
      res.status(500).json({ error: "Errore nel chiudere la partita." });
    }
  });

  return router;
}

/** Manifest delle capacità di IDEAgame per Axel©/IDEAeventi (scoperta automatica).
 *  Sola lettura, protetto dalla STESSA chiave del ponte (x-ponte-key) — nessuna
 *  chiave nuova. Riflette esattamente le rotte del ponte qui sopra. */
export const SKILL_MANIFEST = {
  sistema: "ideagame",
  descrizione: "Party game interattivo (TV proiettore + telefoni) per feste ed eventi.",
  versione: "1.1",
  baseUrl: "https://ideagame.it",
  nota_chiamata: "URL completo = baseUrl + percorso (il percorso include già /api). Auth: header x-ponte-key.",
  auth: { tipo: "header", header: "x-ponte-key", nota: "Stessa chiave condivisa del ponte (PONTE_IDEAEVENTI_KEY)." },
  modalita: {
    demo: "IA spenta, contenuti fissi, no adult/karaoke — vetrina gratis",
    full: "tutto sbloccato via token",
  },
  // Ogni azione è AZIONABILE dall'esterno: metodo + percorso + parametri (spec macchina
  // per l'esecutore generico di Axel) + output. Auth: header x-ponte-key. Le azioni non
  // sicure da fuori NON sono in questa lista.
  azioni: [
    {
      id: "crea_partita_full",
      descrizione: "Apre (o riusa) una partita in modalità FULL: tutto sbloccato (IA, adult, karaoke, contenuti infiniti). I telefoni entrano col codice.",
      metodo: "POST",
      path: "/api/ponte/ideaeventi/partita-home",
      percorso: "/api/ponte/ideaeventi/partita-home",
      parametri: [
        { nome: "festa", tipo: "string", obbligatorio: true, descrizione: "Nome della festa (es. '18° di Marta')" },
        { nome: "riferimento", tipo: "string", obbligatorio: true, descrizione: "Chiave idempotente = groupKey del gruppo; usa l'id preventivo/cliente lato IDEAeventi" },
        { nome: "attesi", tipo: "number", obbligatorio: false, descrizione: "Giocatori attesi (default 20, min 2, max 200)" },
      ],
      output: { sessionId: "string", codice: "string", tier: "string", giaCera: "boolean" },
      note: "Idempotente sul riferimento. groupKey=riferimento = memoria permanente del gruppo (niente turni ripetuti tra feste).",
    },
    {
      id: "crea_partita",
      descrizione: "Apre (o riusa, se già live) una partita SHOWROOM per una festa (solo giochi senza AI/adult). I telefoni entrano col codice.",
      metodo: "POST",
      path: "/api/ponte/ideaeventi/partita",
      percorso: "/api/ponte/ideaeventi/partita",
      parametri: [
        { nome: "festa", tipo: "string", obbligatorio: true, descrizione: "Nome della festa (es. '18° di Marta')" },
        { nome: "riferimento", tipo: "string", obbligatorio: true, descrizione: "Chiave idempotente (es. id preventivo)" },
        { nome: "attesi", tipo: "number", obbligatorio: false, descrizione: "Giocatori attesi (default 20, min 2, max 200)" },
      ],
      output: { eventoId: "string", codice: "string", festa: "string", giaCera: "boolean" },
      note: "Idempotente sul riferimento. I telefoni atterrano su /join/<codice>?nome=<nome>.",
    },
    {
      id: "chiudi_partita",
      descrizione: "Chiude la partita aperta di un riferimento (idempotente: richiamata dopo la chiusura risponde ok con chiuse=0).",
      metodo: "POST",
      path: "/api/ponte/ideaeventi/partita/chiudi",
      percorso: "/api/ponte/ideaeventi/partita/chiudi",
      parametri: [
        { nome: "riferimento", tipo: "string", obbligatorio: true, descrizione: "Lo stesso riferimento con cui è stata aperta" },
      ],
      output: { ok: "boolean", chiuse: "number" },
    },
    {
      id: "scopri_capacita",
      descrizione: "Questo manifest: elenco auto-aggiornato delle capacità azionabili di IDEAgame.",
      metodo: "GET",
      path: "/api/ponte/ideaeventi/skill",
      percorso: "/api/ponte/ideaeventi/skill",
      parametri: [],
      output: "manifest JSON",
    },
  ],
  giochi: [
    { slug: "quizzone",           nome: "Quizzone",            ai: true,  adult: false, showroom: false },
    { slug: "saramusica",         nome: "SaraMusica",          ai: true,  adult: false, showroom: false },
    { slug: "sfida-di-ballo",     nome: "Sfida di Ballo",      ai: false, adult: false, showroom: true },
    { slug: "gioco-delle-coppie", nome: "Gioco delle Coppie",  ai: false, adult: false, showroom: true },
    { slug: "percorso-a-risate",  nome: "Percorso a Risate",   ai: false, adult: false, showroom: true },
    { slug: "parola-alle-spalle", nome: "Parola alle Spalle",  ai: false, adult: false, showroom: true },
    { slug: "karaoke-battle",     nome: "Karaoke / Freestyle", ai: false, adult: false, showroom: true },
    { slug: "adult-only",         nome: "Adult Only (+18)",    ai: false, adult: true,  showroom: false },
  ],
  nonAncoraAzionabileDaFuori: [
    "Lettura esito/classifica di una partita per riferimento",
    "Avvio/stop di uno specifico gioco dall'esterno",
    "Scelta dei giochi abilitati per la partita",
    "Webhook a fine partita",
  ],
} as const;
